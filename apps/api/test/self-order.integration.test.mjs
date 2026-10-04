import assert from "node:assert/strict";
import test from "node:test";

import { PrismaClient } from "@prisma/client";
import { createDefaultOperationalState } from "@kiju/domain";

import selfOrderModule from "../dist/modules/self-order/self-order.service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationTest = (name, run) =>
  test(name, { skip: databaseUrl ? false : "TEST_DATABASE_URL ist nicht gesetzt." }, run);

integrationTest("öffentliche Selbstbestellung ist geschützt und idempotent", async () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const printQueue = { schedule() {} };
  const { SelfOrderService } = selfOrderModule;
  const service = new SelfOrderService(prisma, printQueue);

  try {
    await prisma.transmissionAttempt.deleteMany();
    await prisma.transactionRecord.deleteMany();
    await prisma.undoCheckpoint.deleteMany();
    await prisma.printJob.deleteMany();
    await prisma.operationalState.deleteMany();

    const state = createDefaultOperationalState();
    state.selfOrderLocations.push({
      id: "location-saal",
      name: "Saal",
      accessKey: "public-key-saal",
      sortOrder: 0,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await prisma.operationalState.create({
      data: {
        id: "operational-state",
        version: 1,
        state
      }
    });

    await assert.rejects(service.getCatalog("invalid-key"), /nicht aktiv/);
    const catalog = await service.getCatalog("public-key-saal");
    assert.equal(catalog.location.name, "Saal");
    assert.equal("users" in catalog, false);

    const request = {
      customerName: "Alex Beispiel",
      guestCount: 3,
      idempotencyKey: "create-order-0001",
      lines: [{ productId: state.products[0].id, quantity: 2 }]
    };
    const created = await service.createOrder(
      "public-key-saal",
      request,
      "integration-client"
    );
    const repeated = await service.createOrder(
      "public-key-saal",
      request,
      "integration-client"
    );
    assert.equal(repeated.orderId, created.orderId);
    assert.equal(await prisma.transactionRecord.count(), 1);
    assert.equal(await prisma.printJob.count(), 1);

    await assert.rejects(
      service.getOrderStatus(created.orderId, "wrong-token"),
      /ungültig/
    );
    const status = await service.getOrderStatus(created.orderId, created.accessToken);
    assert.equal(status.guestCount, 3);
    assert.equal(status.locationName, "Saal");

    const afterAppend = await service.appendOrder(
      created.orderId,
      created.accessToken,
      {
        idempotencyKey: "append-order-0001",
        lines: [{ productId: state.products[0].id, quantity: 1 }]
      },
      "integration-client"
    );
    assert.equal(afterAppend.items.length, 2);

    const payment = await service.callService(
      created.orderId,
      created.accessToken,
      { idempotencyKey: "payment-call-0001" },
      "integration-client"
    );
    assert.equal(payment.paymentCallStatus, "requested");
    const repeatedPayment = await service.callService(
      created.orderId,
      created.accessToken,
      { idempotencyKey: "payment-call-0002" },
      "integration-client"
    );
    assert.equal(repeatedPayment.paymentCallStatus, "requested");
  } finally {
    await prisma.$disconnect();
  }
});
