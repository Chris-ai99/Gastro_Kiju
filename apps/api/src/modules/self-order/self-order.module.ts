import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module";
import { PrintModule } from "../print/print.module";
import { SelfOrderController } from "./self-order.controller";
import { SelfOrderService } from "./self-order.service";

@Module({
  imports: [PrismaModule, PrintModule],
  controllers: [SelfOrderController],
  providers: [SelfOrderService]
})
export class SelfOrderModule {}
