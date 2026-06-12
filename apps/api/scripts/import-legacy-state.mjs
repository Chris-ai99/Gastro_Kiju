import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Prisma, PrismaClient } from "@prisma/client";
import { normalizeOperationalState } from "../../../packages/domain/dist/index.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDir, "..", "..", "..");
const statePath = resolve(
  repositoryRoot,
  process.env.KIJU_SHARED_STATE_FILE || "data/kiju-shared-state.json"
);
const printPath = resolve(
  repositoryRoot,
  process.env.KIJU_PRINT_STATE_FILE || "data/kiju-print-state.json"
);
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = resolve(
  repositoryRoot,
  process.env.KIJU_MIGRATION_BACKUP_DIR ||
    `backups/legacy-migration-${timestamp}`
);
const prisma = new PrismaClient();
const asJson = (value) => value;
const hashRequest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const parseDate = (value) => {
  const date = typeof value === "string" ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : undefined;
};

const readJson = async (path, required) => {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (!required && error?.code === "ENOENT") return null;
    throw new Error(`JSON-Datei konnte nicht gelesen werden: ${path}`, {
      cause: error
    });
  }
};

try {
  const [stateCount, transactionCount, printJobCount, printerConfigCount] =
    await Promise.all([
      prisma.operationalState.count(),
      prisma.transactionRecord.count(),
      prisma.printJob.count(),
      prisma.printerConfig.count()
    ]);

  if (stateCount + transactionCount + printJobCount + printerConfigCount > 0) {
    throw new Error(
      "Import abgebrochen: Die PostgreSQL-Zieldatenbank ist nicht leer."
    );
  }

  const legacyState = normalizeOperationalState(
    await readJson(statePath, true)
  );
  const legacyPrintState = await readJson(printPath, false);

  await mkdir(backupDir, { recursive: true });
  await copyFile(statePath, resolve(backupDir, "kiju-shared-state.json"));
  if (legacyPrintState) {
    await copyFile(printPath, resolve(backupDir, "kiju-print-state.json"));
  }

  await prisma.$transaction(
    async (database) => {
      await database.operationalState.create({
        data: {
          id: "operational-state",
          version: 1,
          state: asJson(legacyState)
        }
      });

      if (legacyPrintState?.printer) {
        await database.printerConfig.create({
          data: {
            id: "network-printer",
            config: asJson(legacyPrintState.printer)
          }
        });
      }

      for (const job of legacyPrintState?.jobs ?? []) {
        if (!job?.id || !job?.document) continue;
        const request = { type: "legacy-document", job };
        await database.printJob.create({
          data: {
            id: job.id,
            transactionId: `legacy-import-${job.id}`,
            requestHash: hashRequest(request),
            request: asJson(request),
            status:
              job.status === "processing" ? "pending" : job.status || "pending",
            attemptCount:
              Number.isFinite(job.attemptCount) && job.attemptCount >= 0
                ? Math.floor(job.attemptCount)
                : 0,
            lastAttemptAt: parseDate(job.lastAttemptAt),
            printedAt: parseDate(job.printedAt),
            failedAt: parseDate(job.failedAt),
            error: typeof job.error === "string" ? job.error : undefined,
            createdAt: parseDate(job.createdAt) ?? new Date(),
            updatedAt: parseDate(job.updatedAt) ?? new Date()
          }
        });
      }
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 120_000
    }
  );

  console.log(
    `Import abgeschlossen. Sicherung: ${backupDir}. ` +
      `${legacyPrintState?.jobs?.length ?? 0} Druckjobs übernommen.`
  );
} finally {
  await prisma.$disconnect();
}
