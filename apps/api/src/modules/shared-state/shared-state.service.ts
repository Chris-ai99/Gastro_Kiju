import { Injectable } from "@nestjs/common";
import { createDefaultOperationalState, type AppState } from "@kiju/domain";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type SharedStateSnapshot = {
  version: number;
  updatedAt: string;
  state: AppState;
};

@Injectable()
export class SharedStateService {
  private readonly storagePath = resolve(
    process.cwd(),
    process.env["KIJU_SHARED_STATE_FILE"] ?? "data/kiju-shared-state.json"
  );

  private snapshot: SharedStateSnapshot;

  constructor() {
    this.snapshot = this.loadSnapshot();
  }

  getSnapshot(): SharedStateSnapshot {
    return structuredClone(this.snapshot);
  }

  replaceState(state: AppState): SharedStateSnapshot {
    this.snapshot = {
      version: this.snapshot.version + 1,
      updatedAt: new Date().toISOString(),
      state: structuredClone(state)
    };

    this.persistSnapshot();
    return this.getSnapshot();
  }

  resetState(): SharedStateSnapshot {
    this.snapshot = {
      version: this.snapshot.version + 1,
      updatedAt: new Date().toISOString(),
      state: createDefaultOperationalState()
    };

    this.persistSnapshot();
    return this.getSnapshot();
  }

  private loadSnapshot(): SharedStateSnapshot {
    const initialSnapshot: SharedStateSnapshot = {
      version: 1,
      updatedAt: new Date().toISOString(),
      state: createDefaultOperationalState()
    };

    if (!existsSync(this.storagePath)) {
      this.snapshot = initialSnapshot;
      this.persistSnapshot();
      return initialSnapshot;
    }

    try {
      const rawContent = readFileSync(this.storagePath, "utf8");
      const parsed = JSON.parse(rawContent) as SharedStateSnapshot;

      if (
        typeof parsed.version === "number" &&
        typeof parsed.updatedAt === "string" &&
        parsed.state
      ) {
        return parsed;
      }
    } catch {
      // Fall back to a fresh operational state if the file is missing or malformed.
    }

    this.snapshot = initialSnapshot;
    this.persistSnapshot();
    return initialSnapshot;
  }

  private persistSnapshot() {
    mkdirSync(dirname(this.storagePath), { recursive: true });
    writeFileSync(this.storagePath, JSON.stringify(this.snapshot, null, 2), "utf8");
  }
}
