"use client";

import type { PropsWithChildren } from "react";
import { RefreshCw, Server } from "lucide-react";

import { useDemoApp } from "../lib/app-state";

export const ServerConnectionBoundary = ({ children }: PropsWithChildren) => {
  const { hydrated, serverConnection, actions } = useDemoApp();

  if (!hydrated) {
    if (serverConnection.status === "offline" || serverConnection.status === "error") {
      return (
        <main className="kiju-empty-state kiju-server-gate">
          <Server size={32} />
          <h1>Server nicht erreichbar</h1>
          <p>{serverConnection.message ?? "Der zentrale Gastro-Stand konnte nicht geladen werden."}</p>
          <button className="kiju-button kiju-button--primary" type="button" onClick={actions.reconnectServer}>
            <RefreshCw size={16} />
            Erneut verbinden
          </button>
        </main>
      );
    }
    return <main className="kiju-loading">Zentraler Gastro-Stand wird geladen …</main>;
  }

  const showStatus = serverConnection.status !== "online";
  const statusLabel =
    serverConnection.status === "saving"
      ? "Speichert auf dem Server …"
      : serverConnection.status === "connecting" || serverConnection.status === "reconnecting"
        ? "Live-Verbindung wird wiederhergestellt …"
        : serverConnection.message ?? "Server nicht erreichbar. Änderung wurde nicht gespeichert.";

  return (
    <>
      {children}
      {showStatus ? (
        <aside
          className={`kiju-transmission-status${
            serverConnection.status === "error" || serverConnection.status === "offline"
              ? " is-error"
              : " is-warning"
          }`}
          role="status"
          aria-live="polite"
        >
          <Server size={12} />
          <strong>{statusLabel}</strong>
          {serverConnection.status === "error" || serverConnection.status === "offline" ? (
            <button type="button" onClick={actions.reconnectServer}>
              <RefreshCw size={11} />
              Neu verbinden
            </button>
          ) : null}
        </aside>
      ) : null}
    </>
  );
};
