import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPendingOrderSendSummary
} from "../../apps/web/src/lib/order-overview.ts";

const createItem = (patch) => ({
  id: patch.id,
  productId: patch.productId ?? patch.id,
  category: patch.category,
  quantity: patch.quantity ?? 1,
  createdAt: "2026-06-10T17:00:00.000Z",
  createdByUserId: "user-service",
  target: { type: "table" },
  modifiers: [],
  ...patch
});

const createSession = (items) => ({
  id: "session-table-1",
  tableId: "table-1",
  waiterId: "user-service",
  skippedCourses: [],
  courseTickets: {},
  receipt: {},
  status: "serving",
  items,
  payments: [],
  cancellations: [],
  kitchenTicketBatches: [],
  barTicketBatches: [],
  partyGroups: []
});

const createProducts = (items, targets = {}) =>
  items.map((item) => ({
    id: item.productId,
    name: item.productId,
    category: item.category,
    description: "",
    priceCents: 0,
    taxRate: 0,
    allergens: [],
    showInKitchen: targets[item.productId] === "kitchen",
    productionTarget:
      targets[item.productId] ?? (item.category === "drinks" ? "bar" : "kitchen"),
    modifierGroups: []
  }));

test("selects only pending drinks for the bar", () => {
  const items = [
    createItem({ id: "cola", category: "drinks", quantity: 2 }),
    createItem({
      id: "water-sent",
      category: "drinks",
      sentAt: "2026-06-10T17:01:00.000Z"
    }),
    createItem({
      id: "juice-canceled",
      category: "drinks",
      canceledAt: "2026-06-10T17:02:00.000Z"
    })
  ];
  const summary = buildPendingOrderSendSummary(createSession(items), createProducts(items));

  assert.deepEqual(summary.affectedCourses, ["drinks"]);
  assert.deepEqual(summary.targets, ["bar"]);
  assert.equal(summary.sentItemCount, 2);
  assert.deepEqual(summary.byCourse.drinks.map((item) => item.id), ["cola"]);
});

test("keeps pending kitchen courses in separate groups", () => {
  const items = [
    createItem({ id: "starter", category: "starter" }),
    createItem({ id: "main", category: "main", quantity: 2 }),
    createItem({ id: "dessert", category: "dessert" })
  ];
  const summary = buildPendingOrderSendSummary(createSession(items), createProducts(items));

  assert.deepEqual(summary.affectedCourses, ["starter", "main", "dessert"]);
  assert.deepEqual(summary.targets, ["kitchen"]);
  assert.equal(summary.byCourse.starter.length, 1);
  assert.equal(summary.byCourse.main.length, 1);
  assert.equal(summary.byCourse.dessert.length, 1);
  assert.equal(summary.sentItemCount, 4);
});

test("summarizes mixed bar and kitchen delivery without resending old items", () => {
  const items = [
    createItem({ id: "cola", category: "drinks" }),
    createItem({ id: "pizza", category: "main" }),
    createItem({
      id: "old-dessert",
      category: "dessert",
      sentAt: "2026-06-10T16:55:00.000Z"
    })
  ];
  const summary = buildPendingOrderSendSummary(createSession(items), createProducts(items));

  assert.deepEqual(summary.affectedCourses, ["drinks", "main"]);
  assert.deepEqual(summary.targets, ["bar", "kitchen"]);
  assert.equal(summary.sentItemCount, 2);
});

test("keeps service items booked without requiring confirmation", () => {
  const items = [
    createItem({ id: "bread", category: "starter", quantity: 2 }),
    createItem({ id: "dessert", category: "dessert" }),
    createItem({ id: "pizza", category: "main" })
  ];
  const summary = buildPendingOrderSendSummary(
    createSession(items),
    createProducts(items, {
      bread: "service",
      dessert: "service",
      pizza: "kitchen"
    })
  );

  assert.deepEqual(summary.affectedCourses, ["main"]);
  assert.deepEqual(summary.targets, ["kitchen"]);
  assert.equal(summary.sentItemCount, 1);
  assert.equal(summary.byCourse.starter.length, 0);
  assert.equal(summary.byCourse.dessert.length, 0);
});
