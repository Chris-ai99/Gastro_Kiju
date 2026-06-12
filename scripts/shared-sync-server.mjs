import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, resolve } from "node:path";

import { createDefaultOperationalState } from "../packages/domain/dist/index.js";

const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number(process.env.PORT ?? "4000");
const BACKUP_COUNT = 50;
const STORAGE_PATH = process.env.KIJU_SHARED_STATE_FILE
  ? resolve(process.cwd(), process.env.KIJU_SHARED_STATE_FILE)
  : resolve(
      process.cwd(),
      process.env.KIJU_DATA_DIR ?? "data",
      "kiju-shared-state.json"
    );

const createSnapshot = (version = 1) => ({
  version,
  updatedAt: new Date().toISOString(),
  state: createDefaultOperationalState()
});

const backupPathFor = (index) => `${STORAGE_PATH}.bak.${index}`;

const writeAndSyncFile = (filePath, content) => {
  const descriptor = openSync(filePath, "wx", 0o600);

  try {
    writeFileSync(descriptor, content, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
};

const rotateBackups = () => {
  if (!existsSync(STORAGE_PATH)) return;

  for (let index = BACKUP_COUNT; index >= 2; index -= 1) {
    rmSync(backupPathFor(index), { force: true });
    if (existsSync(backupPathFor(index - 1))) {
      renameSync(backupPathFor(index - 1), backupPathFor(index));
    }
  }

  const backupTempPath = `${backupPathFor(1)}.tmp-${process.pid}-${randomUUID()}`;
  try {
    writeAndSyncFile(backupTempPath, readFileSync(STORAGE_PATH, "utf8"));
    rmSync(backupPathFor(1), { force: true });
    renameSync(backupTempPath, backupPathFor(1));
  } finally {
    rmSync(backupTempPath, { force: true });
  }
};

const persistSnapshot = (snapshot, backupCurrent = true) => {
  const directoryPath = dirname(STORAGE_PATH);
  const tempPath = `${STORAGE_PATH}.tmp-${process.pid}-${randomUUID()}`;
  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;

  JSON.parse(serialized);
  mkdirSync(directoryPath, { recursive: true });

  try {
    writeAndSyncFile(tempPath, serialized);
    if (backupCurrent) {
      rotateBackups();
    }
    renameSync(tempPath, STORAGE_PATH);
  } finally {
    rmSync(tempPath, { force: true });
  }
};

const loadSnapshot = () => {
  const candidatePaths = [
    STORAGE_PATH,
    ...Array.from({ length: BACKUP_COUNT }, (_, index) => backupPathFor(index + 1))
  ];
  let foundStoredFile = false;

  for (const candidatePath of candidatePaths) {
    if (!existsSync(candidatePath)) continue;
    foundStoredFile = true;

    try {
      const parsedSnapshot = JSON.parse(readFileSync(candidatePath, "utf8"));

      if (
        typeof parsedSnapshot?.version === "number" &&
        typeof parsedSnapshot?.updatedAt === "string" &&
        parsedSnapshot?.state
      ) {
        if (candidatePath !== STORAGE_PATH) {
          if (existsSync(STORAGE_PATH)) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            renameSync(STORAGE_PATH, `${STORAGE_PATH}.corrupt-${timestamp}`);
          }
          persistSnapshot(parsedSnapshot, false);
          console.warn(`KiJu-Zustand aus Sicherung wiederhergestellt: ${candidatePath}`);
        }

        return parsedSnapshot;
      }
    } catch {
      // Try the next retained snapshot.
    }
  }

  if (foundStoredFile) {
    throw new Error(`Keine gültige Zustandsdatei oder Sicherung gefunden: ${STORAGE_PATH}`);
  }

  const initialSnapshot = createSnapshot();
  persistSnapshot(initialSnapshot, false);
  return initialSnapshot;
};

let snapshot = loadSnapshot();

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  response.end(JSON.stringify(payload));
};

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      service: "kiju-shared-sync",
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/state") {
    sendJson(response, 200, snapshot);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/state/reset") {
    const nextSnapshot = createSnapshot(snapshot.version + 1);
    persistSnapshot(nextSnapshot);
    snapshot = nextSnapshot;
    sendJson(response, 200, snapshot);
    return;
  }

  if (request.method === "PUT" && url.pathname === "/api/state") {
    const chunks = [];

    request.on("data", (chunk) => {
      chunks.push(chunk);
    });

    request.on("end", () => {
      let nextState;

      try {
        nextState = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        sendJson(response, 400, {
          ok: false,
          message: "Ungültige JSON-Nutzlast."
        });
        return;
      }

      const nextSnapshot = {
        version: snapshot.version + 1,
        updatedAt: new Date().toISOString(),
        state: nextState
      };

      try {
        persistSnapshot(nextSnapshot);
        snapshot = nextSnapshot;
        sendJson(response, 200, snapshot);
      } catch (error) {
        console.error("KiJu-Zustand konnte nicht gespeichert werden.", error);
        sendJson(response, 503, {
          ok: false,
          message: "Der Server konnte den neuen Stand nicht sicher speichern."
        });
      }
    });

    return;
  }

  sendJson(response, 404, {
    ok: false,
    message: "Route nicht gefunden"
  });
});

server.listen(PORT, HOST, () => {
  console.log(`KiJu shared sync server listening on http://${HOST}:${PORT}`);
});
