import { appendFile, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type {
  NetworkPrinterConfig,
  PersistedPrintJob
} from "@kiju/domain";
import {
  buildEscPosDocumentBuffer,
  probeNetworkPrinter,
  sendEscPosDocumentToNetworkPrinter
} from "@kiju/print-bridge/server";
import {
  probeWindowsPrinter,
  sendRawEscPosToWindowsPrinter
} from "./windows-spooler";

type BridgeConfig = {
  serverUrl: string;
  token: string;
  pollIntervalMs?: number;
  heartbeatIntervalMs?: number;
};

type ClaimResponse = {
  ok: true;
  claimId?: string;
  printer?: Pick<
    NetworkPrinterConfig,
    "enabled" | "host" | "port" | "windowsPrinterName"
  >;
  job: PersistedPrintJob | null;
};

type HeartbeatResponse = {
  ok: true;
  printer: NetworkPrinterConfig;
};

const configPath =
  process.env["KIJU_PRINT_BRIDGE_CONFIG"]?.trim() ||
  join(
    process.env["LOCALAPPDATA"] || homedir(),
    "KiJu Gastro",
    "Print Bridge",
    "config.json"
  );
const logPath = join(dirname(configPath), "print-bridge.log");
const stopMarkerPath = `${configPath}.stop`;
const pidPath = `${configPath}.pid`;
const sleep = (durationMs: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, durationMs));

const log = async (message: string) => {
  const line = `${new Date().toISOString()} ${message}\n`;
  console.log(line.trimEnd());
  await appendFile(logPath, line, "utf8").catch(() => undefined);
};

const stopRequested = async () =>
  readFile(stopMarkerPath, "utf8")
    .then(() => true)
    .catch(() => false);

const loadConfig = async (): Promise<{
  serverBase: string;
  token: string;
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
}> => {
  const raw = await readFile(configPath, "utf8");
  const config = JSON.parse(raw) as Partial<BridgeConfig>;
  if (!config.serverUrl?.trim()) {
    throw new Error("In der Konfiguration fehlt die Serveradresse.");
  }
  if (!config.token || config.token.trim().length < 64) {
    throw new Error("Der Druckbrückenschlüssel muss mindestens 64 Zeichen lang sein.");
  }

  const parsedUrl = new URL(config.serverUrl.trim());
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (
    (parsedUrl.protocol !== "https:" &&
      !(parsedUrl.protocol === "http:" && localHosts.has(parsedUrl.hostname))) ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.search ||
    parsedUrl.hash ||
    parsedUrl.pathname.replace(/\/+$/, "").endsWith("/api")
  ) {
    throw new Error(
      "Die Serveradresse muss HTTPS verwenden und darf keinen /api-Pfad oder Zugangsdaten enthalten."
    );
  }

  return {
    serverBase: `${parsedUrl.origin}${parsedUrl.pathname.replace(/\/+$/, "")}`,
    token: config.token.trim(),
    pollIntervalMs: Math.max(1000, Math.min(config.pollIntervalMs ?? 2000, 10000)),
    heartbeatIntervalMs: Math.max(
      5000,
      Math.min(config.heartbeatIntervalMs ?? 15000, 60000)
    )
  };
};

const requestJson = async <T>(
  config: { serverBase: string; token: string },
  path: string,
  init?: RequestInit
): Promise<T> => {
  const response = await fetch(
    `${config.serverBase}/api/print/bridge${path}`,
    {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${config.token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {})
      }
    }
  );
  const body = await response.text();
  let payload: unknown;
  try {
    payload = body ? JSON.parse(body) : undefined;
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : response.statusText;
    throw new Error(`Serverantwort ${response.status}: ${message}`);
  }
  if (!payload) throw new Error("Der Server hat keine gültige Antwort gesendet.");
  return payload as T;
};

