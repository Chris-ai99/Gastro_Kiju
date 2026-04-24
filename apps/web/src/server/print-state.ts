import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  buildKitchenTicketPrintDocument,
  buildPrinterTestDocument,
  buildReceiptPrintDocument
} from "@kiju/print-bridge";
import { sendEscPosDocumentToNetworkPrinter } from "@kiju/print-bridge/server";
import type {
  CourseKey,
  NetworkPrinterConfig,
  PersistedPrintJob,
  PrintQueueState
} from "@kiju/domain";

import type { CreatePrintJobRequest, UpdatePrinterConfigRequest } from "../lib/print-contract";

const DEFAULT_PRINTER_CONFIG: NetworkPrinterConfig = {
  enabled: false,
  host: "",
  port: 9100,
  model: "Epson TM-T70II"
};

const courseLabels: Record<Exclude<CourseKey, "drinks">, string> = {
  starter: "Vorspeise",
  main: "Hauptspeise",
  dessert: "Nachtisch"
};

const receiptJobTitles = {
  receipt: {
    full: "Gesamtbon drucken",
    table: "Tisch-Bon drucken",
    partial: "Teil-Bon drucken"
  },
  reprint: {
    full: "Gesamtbon erneut drucken",
    table: "Tisch-Bon erneut drucken",
    partial: "Teil-Bon erneut drucken"
  }
} as const;

type PrintRuntimeState = {
  mutationQueue: Promise<unknown>;
  workerPromise: Promise<void> | null;
};

const resolveStorageBaseDir = () => {
  const normalizedCwd = process.cwd().replace(/\\/g, "/");
  return normalizedCwd.endsWith("/apps/web") ? resolve(process.cwd(), "..", "..") : process.cwd();
};

const PRINT_STATE_PATH = resolve(
  resolveStorageBaseDir(),
  process.env["KIJU_PRINT_STATE_FILE"] ?? "data/kiju-print-state.json"
);

const globalPrintRuntime = globalThis as typeof globalThis & {
  __kijuPrintRuntime?: PrintRuntimeState;
};

const printRuntime =
  globalPrintRuntime.__kijuPrintRuntime ??
  (globalPrintRuntime.__kijuPrintRuntime = {
    mutationQueue: Promise.resolve(),
    workerPromise: null
  });

