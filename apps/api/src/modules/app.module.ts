import { Module } from "@nestjs/common";

import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { HealthController } from "./health.controller";
import { KitchenModule } from "./kitchen/kitchen.module";
import { EventsGateway } from "./realtime/events.gateway";

@Module({
  imports: [AuthModule, DashboardModule, KitchenModule, AdminModule],
  controllers: [HealthController],
  providers: [EventsGateway]
})
export class AppModule {}
