import { Module } from "@nestjs/common";

import { SharedStateController } from "./shared-state.controller";
import { SharedStateService } from "./shared-state.service";

@Module({
  controllers: [SharedStateController],
  providers: [SharedStateService],
  exports: [SharedStateService]
})
export class SharedStateModule {}
