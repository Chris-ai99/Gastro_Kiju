import assert from "node:assert/strict";
import test from "node:test";

import eventsModule from "../dist/api/src/modules/events/live-events.service.js";

test("Live-Events veröffentlichen Zustandsänderung und Heartbeat", async () => {
  const { LiveEventsService } = eventsModule;
  const service = new LiveEventsService();
  const received = [];
  const subscription = service.stream(5).subscribe((event) => received.push(event));

  service.publishStateChanged(7, new Date("2026-10-04T12:00:00.000Z"));
  await new Promise((resolve) => setTimeout(resolve, 20));
  subscription.unsubscribe();

  assert.equal(received[0]?.type, "state-changed");
  assert.deepEqual(received[0]?.data, {
    version: 7,
    updatedAt: "2026-10-04T12:00:00.000Z"
  });
  assert.ok(received.some((event) => event.type === "heartbeat"));
});
