import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module";
import { PrintController } from "./print.controller";
import { PrintQueueService } from "./print-queue.service";

@Module({
  imports: [PrismaModule],
  controllers: [PrintController],
  providers: [PrintQueueService],
  exports: [PrintQueueService]
})
export class PrintModule {}
