import { Controller, Sse } from "@nestjs/common";

import { LiveEventsService } from "./live-events.service";

@Controller("events")
export class LiveEventsController {
  constructor(private readonly events: LiveEventsService) {}

  @Sse()
  stream() {
    return this.events.stream();
  }
}
