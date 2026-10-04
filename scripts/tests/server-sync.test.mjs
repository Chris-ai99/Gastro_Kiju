import assert from "node:assert/strict";
import test from "node:test";

import { resolveApiUrl } from "../../packages/config/src/index.ts";

test("API-Pfade funktionieren ohne Base-Path und unter /gastro", () => {
  assert.equal(resolveApiUrl("state", ""), "/api/state");
  assert.equal(resolveApiUrl("transactions", ""), "/api/transactions");
  assert.equal(resolveApiUrl("auth/access", ""), "/api/auth/access");
  assert.equal(resolveApiUrl("events", ""), "/api/events");
  assert.equal(resolveApiUrl("state", "/gastro"), "/gastro/api/state");
  assert.equal(resolveApiUrl("transactions", "/gastro"), "/gastro/api/transactions");
  assert.equal(resolveApiUrl("auth/access", "/gastro"), "/gastro/api/auth/access");
  assert.equal(resolveApiUrl("events", "/gastro"), "/gastro/api/events");
});
