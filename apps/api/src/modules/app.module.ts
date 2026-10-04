import { Module } from "@nestjs/common";

import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { LiveEventsModule } from "./events/live-events.module";
import { HealthController } from "./health.controller";
import { KitchenModule } from "./kitchen/kitchen.module";
import { SharedStateModule } from "./shared-state/shared-state.module";
import { PrismaModule } from "./prisma/prisma.module";
import { PrintModule } from "./print/print.module";
import { TransactionsModule } from "./transactions/transactions.module";
import { SelfOrderModule } from "./self-order/self-order.module";

@Module({
  imports: [
    PrismaModule,
    LiveEventsModule,
    PrintModule,
    AuthModule,
    DashboardModule,
    KitchenModule,
    AdminModule,
    SharedStateModule,
    TransactionsModule,
    SelfOrderModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