const createClientId = (prefix: string) => {
  const nativeCrypto = globalThis.crypto;
  if (nativeCrypto && typeof nativeCrypto.randomUUID === "function") {
    return `${prefix}-${nativeCrypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

const nowIso = () => new Date().toISOString();

const normalizePrinterConfig = (printer?: Partial<NetworkPrinterConfig>): NetworkPrinterConfig => ({
  enabled: printer?.enabled ?? DEFAULT_PRINTER_CONFIG.enabled,
  host: printer?.host?.trim() ?? DEFAULT_PRINTER_CONFIG.host,
  port:
    typeof printer?.port === "number" && Number.isFinite(printer.port) && printer.port > 0
      ? Math.round(printer.port)
      : DEFAULT_PRINTER_CONFIG.port,
  model: printer?.model?.trim() || DEFAULT_PRINTER_CONFIG.model,
  lastTestAt: printer?.lastTestAt,
  lastError: printer?.lastError
});

const createDefaultPrintState = (): PrintQueueState => ({
  version: 1,
  updatedAt: nowIso(),
  printer: { ...DEFAULT_PRINTER_CONFIG },
  jobs: []
});

const normalizePrintJob = (job: PersistedPrintJob): PersistedPrintJob => ({
  ...job,
  title: job.title.trim() || "Druckjob",
  subtitle: job.subtitle?.trim() || undefined,
  tableId: job.tableId?.trim() || undefined,
  tableLabel: job.tableLabel?.trim() || undefined,
  sessionId: job.sessionId?.trim() || undefined,
  batchId: job.batchId?.trim() || undefined,
  status:
    job.status === "processing" ||
    job.status === "printed" ||
    job.status === "failed"
      ? job.status
      : "pending",
  attemptCount:
    typeof job.attemptCount === "number" && Number.isFinite(job.attemptCount) && job.attemptCount >= 0
      ? Math.floor(job.attemptCount)
      : 0
});

const normalizePrintState = (state: Partial<PrintQueueState>): PrintQueueState => ({
  version:
    typeof state.version === "number" && Number.isFinite(state.version) && state.version > 0
      ? Math.floor(state.version)
      : 1,
  updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : nowIso(),
  printer: normalizePrinterConfig(state.printer),
  jobs: Array.isArray(state.jobs) ? state.jobs.map(normalizePrintJob) : []
});

const persistPrintState = (state: PrintQueueState) => {
  mkdirSync(dirname(PRINT_STATE_PATH), { recursive: true });
  writeFileSync(PRINT_STATE_PATH, JSON.stringify(state, null, 2), "utf8");
};

const loadPrintState = (): PrintQueueState => {
  if (!existsSync(PRINT_STATE_PATH)) {
    const initialState = createDefaultPrintState();
    persistPrintState(initialState);
    return initialState;
  }

  try {
    const raw = readFileSync(PRINT_STATE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<PrintQueueState>;
    const normalized = normalizePrintState(parsed);
    persistPrintState(normalized);
    return normalized;
  } catch {
    const fallbackState = createDefaultPrintState();
    persistPrintState(fallbackState);
    return fallbackState;
  }
};

const withPrintStateMutation = async <T>(task: () => Promise<T> | T): Promise<T> => {
  const nextTask = printRuntime.mutationQueue.then(task, task);
  printRuntime.mutationQueue = nextTask.then(
    () => undefined,
    () => undefined
  );
  return nextTask;
};

const sortJobsForResponse = (jobs: PersistedPrintJob[]) =>
  [...jobs].sort((left, right) => {
    const updatedDelta =
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    if (updatedDelta !== 0) {
      return updatedDelta;
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });

const createReceiptJob = (request: Extract<CreatePrintJobRequest, { type: "receipt" | "reprint" }>) => {
  const tableLabel = request.tableLabel?.trim() || request.tableId?.replace("table-", "Tisch ") || "Kassenbon";
  const document = buildReceiptPrintDocument(request.receipt);

  return {
    id: createClientId("print-job"),
    type: request.type,
    status: "pending" as const,
    title: receiptJobTitles[request.type][request.receipt.mode],
    subtitle: tableLabel,
    tableId: request.tableId,
    tableLabel,
    sessionId: request.sessionId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    attemptCount: 0,
    document
  };
};

const createKitchenJob = (request: Extract<CreatePrintJobRequest, { type: "kitchen-ticket" }>) => {
  const { batch, session, table, products } = request;
  const document = buildKitchenTicketPrintDocument({
    batch,
    session,
    table,
    products
  });
  const courseLabel = courseLabels[batch.course as Exclude<CourseKey, "drinks">];

  return {
    id: createClientId("print-job"),
    type: "kitchen-ticket" as const,
    status: "pending" as const,
    title: "Küchenbon drucken",
    subtitle:
      batch.sequence > 1
        ? `${table.name} · ${courseLabel} · Nachbestellung ${batch.sequence}`
        : `${table.name} · ${courseLabel}`,
    tableId: table.id,
    tableLabel: table.name,
    sessionId: session.id,
    batchId: batch.id,
    course: batch.course,
    sequence: batch.sequence,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    attemptCount: 0,
    document
  };
};

const createTestPrintJob = (printer: NetworkPrinterConfig): PersistedPrintJob => ({
  id: createClientId("print-job"),
  type: "test-print",
  status: "pending",
  title: "Testdruck",
  subtitle: printer.host.trim() ? `${printer.host}:${printer.port}` : "Drucker ohne Host",
  createdAt: nowIso(),
  updatedAt: nowIso(),
  attemptCount: 0,
  document: buildPrinterTestDocument(printer.model, printer.host, printer.port)
});

const processNextPrintJob = async () => {
  const nextPayload = await withPrintStateMutation(() => {
    const state = loadPrintState();
    const job = state.jobs.find((entry) => entry.status === "pending");

    if (!job) {
      return null;
    }

    const attemptAt = nowIso();
    job.status = "processing";
    job.lastAttemptAt = attemptAt;
    job.updatedAt = attemptAt;
    job.attemptCount += 1;
    state.updatedAt = attemptAt;
    persistPrintState(state);

    return {
      job: structuredClone(job),
      printer: structuredClone(state.printer)
    };
  });

  if (!nextPayload) {
    return false;
  }

  const { job, printer } = nextPayload;

  try {
    await sendEscPosDocumentToNetworkPrinter(printer, job.document);
    await withPrintStateMutation(() => {
      const state = loadPrintState();
      const currentJob = state.jobs.find((entry) => entry.id === job.id);
      if (!currentJob) {
        return;
      }

      const printedAt = nowIso();
      currentJob.status = "printed";
      currentJob.printedAt = printedAt;
      currentJob.updatedAt = printedAt;
      currentJob.error = undefined;
      state.printer.lastError = undefined;
      if (job.type === "test-print") {
        state.printer.lastTestAt = printedAt;
      }
      state.updatedAt = printedAt;
      persistPrintState(state);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Druckfehler.";

    await withPrintStateMutation(() => {
      const state = loadPrintState();
      const currentJob = state.jobs.find((entry) => entry.id === job.id);
      if (!currentJob) {
        return;
      }

      const failedAt = nowIso();
      currentJob.status = "failed";
      currentJob.failedAt = failedAt;
      currentJob.updatedAt = failedAt;
      currentJob.error = message;
      state.printer.lastError = message;
      if (job.type === "test-print") {
        state.printer.lastTestAt = failedAt;
      }
      state.updatedAt = failedAt;
      persistPrintState(state);
    });
  }

  return true;
};

const schedulePrintWorker = () => {
  if (printRuntime.workerPromise) {
    return printRuntime.workerPromise;
  }

  printRuntime.workerPromise = (async () => {
    while (await processNextPrintJob()) {
      // Jobs werden sequenziell abgearbeitet.
    }
  })().finally(() => {
    printRuntime.workerPromise = null;
  });

  return printRuntime.workerPromise;
};

export const getPrintOverview = async () => {
  void schedulePrintWorker();

  return withPrintStateMutation(() => {
    const state = loadPrintState();
    return {
      printer: structuredClone(state.printer),
      jobs: sortJobsForResponse(state.jobs)
    };
  });
};

export const updatePrinterConfig = async (input: UpdatePrinterConfigRequest) => {
  const printer = await withPrintStateMutation(() => {
    const state = loadPrintState();
    state.version += 1;
    state.updatedAt = nowIso();
    state.printer = {
      ...state.printer,
      enabled: Boolean(input.enabled),
      host: input.host.trim(),
      port:
        Number.isFinite(input.port) && input.port > 0
          ? Math.round(input.port)
          : DEFAULT_PRINTER_CONFIG.port
    };
    persistPrintState(state);
    return structuredClone(state.printer);
  });

  void schedulePrintWorker();
  return printer;
};

export const createQueuedPrintJob = async (request: CreatePrintJobRequest) => {
  const result = await withPrintStateMutation(() => {
    const state = loadPrintState();
    const job = request.type === "kitchen-ticket" ? createKitchenJob(request) : createReceiptJob(request);

    state.version += 1;
    state.updatedAt = job.updatedAt;
    state.jobs.push(job);
    persistPrintState(state);

    return {
      job: structuredClone(job),
      printer: structuredClone(state.printer)
    };
  });

  void schedulePrintWorker();
  return result;
};

export const createQueuedTestPrintJob = async () => {
  const result = await withPrintStateMutation(() => {
    const state = loadPrintState();
    const job = createTestPrintJob(state.printer);

    state.version += 1;
    state.updatedAt = job.updatedAt;
    state.jobs.push(job);
    persistPrintState(state);

    return {
      job: structuredClone(job),
      printer: structuredClone(state.printer)
    };
  });

  void schedulePrintWorker();
  return result;
};

export const retryQueuedPrintJob = async (jobId: string) => {
  const result = await withPrintStateMutation(() => {
    const state = loadPrintState();
    const job = state.jobs.find((entry) => entry.id === jobId);

    if (!job) {
      return {
        ok: false as const,
        message: "Druckjob wurde nicht gefunden."
      };
    }

    job.status = "pending";
    job.failedAt = undefined;
    job.printedAt = undefined;
    job.error = undefined;
    job.updatedAt = nowIso();
    state.updatedAt = job.updatedAt;
    persistPrintState(state);

    return {
      ok: true as const,
      job: structuredClone(job)
    };
  });

  if (result.ok) {
    void schedulePrintWorker();
  }

  return result;
};