const run = async () => {
  const config = await loadConfig();
  await writeFile(pidPath, `${process.pid}\n`, "utf8");

  let stopping = false;
  let nextHeartbeatAt = 0;
  let nextPrinterProbeAt = 0;
  let retryDelayMs = 2000;
  let lastMode = "";
  let lastProbeTarget = "";
  let printer: NetworkPrinterConfig | undefined;
  let printerReachable = false;
  let lastPrinterProbeAt = 0;
  process.once("SIGINT", () => {
    stopping = true;
  });
  process.once("SIGTERM", () => {
    stopping = true;
  });

  try {
    await log("Druckbrücke gestartet.");

    while (!stopping && !(await stopRequested())) {
      try {
        if (Date.now() >= nextHeartbeatAt) {
          const heartbeat = await requestJson<HeartbeatResponse>(
            config,
            "/heartbeat",
            { method: "POST" }
          );
          printer = heartbeat.printer;
          nextHeartbeatAt = Date.now() + config.heartbeatIntervalMs;
          if (printer.connectionMode !== lastMode) {
            lastMode = printer.connectionMode ?? "server";
            await log(`Serververbindung aktiv; Druckweg: ${lastMode}.`);
          }

          if (printer.connectionMode === "local-bridge" && printer.enabled) {
            const windowsPrinterName = printer.windowsPrinterName?.trim() ?? "";
            const probeTarget = windowsPrinterName
              ? `windows:${windowsPrinterName}`
              : `network:${printer.host.trim()}:${printer.port}`;
            if (probeTarget !== lastProbeTarget) {
              printerReachable = false;
              lastPrinterProbeAt = 0;
              nextPrinterProbeAt = 0;
            }
            if (Date.now() >= nextPrinterProbeAt) {
              let probeError: string | undefined;
              try {
                if (windowsPrinterName) {
                  await probeWindowsPrinter(windowsPrinterName);
                } else {
                  await probeNetworkPrinter(printer);
                }
                printerReachable = true;
                await log(
                  windowsPrinterName
                    ? `Druck-PC online; Windows-Drucker „${windowsPrinterName}“ erreichbar.`
                    : "Druck-PC online; TCP-Verbindung zum Drucker erreichbar."
                );
              } catch (error) {
                printerReachable = false;
                probeError =
                  error instanceof Error
                    ? error.message
                    : "Der Netzwerkdrucker ist im Standortnetz nicht erreichbar.";
                await log(`Druck-PC online; Drucker im Standortnetz nicht erreichbar: ${probeError}`);
              }
              lastProbeTarget = probeTarget;
              lastPrinterProbeAt = Date.now();
              nextPrinterProbeAt = lastPrinterProbeAt + 15000;
              const updated = await requestJson<HeartbeatResponse>(
                config,
                "/heartbeat",
                {
                  method: "POST",
                  body: JSON.stringify({
                    printerReachable,
                    ...(probeError ? { printerError: probeError } : {})
                  })
                }
              );
              printer = updated.printer;
            }
          } else {
            printerReachable = false;
            lastProbeTarget = "";
            nextPrinterProbeAt = 0;
            lastPrinterProbeAt = 0;
          }
        }

        if (
          !printer ||
          !printer.enabled ||
          printer.connectionMode !== "local-bridge" ||
          !printerReachable ||
          Date.now() - lastPrinterProbeAt >= 45000
        ) {
          await sleep(config.pollIntervalMs);
          continue;
        }

        const claimed = await requestJson<ClaimResponse>(config, "/jobs/next");
        retryDelayMs = 2000;
        if (!claimed.job) {
          await sleep(config.pollIntervalMs);
          continue;
        }

        if (!claimed.claimId || !claimed.printer) {
          throw new Error("Der Server hat keinen vollständigen Druckauftrag reserviert.");
        }
        const claimId = claimed.claimId;
        const claimedPrinter = claimed.printer;
        const job = claimed.job;
        await log(`Druckauftrag ${job.id} wird verarbeitet.`);
        let success = false;
        let error: string | undefined;
        try {
          if (claimedPrinter.windowsPrinterName?.trim()) {
            const rawDocument = buildEscPosDocumentBuffer(job.document);
            await sendRawEscPosToWindowsPrinter(
              claimedPrinter.windowsPrinterName,
              rawDocument
            );
          } else {
            await sendEscPosDocumentToNetworkPrinter(claimedPrinter, job.document);
          }
          success = true;
        } catch (printError) {
          error =
            printError instanceof Error
              ? printError.message
              : "Unbekannter lokaler Druckfehler.";
        }

        await requestJson(config, "/jobs/result", {
          method: "POST",
          body: JSON.stringify({ jobId: job.id, claimId, success, error })
        });
        await log(
          success
            ? `Druckauftrag ${job.id} wurde gedruckt.`
            : `Druckauftrag ${job.id} ist fehlgeschlagen: ${error}`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await log(`Verbindung oder Verarbeitung fehlgeschlagen: ${message}`);
        printerReachable = false;
        lastPrinterProbeAt = 0;
        nextPrinterProbeAt = 0;
        await sleep(retryDelayMs);
        retryDelayMs = Math.min(retryDelayMs * 2, 30000);
        nextHeartbeatAt = 0;
      }
    }

    await log("Druckbrücke beendet.");
  } finally {
    const runningPid = await readFile(pidPath, "utf8").catch(() => "");
    if (runningPid.trim() === String(process.pid)) {
      await rm(pidPath, { force: true });
    }
  }
};

run().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  await log(`Start fehlgeschlagen: ${message}`);
  process.exitCode = 1;
});
