import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { createDefaultOperationalState } from "../packages/domain/dist/index.js";

const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number(process.env.PORT ?? "4000");
const STORAGE_PATH = resolve(process.cwd(), "data/kiju-shared-state.json");

const createSnapshot = (version = 1) => ({
  version,
  updatedAt: new Date().toISOString(),
  state: createDefaultOperationalState()
});

const persistSnapshot = (snapshot) => {
  mkdirSync(dirname(STORAGE_PATH), { recursive: true });
  writeFileSync(STORAGE_PATH, JSON.stringify(snapshot, null, 2), "utf8");
};

const loadSnapshot = () => {
  if (!existsSync(STORAGE_PATH)) {
    const initialSnapshot = createSnapshot();
    persistSnapshot(initialSnapshot);
    return initialSnapshot;
  }

  try {
    const rawContent = readFileSync(STORAGE_PATH, "utf8");
    const parsedSnapshot = JSON.parse(rawContent);

    if (
      typeof parsedSnapshot?.version === "number" &&
      typeof parsedSnapshot?.updatedAt === "string" &&
      parsedSnapshot?.state
    ) {
      return parsedSnapshot;
    }
  } catch {
    // Fall through to a fresh snapshot if the file is unreadable.
  }

  const fallbackSnapshot = createSnapshot();
  persistSnapshot(fallbackSnapshot);
  return fallbackSnapshot;
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
    snapshot = createSnapshot(snapshot.version + 1);
    persistSnapshot(snapshot);
    sendJson(response, 200, snapshot);
    return;
  }

  if (request.method === "PUT" && url.pathname === "/api/state") {
    const chunks = [];

    request.on("data", (chunk) => {
      chunks.push(chunk);
    });

    request.on("end", () => {
      try {
        const nextState = JSON.parse(Buffer.concat(chunks).toString("utf8"));

        snapshot = {
          version: snapshot.version + 1,
          updatedAt: new Date().toISOString(),
          state: nextState
        };

        persistSnapshot(snapshot);
        sendJson(response, 200, snapshot);
      } catch {
        sendJson(response, 400, {
          ok: false,
          message: "Ungueltige JSON-Nutzlast"
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
