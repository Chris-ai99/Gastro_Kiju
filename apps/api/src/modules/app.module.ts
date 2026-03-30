import { Module } from "@nestjs/common";

import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { HealthController } from "./health.controller";
import { KitchenModule } from "./kitchen/kitchen.module";
import { EventsGateway } from "./realtime/events.gateway";
import { SharedStateModule } from "./shared-state/shared-state.module";

@Module({
  imports: [AuthModule, DashboardModule, KitchenModule, AdminModule, SharedStateModule],
  controllers: [HealthController],
  providers: [EventsGateway]
})
export class AppModule {}
