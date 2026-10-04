import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post
} from "@nestjs/common";
import type { CriticalTransactionRequest } from "@kiju/domain";

import { TransactionsService } from "./transactions.service";

const isTransactionRequest = (
  value: unknown
): value is CriticalTransactionRequest => {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<CriticalTransactionRequest>;

  return (
    typeof request.transactionId === "string" &&
    request.transactionId.length > 0 &&
    typeof request.deviceId === "string" &&
    request.deviceId.length > 0 &&
    typeof request.createdAt === "string" &&
    Boolean(request.operation) &&
    request.operation?.type === "state.patch" &&
    typeof request.operation.kind === "string" &&
    Array.isArray(request.operation.patches)
  );
};

@Controller("transactions")
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @HttpCode(200)
  process(@Body() body: unknown) {
    if (!isTransactionRequest(body)) {
      throw new BadRequestException("Ungültige Transaktionsanfrage.");
    }
    return this.transactionsService.process(body);
  }

  @Get(":transactionId")
  async getConfirmation(@Param("transactionId") transactionId: string) {
    const confirmation =
      await this.transactionsService.getConfirmation(transactionId);
    return {
      success: Boolean(confirmation),
      confirmation
    };
  }
}
