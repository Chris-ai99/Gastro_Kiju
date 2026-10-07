import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put
} from "@nestjs/common";
import type { NetworkPrinterConfig } from "@kiju/domain";

import { PublicEndpoint } from "../auth/public.decorator";
import { PrintQueueService } from "./print-queue.service";
import type { PrintJobRequest } from "./print.types";

const bearerToken = (authorization?: string) =>
  authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

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
    input: Pick<
      NetworkPrinterConfig,
      "enabled" | "host" | "port" | "windowsPrinterName"
    > & {
      connectionMode?: NetworkPrinterConfig["connectionMode"];
    }
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

  @Post("bridge/heartbeat")
  @PublicEndpoint()
  async bridgeHeartbeat(
    @Headers("authorization") authorization: string | undefined,
    @Body() body?: unknown
  ) {
    this.printQueue.assertBridgeToken(bearerToken(authorization));
    if (body !== undefined && (!body || typeof body !== "object")) {
      throw new BadRequestException("Der Druckerstatus ist ungültig.");
    }
    const status = body as Record<string, unknown> | undefined;
    const hasStatusFields = status && Object.keys(status).length > 0;
    if (
      hasStatusFields &&
      (typeof status["printerReachable"] !== "boolean" ||
        (status["printerError"] !== undefined &&
          typeof status["printerError"] !== "string"))
    ) {
      throw new BadRequestException("Der Druckerstatus ist ungültig.");
    }
    return this.printQueue.recordBridgeHeartbeat(
      hasStatusFields && status
        ? {
            reachable: status["printerReachable"] as boolean,
            error:
              typeof status["printerError"] === "string"
                ? status["printerError"]
                : undefined
          }
        : undefined
    );
  }

  @Get("bridge/jobs/next")
  @PublicEndpoint()
  async nextBridgeJob(@Headers("authorization") authorization?: string) {
    this.printQueue.assertBridgeToken(bearerToken(authorization));
    return this.printQueue.claimNextBridgeJob();
  }

  @Post("bridge/jobs/result")
  @PublicEndpoint()
  async bridgeJobResult(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: unknown
  ) {
    this.printQueue.assertBridgeToken(bearerToken(authorization));
    if (!body || typeof body !== "object") {
      throw new BadRequestException("Das Druckergebnis fehlt.");
    }
    const result = body as Record<string, unknown>;
    if (
      typeof result["jobId"] !== "string" ||
      typeof result["claimId"] !== "string" ||
      typeof result["success"] !== "boolean" ||
      (result["error"] !== undefined && typeof result["error"] !== "string")
    ) {
      throw new BadRequestException("Das Druckergebnis ist ungültig.");
    }
    return this.printQueue.completeBridgeJob(result["jobId"], result["claimId"], {
      success: result["success"],
      error: typeof result["error"] === "string" ? result["error"] : undefined
    });
  }
}
