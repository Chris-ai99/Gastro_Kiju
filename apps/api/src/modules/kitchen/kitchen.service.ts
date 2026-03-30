import { Injectable } from "@nestjs/common";
import { buildKitchenSummary, demoAppState, getSessionForTable } from "@kiju/domain";

@Injectable()
export class KitchenService {
  getBoard() {
    return demoAppState.tables.map((table) =>
      buildKitchenSummary(
        getSessionForTable(demoAppState.sessions, table.id),
        table,
        demoAppState.products
      )
    );
  }
}
