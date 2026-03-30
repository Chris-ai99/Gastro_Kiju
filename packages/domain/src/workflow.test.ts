import { describe, expect, it } from "vitest";

import { demoAppState } from "./demo-data";
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
});
