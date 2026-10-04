import { resolveApiUrl } from "@kiju/config";
import type {
  CriticalTransactionConfirmation,
  CriticalTransactionRequest
} from "@kiju/domain";

const REQUEST_TIMEOUT_MS = 8_000;
const CONFIRMATION_TIMEOUT_MS = 3_000;

export type ServerTransactionResult =
  | { ok: true; confirmation: CriticalTransactionConfirmation }
  | { ok: false; statusCode?: number; message: string };

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

const fetchWithTimeout = async (
  input: string,
  init: RequestInit,
  timeoutMs: number
) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export const fetchServerTransactionConfirmation = async (
  transactionId: string
): Promise<CriticalTransactionConfirmation | null> => {
  try {
    const response = await fetchWithTimeout(
      resolveApiUrl(`transactions/${encodeURIComponent(transactionId)}`),
      { method: "GET" },
      CONFIRMATION_TIMEOUT_MS
    );
    if (!response.ok) return null;
    const payload = await parseResponse(response);
    const confirmation =
      payload && typeof payload === "object"
        ? (payload as { confirmation?: unknown }).confirmation
        : null;
    return isConfirmation(confirmation, transactionId) ? confirmation : null;
  } catch {
    return null;
  }
};

export const sendServerTransaction = async (
  request: CriticalTransactionRequest
): Promise<ServerTransactionResult> => {
  const confirmOr = async (
    failure: ServerTransactionResult
  ): Promise<ServerTransactionResult> => {
    const confirmation = await fetchServerTransactionConfirmation(request.transactionId);
    return confirmation ? { ok: true, confirmation } : failure;
  };

  try {
    const response = await fetchWithTimeout(
      resolveApiUrl("transactions"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": request.transactionId
        },
        body: JSON.stringify(request)
      },
      REQUEST_TIMEOUT_MS
    );
    const payload = await parseResponse(response);

    if (!response.ok) {
      return confirmOr({
        ok: false,
        statusCode: response.status,
        message:
          payload &&
          typeof payload === "object" &&
          typeof (payload as { message?: unknown }).message === "string"
            ? (payload as { message: string }).message
            : response.status === 401
              ? "Die Betriebssitzung ist abgelaufen."
              : "Der Server hat den Vorgang abgelehnt."
      });
    }

    if (!isConfirmation(payload, request.transactionId)) {
      return confirmOr({
        ok: false,
        statusCode: response.status,
        message: "Der Server hat keine gültige Bestätigung zurückgegeben."
      });
    }
    return { ok: true, confirmation: payload };
  } catch {
    const confirmation = await fetchServerTransactionConfirmation(request.transactionId);
    if (confirmation) return { ok: true, confirmation };
    return {
      ok: false,
      message:
        "Der Server ist nicht erreichbar oder hat den Vorgang nicht bestätigt. Bitte erneut versuchen."
    };
  }
};
