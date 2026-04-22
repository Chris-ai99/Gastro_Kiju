import { describe, expect, it } from "vitest";

import { demoAppState } from "./demo-data";
import { normalizeOperationalState } from "./runtime-state";
import {
  buildDashboardSummary,
  buildKitchenSummary,
  calculateLineItemsTotal,
  calculateOpenItemQuantity,
  calculateSessionOpenTotal,
  calculateSessionTotal,
  getCheckoutTableIds,
  getOpenTotalForTables,
  getSessionForTable
} from "./workflow";

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
