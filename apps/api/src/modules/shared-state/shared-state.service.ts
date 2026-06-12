import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  createDefaultOperationalState,
  normalizeOperationalState,
  type AppState
} from "@kiju/domain";

import { PrismaService } from "../prisma/prisma.service";

export type SharedStateSnapshot = {
  version: number;
  updatedAt: string;
  state: AppState;
};

const OPERATIONAL_STATE_ID = "operational-state";
const asJson = (value: unknown) => value as Prisma.InputJsonValue;

@Injectable()
export class SharedStateService {
  constructor(private readonly prisma: PrismaService) {}

  async getSnapshot(): Promise<SharedStateSnapshot> {
    const stored =
      (await this.prisma.operationalState.findUnique({
        where: { id: OPERATIONAL_STATE_ID }
      })) ??
      (await this.prisma.operationalState.create({
        data: {
          id: OPERATIONAL_STATE_ID,
          version: 1,
          state: asJson(createDefaultOperationalState())
        }
      }));

    return {
      version: stored.version,
      updatedAt: stored.updatedAt.toISOString(),
      state: normalizeOperationalState(stored.state as unknown as AppState)
    };
  }
}
