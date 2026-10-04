import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";

import { PublicEndpoint } from "./auth/public.decorator";
import { PrismaService } from "./prisma/prisma.service";

@Controller("health")
@PublicEndpoint()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getHealth() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        ok: false,
        service: "kiju-api",
        database: "unavailable",
        timestamp: new Date().toISOString()
      });
    }
    return {
      ok: true,
      service: "kiju-api",
      database: "available",
      timestamp: new Date().toISOString()
    };
  }
}
