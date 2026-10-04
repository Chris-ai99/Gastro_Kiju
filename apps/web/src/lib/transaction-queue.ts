"use client";

import type {
  CriticalTransactionConfirmation,
  CriticalTransactionRequest
} from "@kiju/domain";

const DATABASE_NAME = "kiju-secure-transmissions-v1";
const DATABASE_VERSION = 1;
const STORE_NAME = "transactions";
const REQUEST_TIMEOUT_MS = 8000;

export const transactionRetryDelaysMs = [
  1000,
  2000,
  5000,
  10000,
  30000,
  60000,
  60000,
  60000
] as const;

export type PendingTransactionStatus =
  | "pending"
  | "sending"
  | "failed";

export type PendingTransaction = {
  transactionId: string;
  request: CriticalTransactionRequest;
  status: PendingTransactionStatus;
  attemptCount: number;
  createdAt: string;
  queuedAt: number;
  nextAttemptAt: number;
  lastAttemptAt?: string;
  lastError?: string;
  lastStatusCode?: number;
};

export type TransactionSendResult =
  | {
      ok: true;
      confirmation: CriticalTransactionConfirmation;
    }
  | {
      ok: false;
      transient: boolean;
      statusCode?: number;
      message: string;
    };

const memoryFallback = new Map<string, PendingTransaction>();
let lastQueueOrder = 0;

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB ist auf diesem Gerät nicht verfügbar."));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: "transactionId"
        });
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB konnte nicht geöffnet werden."));
  });

const runStoreRequest = async <T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
) => {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Lokale Warteschlange konnte nicht aktualisiert werden."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(
        transaction.error ??
          new Error("Lokale Warteschlange konnte nicht gespeichert werden.")
      );
    };
  });
};

export const listPendingTransactions = async (): Promise<
  PendingTransaction[]
> => {
  try {
    const entries = await runStoreRequest<PendingTransaction[]>(
      "readonly",
      (store) => store.getAll()
    );
    return entries.sort((left, right) =>
      (left.queuedAt ?? Date.parse(left.createdAt)) -
      (right.queuedAt ?? Date.parse(right.createdAt))
    );
  } catch {
    return [...memoryFallback.values()].sort((left, right) =>
      (left.queuedAt ?? Date.parse(left.createdAt)) -
      (right.queuedAt ?? Date.parse(right.createdAt))
    );
  }
};

export const savePendingTransaction = async (
  transaction: PendingTransaction
) => {
  memoryFallback.set(transaction.transactionId, structuredClone(transaction));
  try {
    await runStoreRequest<IDBValidKey>("readwrite", (store) =>
      store.put(transaction)
    );
  } catch {
    // The in-memory copy keeps the current session operational.
  }
};

export const removePendingTransaction = async (transactionId: string) => {
  memoryFallback.delete(transactionId);
  try {
    await runStoreRequest<undefined>("readwrite", (store) =>
      store.delete(transactionId)
    );
  } catch {
    // A failed removal is retried after the next reload.
  }
};

export const createPendingTransaction = (
  request: CriticalTransactionRequest
): PendingTransaction => {
  lastQueueOrder = Math.max(Date.now(), lastQueueOrder + 1);
  return {
    transactionId: request.transactionId,
    request,
    status: "pending",
    attemptCount: 0,
    createdAt: request.createdAt,
    queuedAt: lastQueueOrder,
    nextAttemptAt: Date.now()
  };
};

export const getRetryDelayMs = (attemptCount: number) =>
  transactionRetryDelaysMs[
    Math.min(
      Math.max(0, attemptCount - 1),
      transactionRetryDelaysMs.length - 1
    )
  ]!;

export const hasAutomaticRetryRemaining = (attemptCount: number) =>
  attemptCount < transactionRetryDelaysMs.length;

const resolveTransactionUrl = () => {
  const configuredBaseUrl =
    process.env["NEXT_PUBLIC_KIJU_API_BASE_URL"]?.trim();
  if (configuredBaseUrl) {
    return `${configuredBaseUrl.replace(/\/+$/, "")}/transactions`;
  }

  const basePath = process.env["NEXT_PUBLIC_BASE_PATH"]?.trim();
  const normalizedBasePath =
    basePath && basePath !== "/"
      ? `/${basePath.replace(/^\/+|\/+$/g, "")}`
      : "";
  return `${normalizedBasePath}/api/transactions`;
};

const parseResponse = async (response: Response) => {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
};

const isConfirmation = (
  value: unknown,
  transactionId: string
): value is CriticalTransactionConfirmation => {
  if (!value || typeof value !== "object") return false;
  const confirmation = value as Partial<CriticalTransactionConfirmation>;

  return (
    confirmation.success === true &&
    confirmation.status === "confirmed" &&
    confirmation.transactionId === transactionId &&
    typeof confirmation.serverId === "string" &&
    typeof confirmation.savedAt === "string" &&
    typeof confirmation.stateVersion === "number" &&
    Boolean(confirmation.state)
  );
};

export const sendPendingTransaction = async (
  transaction: PendingTransaction
): Promise<TransactionSendResult> => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(resolveTransactionUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": transaction.transactionId
      },
      body: JSON.stringify(transaction.request),
      signal: controller.signal,
      cache: "no-store"
    });
    const payload = await parseResponse(response);

    if (!response.ok) {
      const message =
        payload &&
        typeof payload === "object" &&
        typeof (payload as { message?: unknown }).message === "string"
          ? (payload as { message: string }).message
          : "Der Server hat die Übertragung abgelehnt.";
      return {
        ok: false,
        transient:
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500,
        statusCode: response.status,
        message
      };
    }

    if (!isConfirmation(payload, transaction.transactionId)) {
      return {
        ok: false,
        transient: false,
        statusCode: response.status,
        message:
          "Die Serverantwort enthält keine gültige Bestätigung für diese Transaktion."
      };
    }

    return {
      ok: true,
      confirmation: payload
    };
  } catch (error) {
    return {
      ok: false,
      transient: true,
      message:
        error instanceof DOMException && error.name === "AbortError"
          ? "Zeitüberschreitung: Es liegt noch keine Serverbestätigung vor."
          : "Der Server ist derzeit nicht erreichbar."
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
};
