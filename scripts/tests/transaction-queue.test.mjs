import assert from "node:assert/strict";
import test from "node:test";

import {
  createPendingTransaction,
  getRetryDelayMs,
  hasAutomaticRetryRemaining,
  sendPendingTransaction,
  transactionRetryDelaysMs
} from "../../apps/web/src/lib/transaction-queue.ts";

globalThis.window = {
  setTimeout,
  clearTimeout
};

const createRequest = (transactionId) => ({
  transactionId,
  deviceId: "test-device",
  actorId: "test-user",
  createdAt: new Date().toISOString(),
  operation: {
    kind: "settings.update",
    patches: []
  }
});

test("uses the configured retry schedule", () => {
  assert.deepEqual([...transactionRetryDelaysMs], [
    1000,
    2000,
    5000,
    10000,
    30000,
    60000,
    60000,
    60000
  ]);
  assert.equal(getRetryDelayMs(1), 1000);
  assert.equal(getRetryDelayMs(5), 30000);
  assert.equal(getRetryDelayMs(8), 60000);
});

test("stops automatic retries after eight failed attempts", () => {
  assert.equal(hasAutomaticRetryRemaining(7), true);
  assert.equal(hasAutomaticRetryRemaining(8), false);
});

test("preserves FIFO order for rapidly queued operations", () => {
  const first = createPendingTransaction(createRequest("transaction-first"));
  const second = createPendingTransaction(createRequest("transaction-second"));
  assert.ok(second.queuedAt > first.queuedAt);
});

test("classifies retryable and permanent HTTP failures", async (context) => {
  context.after(() => {
    delete globalThis.fetch;
  });
  const transaction = createPendingTransaction(
    createRequest("transaction-classification")
  );

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: "Noch nicht verfügbar" }), {
      status: 503,
      headers: { "Content-Type": "application/json" }
    });
  const retryable = await sendPendingTransaction(transaction);
  assert.equal(retryable.ok, false);
  assert.equal(retryable.transient, true);

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: "Konflikt" }), {
      status: 409,
      headers: { "Content-Type": "application/json" }
    });
  const permanent = await sendPendingTransaction(transaction);
  assert.equal(permanent.ok, false);
  assert.equal(permanent.transient, false);
});

test("accepts only the matching confirmed transaction", async (context) => {
  context.after(() => {
    delete globalThis.fetch;
  });
  const transaction = createPendingTransaction(
    createRequest("transaction-confirmed")
  );
  const state = { users: [], tables: [], products: [], sessions: [] };

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        transactionId: "another-transaction",
        serverId: "server-1",
        savedAt: new Date().toISOString(),
        status: "confirmed",
        stateVersion: 2,
        state
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  const mismatched = await sendPendingTransaction(transaction);
  assert.equal(mismatched.ok, false);
  assert.equal(mismatched.transient, false);

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        transactionId: transaction.transactionId,
        serverId: "server-1",
        savedAt: new Date().toISOString(),
        status: "confirmed",
        stateVersion: 2,
        state
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  const confirmed = await sendPendingTransaction(transaction);
  assert.equal(confirmed.ok, true);
});
