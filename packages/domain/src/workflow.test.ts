import { describe, expect, it } from "vitest";

import { demoAppState } from "./demo-data";
import { normalizeOperationalState } from "./runtime-state";
import {
  buildDashboardSummary,
  buildKitchenSummary,
  calculateSessionTotal,
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
});
