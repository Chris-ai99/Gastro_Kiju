import { describe, expect, it } from "vitest";

import { demoAppState } from "./demo-data";
import {
  applyCriticalOperation,
  createCriticalOperation,
  CriticalOperationConflictError
} from "./critical-operations";

describe("critical operations", () => {
  it("applies a generated state patch", () => {
    const next = structuredClone(demoAppState);
    next.designMode = next.designMode === "modern" ? "classic" : "modern";

    const operation = createCriticalOperation(demoAppState, next, "settings.update");

    expect(applyCriticalOperation(demoAppState, operation).designMode).toBe(next.designMode);
  });

  it("rebases changes to different identified records", () => {
    const first = structuredClone(demoAppState);
    const second = structuredClone(demoAppState);
    first.tables[0]!.name = "Terrasse";
    second.tables[1]!.name = "Nebenraum";

    const firstOperation = createCriticalOperation(demoAppState, first, "table.update");
    const secondOperation = createCriticalOperation(demoAppState, second, "table.update");
    const merged = applyCriticalOperation(
      applyCriticalOperation(demoAppState, firstOperation),
      secondOperation
    );

    expect(merged.tables[0]!.name).toBe("Terrasse");
    expect(merged.tables[1]!.name).toBe("Nebenraum");
  });

  it("rejects conflicting changes to the same value", () => {
    const first = structuredClone(demoAppState);
    const second = structuredClone(demoAppState);
    first.tables[0]!.name = "Terrasse";
    second.tables[0]!.name = "Wintergarten";

    const firstOperation = createCriticalOperation(demoAppState, first, "table.update");
    const secondOperation = createCriticalOperation(demoAppState, second, "table.update");
    const current = applyCriticalOperation(demoAppState, firstOperation);

    expect(() => applyCriticalOperation(current, secondOperation)).toThrow(
      CriticalOperationConflictError
    );
  });

  it("keeps independent item insertions from multiple devices", () => {
    const first = structuredClone(demoAppState);
    const second = structuredClone(demoAppState);
    const firstSession = first.sessions[0]!;
    const secondSession = second.sessions[0]!;
    const template = firstSession.items[0]!;

    firstSession.items.push({ ...structuredClone(template), id: "item-device-a" });
    secondSession.items.push({ ...structuredClone(template), id: "item-device-b" });

    const merged = applyCriticalOperation(
      applyCriticalOperation(
        demoAppState,
        createCriticalOperation(demoAppState, first, "order.item.add")
      ),
      createCriticalOperation(demoAppState, second, "order.item.add")
    );

    expect(merged.sessions[0]!.items.some((item) => item.id === "item-device-a")).toBe(true);
    expect(merged.sessions[0]!.items.some((item) => item.id === "item-device-b")).toBe(true);
  });
});
