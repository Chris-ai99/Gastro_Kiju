"use client";

import { CloudOff, RefreshCw } from "lucide-react";

import { useDemoApp } from "../lib/app-state";

export const TransmissionStatusBanner = () => {
  const { hydrated, sharedSync, actions } = useDemoApp();

  if (!hydrated) return null;

  const isOnline = sharedSync.status === "online";
  const isPending =
    sharedSync.status === "pending" || sharedSync.status === "connecting";
  if (isOnline || isPending) return null;

  const label =
    sharedSync.failedCount > 0
      ? `${sharedSync.failedCount} ${
          sharedSync.failedCount === 1
            ? "Übertragung ist fehlgeschlagen"
            : "Übertragungen sind fehlgeschlagen"
        }`
      : "Server nicht erreichbar";

  return (
    <aside
      className="kiju-transmission-status is-error"
      role="alert"
      aria-live="assertive"
    >
      <CloudOff size={20} />
      <div>
        <strong>{label}</strong>
        {sharedSync.message ? <span>{sharedSync.message}</span> : null}
      </div>
      <button type="button" onClick={actions.retryPendingTransactions}>
        <RefreshCw size={16} />
        Erneut senden
      </button>
    </aside>
  );
};
