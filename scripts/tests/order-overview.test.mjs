import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPendingOrderSendSummary,
  expandCheckoutUnitEntries,
  getOpenKitchenLabelUnits,
  isServiceBookedItem,
  resetKitchenItemsForReopen
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
    createItem({ id: "main", category: "main", quantity: 2 })
  ];
  const summary = buildPendingOrderSendSummary(createSession(items), createProducts(items));

  assert.deepEqual(summary.affectedCourses, ["starter", "main"]);
  assert.deepEqual(summary.targets, ["kitchen"]);
  assert.equal(summary.byCourse.starter.length, 1);
  assert.equal(summary.byCourse.main.length, 1);
  assert.equal(summary.sentItemCount, 3);
});

test("keeps desserts and the kitchen greeting booked in service", () => {
  const items = [
    createItem({ id: "custom-dessert", category: "dessert", quantity: 2 }),
    createItem({
      id: "greeting",
      productId: "starter-greeting",
      category: "starter"
    }),
    createItem({ id: "pizza", category: "main" })
  ];
  const products = createProducts(items, {
    "custom-dessert": "kitchen",
    "starter-greeting": "kitchen",
    pizza: "kitchen"
  });
  const summary = buildPendingOrderSendSummary(createSession(items), products);

  assert.equal(isServiceBookedItem(items[0], products), true);
  assert.equal(isServiceBookedItem(items[1], products), true);
  assert.deepEqual(summary.affectedCourses, ["main"]);
  assert.equal(summary.byCourse.dessert.length, 0);
  assert.equal(summary.byCourse.starter.length, 0);
  assert.equal(summary.sentItemCount, 1);
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

test("selects every still-open portion for bulk kitchen label printing", () => {
  const items = [
    createItem({
      id: "pizza-open",
      category: "main",
      quantity: 3,
      sentAt: "2026-06-10T17:01:00.000Z",
      kitchenUnitStates: [
        { status: "completed", completedAt: "2026-06-10T17:05:00.000Z" },
        { status: "in-progress", startedAt: "2026-06-10T17:04:00.000Z" },
        { status: "pending" }
      ]
    }),
    createItem({
      id: "pizza-finished",
      category: "main",
      quantity: 1,
      sentAt: "2026-06-10T17:01:00.000Z",
      preparedAt: "2026-06-10T17:05:00.000Z"
    }),
    createItem({
      id: "pizza-canceled",
      category: "main",
      quantity: 1,
      sentAt: "2026-06-10T17:01:00.000Z",
      canceledAt: "2026-06-10T17:03:00.000Z"
    }),
    createItem({
      id: "dessert-service",
      category: "dessert",
      quantity: 1
    })
  ];
  const products = createProducts(items);

  assert.deepEqual(getOpenKitchenLabelUnits(items, products), [
    { itemId: "pizza-open", unitIndex: 1 },
    { itemId: "pizza-open", unitIndex: 2 }
  ]);
});

test("resets completed and served kitchen items when an old ticket is reopened", () => {
  const items = [
    createItem({
      id: "pizza-served",
      category: "main",
      quantity: 2,
      sentAt: "2026-06-10T17:01:00.000Z",
      preparedAt: "2026-06-10T17:05:00.000Z",
      servedAt: "2026-06-10T17:06:00.000Z",
      kitchenUnitStates: [
        { status: "completed", completedAt: "2026-06-10T17:05:00.000Z" },
        { status: "completed", completedAt: "2026-06-10T17:05:00.000Z" }
      ]
    }),
    createItem({
      id: "dessert-service",
      category: "dessert",
      quantity: 1,
      preparedAt: "2026-06-10T17:05:00.000Z"
    })
  ];
  const products = createProducts(items);

  assert.deepEqual(resetKitchenItemsForReopen(items, products), ["pizza-served"]);
  assert.equal(items[0].preparedAt, undefined);
  assert.equal(items[0].servedAt, undefined);
  assert.deepEqual(items[0].kitchenUnitStates, [
    { status: "pending" },
    { status: "pending" }
  ]);
  assert.equal(items[1].preparedAt, "2026-06-10T17:05:00.000Z");
});

test("expands a multi-quantity checkout item into individual billing rows", () => {
  const item = createItem({
    id: "pizza-margherita",
    category: "main",
    quantity: 3
  });

  assert.deepEqual(
    expandCheckoutUnitEntries([{ item, openQuantity: 3, unitTotal: 700 }]).map(
      ({ unitKey, unitIndex, unitTotal }) => ({ unitKey, unitIndex, unitTotal })
    ),
    [
      { unitKey: "pizza-margherita:0", unitIndex: 0, unitTotal: 700 },
      { unitKey: "pizza-margherita:1", unitIndex: 1, unitTotal: 700 },
      { unitKey: "pizza-margherita:2", unitIndex: 2, unitTotal: 700 }
    ]
  );
});
