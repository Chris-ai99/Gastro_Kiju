import { Injectable } from "@nestjs/common";
import { buildClosedSessions, demoAppState } from "@kiju/domain";

@Injectable()
export class AdminService {
  getOverview() {
    return {
      generatedAt: new Date().toISOString(),
      users: demoAppState.users,
      products: demoAppState.products,
      tables: demoAppState.tables,
      dailyStats: demoAppState.dailyStats,
      closedSessions: buildClosedSessions(demoAppState)
    };
  }
}
