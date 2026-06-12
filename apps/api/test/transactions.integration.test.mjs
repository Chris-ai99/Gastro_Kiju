import assert from "node:assert/strict";
import test from "node:test";

import { PrismaClient } from "@prisma/client";
import {
  createCriticalOperation,
  createDefaultOperationalState
} from "@kiju/domain";

import transactionsModule from "../dist/modules/transactions/transactions.service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationTest = (name, run) =>
  test(name, { skip: databaseUrl ? false : "TEST_DATABASE_URL ist nicht gesetzt." }, run);

integrationTest("Transaktionen sind idempotent und Druckjobs atomar gespeichert", async () => {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const printQueue = { schedule() {} };
  const { TransactionsService } = transactionsModule;
  const service = new TransactionsService(prisma, printQueue);

  try {
    await prisma.transmissionAttempt.deleteMany();
    await prisma.transactionRecord.deleteMany();
    await prisma.undoCheckpoint.deleteMany();
    await prisma.printJob.deleteMany();
    await prisma.operationalState.deleteMany();

    const before = createDefaultOperationalState();
    const after = structuredClone(before);
    after.designMode = after.designMode === "modern" ? "classic" : "modern";
    const request = {
      transactionId: "integration-idempotency",
      deviceId: "integration-device",
      actorId: "integration-user",
      createdAt: new Date().toISOString(),
      operation: createCriticalOperation(before, after, "settings.update"),
      printJobs: [
        {
          transactionId: "integration-print",
          request: {
            type: "pickup-ticket",
            tableId: "table-integration",
            tableLabel: "Integration",
            pickupNumber: 1
          }
        }
      ]
    };

    const first = await service.process(request);
    const repeated = await service.process(request);
    assert.equal(repeated.serverId, first.serverId);
    assert.equal(repeated.stateVersion, first.stateVersion);
    assert.equal(await prisma.transactionRecord.count(), 1);
    assert.equal(await prisma.printJob.count(), 1);

    await assert.rejects(
      service.process({
        ...request,
        operation: {
          ...request.operation,
          kind: "state.update"
        }
      }),
      /anderen Daten/
    );
    assert.equal(await prisma.transactionRecord.count(), 1);
  } finally {
    await prisma.$disconnect();
  }
});
