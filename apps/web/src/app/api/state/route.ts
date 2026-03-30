import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { NextRequest, NextResponse } from "next/server";

import {
  createDefaultOperationalState,
  normalizeOperationalState,
  type AppState
} from "@kiju/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SharedStateSnapshot = {
  version: number;
  updatedAt: string;
  state: AppState;
};

const resolveStorageBaseDir = () => {
  const normalizedCwd = process.cwd().replace(/\\/g, "/");
  return normalizedCwd.endsWith("/apps/web") ? resolve(process.cwd(), "..", "..") : process.cwd();
};

const STORAGE_PATH = resolve(
  resolveStorageBaseDir(),
  process.env["KIJU_SHARED_STATE_FILE"] ?? "data/kiju-shared-state.json"
);

const createSnapshot = (version = 1): SharedStateSnapshot => ({
  version,
  updatedAt: new Date().toISOString(),
  state: createDefaultOperationalState()
});

const persistSnapshot = (snapshot: SharedStateSnapshot) => {
  mkdirSync(dirname(STORAGE_PATH), { recursive: true });
  writeFileSync(STORAGE_PATH, JSON.stringify(snapshot, null, 2), "utf8");
};

const loadSnapshot = (): SharedStateSnapshot => {
  const initialSnapshot = createSnapshot();

  if (!existsSync(STORAGE_PATH)) {
    persistSnapshot(initialSnapshot);
    return initialSnapshot;
  }

  try {
    const raw = readFileSync(STORAGE_PATH, "utf8");
    const parsed = JSON.parse(raw) as SharedStateSnapshot;

    if (
      typeof parsed.version === "number" &&
      typeof parsed.updatedAt === "string" &&
      parsed.state
    ) {
      return {
        ...parsed,
        state: normalizeOperationalState(parsed.state)
      };
    }
  } catch {
    // Fall back to a fresh snapshot when the persisted payload is missing or malformed.
  }

  persistSnapshot(initialSnapshot);
  return initialSnapshot;
};

let snapshot = loadSnapshot();

export async function GET() {
  snapshot = {
    ...snapshot,
    state: normalizeOperationalState(snapshot.state)
  };
  persistSnapshot(snapshot);

  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export async function PUT(request: NextRequest) {
  try {
    const nextState = (await request.json()) as AppState;

    snapshot = {
      version: snapshot.version + 1,
      updatedAt: new Date().toISOString(),
      state: normalizeOperationalState(nextState)
    };

    persistSnapshot(snapshot);

    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Ungültige JSON-Nutzlast."
      },
      {
        status: 400
      }
    );
  }
}
