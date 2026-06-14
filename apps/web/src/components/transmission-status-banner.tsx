"use client";

import { RefreshCw } from "lucide-react";

import { useDemoApp } from "../lib/app-state";

export const TransmissionStatusBanner = () => {
  const { hydrated, currentUser, sharedSync, actions } = useDemoApp();

  if (!hydrated || !currentUser || sharedSync.failedCount === 0) return null;

  const label =
    sharedSync.failedCount === 1
      ? "1 Vorgang wartet auf Übertragung"
      : `${sharedSync.failedCount} Vorgänge warten auf Übertragung`;

  return (
    <aside
      className="kiju-transmission-status is-warning"
      role="status"
      aria-live="polite"
    >
      <RefreshCw size={20} />
      <div>
        <strong>{label}</strong>
        <span>Die Software bleibt nutzbar. Du kannst den Vorgang erneut senden.</span>
      </div>
      <button type="button" onClick={actions.retryPendingTransactions}>
        <RefreshCw size={16} />
        Erneut senden
      </button>
    </aside>
  );
};
