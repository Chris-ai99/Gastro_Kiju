import { describe, expect, it } from "vitest";

import { demoAppState } from "./demo-data.ts";
import { normalizeOperationalState } from "./runtime-state.ts";
import { EXTRA_INGREDIENTS_MODIFIER_GROUP_ID } from "./types.ts";
import {
  buildDashboardSummary,
  buildKitchenSummary,
  calculateCanceledItemQuantity,
  calculateLineItemsTotal,
  calculateOpenItemQuantity,
  calculatePaidItemQuantity,
  calculateSessionBillableTotal,
  calculateSessionCanceledTotal,
  calculateSessionOpenTotal,
  calculateSessionTotal,
  calculateItemTotal,
  getCheckoutTableIds,
  getOpenTotalForTables,
  getSessionForTable
} from "./workflow.ts";

describe("domain workflow", () => {
  it("calculates the total for the seeded table 1 session", () => {
    const session = getSessionForTable(demoAppState.sessions, "table-1");

    expect(calculateSessionTotal(session, demoAppState.products)).toBe(1700);
  });

  it("builds a kitchen summary with human-readable placeholders", () => {
    const table = demoAppState.tables.find((entry) => entry.id === "table-7");
    const summary = buildKitchenSummary(undefined, table!, demoAppState.products);

    expect(summary.courses.find((course) => course.course === "starter")?.label).toBe(
      "Nicht erfasst"
    );
  });

  it("returns one card per configured table in the dashboard", () => {
    const summary = buildDashboardSummary(demoAppState);

    expect(summary).toHaveLength(7);
    expect(summary[0]?.table.name).toBe("Tisch 1");
  });

  it("migrates legacy seat ids and missing seat visibility", () => {
    const legacyState = structuredClone(demoAppState) as any;
    delete legacyState.serviceOrderMode;
    delete legacyState.tables[0]!.seats[0]!.visible;
    legacyState.sessions[0]!.items[0]!.seatId = "table-1-seat-1";
    delete legacyState.sessions[0]!.items[0]!.target;

    const normalized = normalizeOperationalState(legacyState);
    const normalizedItem = normalized.sessions[0]!.items[0]!;

    expect(normalized.serviceOrderMode).toBe("table");
    expect(normalized.tables[0]!.seats[0]!.visible).toBe(true);
    expect(normalizedItem.target).toEqual({ type: "seat", seatId: "table-1-seat-1" });
    expect("seatId" in normalizedItem).toBe(false);
  });

  it("does not rehydrate deleted seeded users during normalization", () => {
    const state = structuredClone(demoAppState);
    state.deletedUserIds = ["user-kitchen"];
    state.users = state.users.filter((user) => user.id !== "user-kitchen");

    const normalized = normalizeOperationalState(state);

    expect(normalized.deletedUserIds).toContain("user-kitchen");
    expect(normalized.users.some((user) => user.id === "user-kitchen")).toBe(false);
  });

  it("does not rehydrate deleted seeded products during normalization", () => {
    const state = structuredClone(demoAppState);
    state.deletedProductIds = ["starter-greeting"];
    state.products = state.products.filter((product) => product.id !== "starter-greeting");

    const normalized = normalizeOperationalState(state);

    expect(normalized.deletedProductIds).toContain("starter-greeting");
    expect(normalized.products.some((product) => product.id === "starter-greeting")).toBe(false);
  });

  it("migrates sent kitchen courses into kitchen ticket batches", () => {
    const legacyState = structuredClone(demoAppState) as any;
    delete legacyState.sessions[0]!.kitchenTicketBatches;

    const normalized = normalizeOperationalState(legacyState);
    const session = getSessionForTable(normalized.sessions, "table-1")!;

    expect(session.kitchenTicketBatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          course: "starter",
          itemIds: ["item-2"],
          status: "completed",
          sequence: 1
        }),
        expect.objectContaining({
          course: "main",
          itemIds: ["item-3"],
          status: "countdown",
          sequence: 1
        })
      ])
    );
  });

  it("keeps unsent follow-up items out of migrated kitchen batches", () => {
    const legacyState = structuredClone(demoAppState) as any;
    const session = legacyState.sessions[2]!;
    delete session.kitchenTicketBatches;
    session.items.push({
      id: "item-closed-follow-up",
      target: { type: "seat", seatId: "table-5-seat-1" },
      productId: "main-pizza-margherita",
      category: "main",
      quantity: 1,
      modifiers: []
    });

    const normalized = normalizeOperationalState(legacyState);
    const normalizedSession = normalized.sessions.find((entry) => entry.id === session.id)!;
    const mainBatch = normalizedSession.kitchenTicketBatches.find((batch) => batch.course === "main");

    expect(mainBatch?.itemIds).toEqual(["item-closed-2"]);
  });

  it("normalizes missing bar ticket batches to an empty list", () => {
    const legacyState = structuredClone(demoAppState) as any;
    delete legacyState.sessions[0]!.barTicketBatches;

    const normalized = normalizeOperationalState(legacyState);
    const session = getSessionForTable(normalized.sessions, "table-1")!;

    expect(session.barTicketBatches).toEqual([]);
  });

  it("creates pending kitchen unit states for sent kitchen items without progress", () => {
    const legacyState = structuredClone(demoAppState) as any;
    const item = legacyState.sessions[0]!.items[2]!;
    item.quantity = 2;
    delete item.kitchenUnitStates;
    delete item.preparedAt;

    const normalized = normalizeOperationalState(legacyState);
    const normalizedItem = getSessionForTable(normalized.sessions, "table-1")!.items.find(
      (entry) => entry.id === item.id
    )!;

    expect(normalizedItem.kitchenUnitStates).toEqual([
      { status: "pending" },
      { status: "pending" }
    ]);
  });

  it("creates completed kitchen unit states from legacy prepared items", () => {
    const legacyState = structuredClone(demoAppState) as any;
    const item = legacyState.sessions[0]!.items[1]!;
    item.quantity = 2;
    delete item.kitchenUnitStates;

    const normalized = normalizeOperationalState(legacyState);
    const normalizedItem = getSessionForTable(normalized.sessions, "table-1")!.items.find(
      (entry) => entry.id === item.id
    )!;

    expect(normalizedItem.kitchenUnitStates).toEqual([
      { status: "completed", completedAt: "2026-03-27T18:37:00.000Z" },
      { status: "completed", completedAt: "2026-03-27T18:37:00.000Z" }
    ]);
  });

  it("preserves partial kitchen unit states and pads them to the item quantity", () => {
    const legacyState = structuredClone(demoAppState) as any;
    const item = legacyState.sessions[0]!.items[2]!;
    item.quantity = 3;
    item.kitchenUnitStates = [
      { status: "in-progress", startedAt: "2026-03-27T18:45:00.000Z" },
      { status: "completed", completedAt: "2026-03-27T18:46:00.000Z" }
    ];

    const normalized = normalizeOperationalState(legacyState);
    const normalizedItem = getSessionForTable(normalized.sessions, "table-1")!.items.find(
      (entry) => entry.id === item.id
    )!;

    expect(normalizedItem.kitchenUnitStates).toEqual([
      { status: "in-progress", startedAt: "2026-03-27T18:45:00.000Z" },
      { status: "completed", completedAt: "2026-03-27T18:46:00.000Z" },
      { status: "pending" }
    ]);
  });

  it("migrates legacy extra ingredients into the global catalog and order modifiers", () => {
    const legacyState = structuredClone(demoAppState) as any;
    delete legacyState.extraIngredients;
    legacyState.products.push({
      id: "product-legacy-pizza",
      name: "Pizza Test",
      category: "main",
      description: "Pizza aus Altbestand.",
      priceCents: 900,
      taxRate: 7,
      allergens: ["Gluten", "Milch"],
      showInKitchen: true,
      productionTarget: "kitchen",
      modifierGroups: [
        {
          id: "extra-cheese",
          name: "Extras",
          required: false,
          min: 0,
          max: 2,
          options: [
            { id: "extra-cheese", name: "Extra Käse", priceDeltaCents: 120 },
            { id: "no-onion", name: "Ohne Zwiebeln", priceDeltaCents: 0 }
          ]
        }
      ]
    });

    const legacySession = structuredClone(demoAppState.sessions[0]) as any;
    legacySession.id = "session-extra-legacy";
    legacySession.tableId = "table-2";
    legacySession.items = [
      {
        id: "item-extra-legacy",
        target: { type: "table" },
        productId: "product-legacy-pizza",
        category: "main",
        quantity: 1,
        note: "Extra Käse",
        modifiers: [{ groupId: "extra-cheese", optionIds: ["extra-cheese"] }],
        sentAt: "2026-03-27T18:44:00.000Z"
      }
    ];
    legacySession.kitchenTicketBatches = [];
    legacySession.barTicketBatches = [];
    legacySession.payments = [];
    legacySession.partyGroups = [];
    legacySession.receipt = {};
    legacyState.sessions.push(legacySession);

    const normalized = normalizeOperationalState(legacyState);
    const session = getSessionForTable(normalized.sessions, "table-2")!;
    const item = session.items[0]!;
    const product = normalized.products.find((entry) => entry.id === "product-legacy-pizza")!;

    expect(normalized.extraIngredients).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "extra-cheese",
          name: "Extra Käse",
          priceDeltaCents: 120
        })
      ])
    );
    expect(item.modifiers).toEqual([
      {
        groupId: EXTRA_INGREDIENTS_MODIFIER_GROUP_ID,
        optionIds: ["extra-cheese"]
      }
    ]);
    expect(item.note).toBeUndefined();
    expect(product.supportsExtraIngredients).toBe(true);
    expect(
      product.modifierGroups.find((group) => group.id === EXTRA_INGREDIENTS_MODIFIER_GROUP_ID)
        ?.options
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "extra-cheese", priceDeltaCents: 120 })])
    );
  });

  it("derives the extra ingredient modifier group for enabled products", () => {
    const state = structuredClone(demoAppState);
    state.extraIngredients = [
      { id: "olives", name: "Oliven", priceDeltaCents: 100, active: true },
      { id: "mushrooms", name: "Champignons", priceDeltaCents: 120, active: true }
    ];
    state.products.push({
      id: "product-extra-toggle",
      name: "Pizza Spezial",
      category: "main",
      description: "Mit Extra-Zutaten-Popup.",
      priceCents: 950,
      taxRate: 7,
      allergens: ["Gluten", "Milch"],
      showInKitchen: true,
      productionTarget: "kitchen",
      modifierGroups: [],
      supportsExtraIngredients: true
    });

    const normalized = normalizeOperationalState(state);
    const product = normalized.products.find((entry) => entry.id === "product-extra-toggle")!;
    const extraGroup = product.modifierGroups.find(
      (group) => group.id === EXTRA_INGREDIENTS_MODIFIER_GROUP_ID
    );

    expect(extraGroup?.name).toBe("Extra Zutaten");
    expect(extraGroup?.options).toEqual([
      { id: "mushrooms", name: "Champignons", priceDeltaCents: 120 },
      { id: "olives", name: "Oliven", priceDeltaCents: 100 }
    ]);
  });

  it("keeps inactive extra ingredients readable and priced on existing items", () => {
    const state = structuredClone(demoAppState);
    state.extraIngredients = [
      { id: "olives", name: "Oliven", priceDeltaCents: 150, active: false }
    ];
    state.products.push({
      id: "product-extra-inactive",
      name: "Pizza Oliven",
      category: "main",
      description: "Mit vorhandenen Extras.",
      priceCents: 1000,
      taxRate: 7,
      allergens: ["Gluten", "Milch"],
      showInKitchen: true,
      productionTarget: "kitchen",
      modifierGroups: [],
      supportsExtraIngredients: true
    });

    const extraSession = structuredClone(demoAppState.sessions[0]) as any;
    extraSession.id = "session-extra-inactive";
    extraSession.tableId = "table-4";
    extraSession.items = [
      {
        id: "item-extra-inactive",
        target: { type: "table" },
        productId: "product-extra-inactive",
        category: "main",
        quantity: 1,
        modifiers: [{ groupId: EXTRA_INGREDIENTS_MODIFIER_GROUP_ID, optionIds: ["olives"] }]
      }
    ];
    extraSession.kitchenTicketBatches = [];
    extraSession.barTicketBatches = [];
    extraSession.payments = [];
    extraSession.partyGroups = [];
    extraSession.receipt = {};
    state.sessions.push(extraSession);

    const normalized = normalizeOperationalState(state);
    const session = getSessionForTable(normalized.sessions, "table-4")!;
    const product = normalized.products.find((entry) => entry.id === "product-extra-inactive")!;
    const extraGroup = product.modifierGroups.find(
      (group) => group.id === EXTRA_INGREDIENTS_MODIFIER_GROUP_ID
    );

    expect(normalized.extraIngredients).toEqual([
      { id: "olives", name: "Oliven", priceDeltaCents: 150, active: false }
    ]);
    expect(extraGroup?.options).toEqual([
      { id: "olives", name: "Oliven", priceDeltaCents: 150 }
    ]);
    expect(calculateSessionTotal(session, normalized.products)).toBe(1150);
  });

  it("does not backfill legacy drink notifications into bar ticket batches", () => {
    const legacyState = structuredClone(demoAppState) as any;
    delete legacyState.sessions[0]!.barTicketBatches;
    legacyState.notifications.unshift({
      id: "notification-legacy-drinks",
      kind: "service-drinks",
      course: "drinks",
      itemIds: ["item-1"],
      title: "Getränke an den Tisch",
      body: "Tisch 1: 2x Bier.",
      tone: "info",
      tableId: "table-1",
      createdAt: "2026-04-24T10:00:00.000Z",
      read: false
    });

    const normalized = normalizeOperationalState(legacyState);
    const session = getSessionForTable(normalized.sessions, "table-1")!;

    expect(session.barTicketBatches).toEqual([]);
    expect(
      normalized.notifications.some(
        (notification) => notification.id === "notification-legacy-drinks"
      )
    ).toBe(true);
  });

  it("calculates open totals after a partial payment", () => {
    const state = normalizeOperationalState(structuredClone(demoAppState));
    const session = getSessionForTable(state.sessions, "table-1")!;
    const item = session.items[0]!;
    const paymentLine = [{ itemId: item.id, quantity: 1 }];
    const amountCents = calculateLineItemsTotal(session, state.products, paymentLine);

    session.payments.push({
      id: "payment-test-1",
      label: "Teilzahlung",
      amountCents,
      method: "cash",
      lineItems: paymentLine,
      tableIds: ["table-1"]
    });

    expect(calculateOpenItemQuantity(session, item)).toBe(item.quantity - 1);
    expect(calculateSessionOpenTotal(session, state.products)).toBe(
      calculateSessionTotal(session, state.products) - amountCents
    );
  });

  it("reduces open quantity and totals after a partial cancellation", () => {
    const state = normalizeOperationalState(structuredClone(demoAppState));
    const session = getSessionForTable(state.sessions, "table-1")!;
    const item = session.items[0]!;

    session.cancellations.push({
      id: "cancellation-test-1",
      label: "Rechnungsstorno",
      createdAt: "2026-04-24T10:00:00.000Z",
      lineItems: [{ itemId: item.id, quantity: 1 }]
    });

    const unitPrice = Math.round(calculateItemTotal(item, state.products) / item.quantity);

    expect(calculateCanceledItemQuantity(session, item.id)).toBe(1);
    expect(calculateOpenItemQuantity(session, item)).toBe(item.quantity - 1);
    expect(calculateSessionCanceledTotal(session, state.products)).toBe(unitPrice);
    expect(calculateSessionOpenTotal(session, state.products)).toBe(
      calculateSessionTotal(session, state.products) - unitPrice
    );
  });

  it("handles payment and cancellation on the same item correctly", () => {
    const state = normalizeOperationalState(structuredClone(demoAppState));
    const session = getSessionForTable(state.sessions, "table-1")!;
    const item = session.items[0]!;
    item.quantity = 2;
    const paymentLine = [{ itemId: item.id, quantity: 1 }];
    const amountCents = calculateLineItemsTotal(session, state.products, paymentLine);

    session.payments.push({
      id: "payment-test-mixed",
      label: "Teilzahlung",
      amountCents,
      method: "cash",
      lineItems: paymentLine,
      tableIds: ["table-1"]
    });
    session.cancellations.push({
      id: "cancellation-test-mixed",
      label: "Rechnungsstorno",
      createdAt: "2026-04-24T10:05:00.000Z",
      lineItems: [{ itemId: item.id, quantity: 1 }]
    });

    expect(calculatePaidItemQuantity(session, item.id)).toBe(1);
    expect(calculateCanceledItemQuantity(session, item.id)).toBe(1);
    expect(calculateOpenItemQuantity(session, item)).toBe(item.quantity - 2);
  });

  it("allows a full payment to leave no open amount", () => {
    const state = normalizeOperationalState(structuredClone(demoAppState));
    const session = getSessionForTable(state.sessions, "table-3")!;
    const lineItems = session.items.map((item) => ({ itemId: item.id, quantity: item.quantity }));
    const amountCents = calculateLineItemsTotal(session, state.products, lineItems);

    session.payments.push({
      id: "payment-test-full",
      label: "Restzahlung",
      amountCents,
      method: "card",
      lineItems,
      tableIds: ["table-3"]
    });

    expect(calculateSessionOpenTotal(session, state.products)).toBe(0);
  });

  it("treats a fully canceled session as billable zero", () => {
    const state = normalizeOperationalState(structuredClone(demoAppState));
    const session = getSessionForTable(state.sessions, "table-3")!;

    session.cancellations.push({
      id: "cancellation-test-full",
      label: "Rechnungsstorno",
      createdAt: "2026-04-24T11:00:00.000Z",
      lineItems: session.items.map((item) => ({ itemId: item.id, quantity: item.quantity }))
    });

    expect(calculateSessionOpenTotal(session, state.products)).toBe(0);
    expect(calculateSessionBillableTotal(session, state.products)).toBe(0);
  });

  it("normalizes missing cancellations from legacy sessions", () => {
    const legacyState = structuredClone(demoAppState) as any;
    delete legacyState.sessions[0]!.cancellations;

    const normalized = normalizeOperationalState(legacyState);

    expect(normalized.sessions[0]?.cancellations).toEqual([]);
  });

  it("resolves linked tables for a shared checkout", () => {
    const state = normalizeOperationalState(structuredClone(demoAppState));
    state.linkedTableGroups = [];
    state.linkedTableGroups.push({
      id: "linked-test",
      label: "Gemeinsame Abrechnung",
      tableIds: ["table-1", "table-3"],
      active: true,
      createdAt: "2026-04-22T12:00:00.000Z"
    });

    expect(getCheckoutTableIds(state, "table-1")).toEqual(["table-1", "table-3"]);
    expect(getOpenTotalForTables(state, ["table-1", "table-3"])).toBeGreaterThan(
      calculateSessionTotal(getSessionForTable(state.sessions, "table-1"), state.products)
    );
  });
});
