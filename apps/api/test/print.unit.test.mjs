import assert from "node:assert/strict";
import test from "node:test";

import printModule from "../dist/api/src/modules/print/print.controller.js";

test("leerer erster Druckbrücken-Heartbeat wird als Lebenszeichen akzeptiert", async () => {
  const calls = [];
  const queue = {
    assertBridgeToken: (token) => calls.push({ token }),
    recordBridgeHeartbeat: (probe) => {
      calls.push({ probe });
      return { ok: true };
    }
  };
  const controller = new printModule.PrintController(queue);

  assert.deepEqual(await controller.bridgeHeartbeat("Bearer secret", {}), { ok: true });
  assert.deepEqual(calls, [
    { token: "secret" },
    { probe: undefined }
  ]);
});

test("Druckbrücken-Heartbeat lehnt ungültige Druckerstatusfelder weiter ab", async () => {
  const queue = {
    assertBridgeToken: () => {},
    recordBridgeHeartbeat: () => ({ ok: true })
  };
  const controller = new printModule.PrintController(queue);

  await assert.rejects(
    controller.bridgeHeartbeat("Bearer secret", { printerReachable: "yes" }),
    /Der Druckerstatus ist ungültig/
  );
});
