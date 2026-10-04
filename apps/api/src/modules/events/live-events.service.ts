import { Injectable, type MessageEvent } from "@nestjs/common";
import { interval, map, merge, Observable, Subject } from "rxjs";

export type StateChangedEvent = {
  version: number;
  updatedAt: string;
};

const HEARTBEAT_INTERVAL_MS = 15_000;

@Injectable()
export class LiveEventsService {
  private readonly stateChanges = new Subject<MessageEvent>();

  publishStateChanged(version: number, updatedAt = new Date()) {
    this.stateChanges.next({
      type: "state-changed",
      data: {
        version,
        updatedAt: updatedAt.toISOString()
      } satisfies StateChangedEvent
    });
  }

  stream(heartbeatIntervalMs = HEARTBEAT_INTERVAL_MS): Observable<MessageEvent> {
    const heartbeat = interval(heartbeatIntervalMs).pipe(
      map(
        () =>
          ({
            type: "heartbeat",
            data: { timestamp: new Date().toISOString() }
          }) satisfies MessageEvent
      )
    );
    return merge(this.stateChanges.asObservable(), heartbeat);
  }
}
