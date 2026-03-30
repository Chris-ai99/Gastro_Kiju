import { Controller, Get } from "@nestjs/common";

import { KitchenService } from "./kitchen.service";

@Controller("kitchen")
export class KitchenController {
  constructor(private readonly kitchenService: KitchenService) {}

  @Get("board")
  getBoard() {
    return this.kitchenService.getBoard();
  }
}
