import { Body, Controller, Get, Post, Put } from "@nestjs/common";
import type { AppState } from "@kiju/domain";

import { SharedStateService } from "./shared-state.service";

@Controller("state")
export class SharedStateController {
  constructor(private readonly sharedStateService: SharedStateService) {}

  @Get()
  getSnapshot() {
    return this.sharedStateService.getSnapshot();
  }

  @Put()
  replaceState(@Body() state: AppState) {
    return this.sharedStateService.replaceState(state);
  }

  @Post("reset")
  resetState() {
    return this.sharedStateService.resetState();
  }
}
