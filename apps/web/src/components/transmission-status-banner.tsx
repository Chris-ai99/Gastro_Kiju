"use client";

import { CheckCircle2, CloudOff, LoaderCircle, RefreshCw } from "lucide-react";

import { useDemoApp } from "../lib/app-state";

export const TransmissionStatusBanner = () => {
  const { hydrated, sharedSync, actions } = useDemoApp();

  if (!hydrated) return null;

  const isOnline = sharedSync.status === "online";
  const isPending =
    sharedSync.status === "pending" || sharedSync.status === "connecting";
  const label = isOnline
    ? "Mit Server verbunden · vollständig bestätigt"
    : isPending
      ? `${sharedSync.pendingCount} ${
          sharedSync.pendingCount === 1 ? "Vorgang wartet" : "Vorgänge warten"
        } auf Serverbestätigung`
      : sharedSync.failedCount > 0
        ? `${sharedSync.failedCount} ${
            sharedSync.failedCount === 1
              ? "Übertragung ist fehlgeschlagen"
              : "Übertragungen sind fehlgeschlagen"
          }`
        : "Server nicht erreichbar";

  return (
    <aside
      className={`kiju-transmission-status is-${
        isOnline ? "online" : isPending ? "pending" : "error"
      }`}
      role={isOnline ? "status" : "alert"}
      aria-live="polite"
    >
      {isOnline ? (
        <CheckCircle2 size={18} />
      ) : isPending ? (
        <LoaderCircle className="kiju-transmission-status__spinner" size={18} />
      ) : (
        <CloudOff size={18} />
      )}
      <div>
        <strong>{label}</strong>
        {!isOnline && sharedSync.message ? <span>{sharedSync.message}</span> : null}
      </div>
      {!isOnline && !isPending ? (
        <button type="button" onClick={actions.retryPendingTransactions}>
          <RefreshCw size={16} />
          Erneut senden
        </button>
      ) : null}
    </aside>
  );
};
