import {
  Controller,
  Get,
  HttpCode,
  MethodNotAllowedException,
  Post,
  Put
} from "@nestjs/common";

import { SharedStateService } from "./shared-state.service";

@Controller("state")
export class SharedStateController {
  constructor(private readonly sharedStateService: SharedStateService) {}

  @Get()
  getSnapshot() {
    return this.sharedStateService.getSnapshot();
  }

  @Put()
  @HttpCode(405)
  replaceState() {
    throw new MethodNotAllowedException(
      "Direktes Ersetzen des Zustands ist deaktiviert. Verwende /api/transactions."
    );
  }

  @Post("reset")
  @HttpCode(405)
  resetState() {
    throw new MethodNotAllowedException(
      "Direkter Reset ist deaktiviert. Verwende eine bestätigte Transaktion."
    );
  }
}
