import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import type { NetworkPrinterConfig } from "@kiju/domain";

import { PrintQueueService } from "./print-queue.service";
import type { PrintJobRequest } from "./print.types";

@Controller("print")
export class PrintController {
  constructor(private readonly printQueue: PrintQueueService) {}

  @Get("jobs")
  async jobs() {
    return { ok: true, ...(await this.printQueue.getOverview()) };
  }

  @Post("jobs")
  async createJob(@Body() request: PrintJobRequest) {
    return { ok: true, ...(await this.printQueue.enqueue(request)) };
  }

  @Post("jobs/:jobId/retry")
  async retry(@Param("jobId") jobId: string) {
    return this.printQueue.retry(jobId);
  }

  @Get("config")
  async config() {
    return { ok: true, printer: await this.printQueue.getPrinterConfig() };
  }

  @Put("config")
  async updateConfig(
    @Body()
    input: Pick<NetworkPrinterConfig, "enabled" | "host" | "port">
  ) {
    return {
      ok: true,
      printer: await this.printQueue.updatePrinterConfig(input)
    };
  }

  @Post("test")
  async test() {
    return { ok: true, ...(await this.printQueue.enqueueTest()) };
  }
}
