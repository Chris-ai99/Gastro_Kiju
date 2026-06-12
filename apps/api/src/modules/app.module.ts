import { Module } from "@nestjs/common";

import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { HealthController } from "./health.controller";
import { KitchenModule } from "./kitchen/kitchen.module";
import { EventsGateway } from "./realtime/events.gateway";
import { SharedStateModule } from "./shared-state/shared-state.module";
import { PrismaModule } from "./prisma/prisma.module";
import { PrintModule } from "./print/print.module";
import { TransactionsModule } from "./transactions/transactions.module";

@Module({
  imports: [
    PrismaModule,
    PrintModule,
    AuthModule,
    DashboardModule,
    KitchenModule,
    AdminModule,
    SharedStateModule,
    TransactionsModule
  ],
  controllers: [HealthController],
  providers: [EventsGateway]
})
export class AppModule {}
