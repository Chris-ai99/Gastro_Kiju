import type { CriticalTransactionRequest } from "@kiju/domain";

import {
  fetchServerTransactionConfirmation,
  sendServerTransaction
} from "./server-transaction";

export type PendingTransactionStatus = "pending" | "sending";

export type PendingTransaction = {
  transactionId: string;
  request: CriticalTransactionRequest;
  status: PendingTransactionStatus;
  queuedAt: number;
  lastAttemptAt?: string;
};

const pendingTransactions = new Map<string, PendingTransaction>();
let sequence = 0;

export const listPendingTransactions = async () =>
  [...pendingTransactions.values()]
    .map((transaction) => structuredClone(transaction))
    .sort((left, right) => left.queuedAt - right.queuedAt);

export const savePendingTransaction = async (transaction: PendingTransaction) => {
  pendingTransactions.set(transaction.transactionId, structuredClone(transaction));
};

export const removePendingTransaction = async (transactionId: string) => {
  pendingTransactions.delete(transactionId);
};

export const clearPendingTransactions = async () => {
  pendingTransactions.clear();
};

export const createPendingTransaction = (
  request: CriticalTransactionRequest
): PendingTransaction => ({
  transactionId: request.transactionId,
  request,
  status: "pending",
  queuedAt: Date.now() * 1000 + sequence++
});

export const sendPendingTransaction = async (transaction: PendingTransaction) => {
  return sendServerTransaction(transaction.request);
};

export const fetchPendingTransactionConfirmation =
  fetchServerTransactionConfirmation;
