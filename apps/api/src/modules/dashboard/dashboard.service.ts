import { Injectable } from "@nestjs/common";
import { buildDashboardSummary, demoAppState } from "@kiju/domain";

@Injectable()
export class DashboardService {
  getOverview() {
    return {
      generatedAt: new Date().toISOString(),
      dailyStats: demoAppState.dailyStats,
      tables: buildDashboardSummary(demoAppState)
    };
  }
}
