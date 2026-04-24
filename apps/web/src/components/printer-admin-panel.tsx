"use client";

import { useEffect, useMemo, useState } from "react";
import { Printer, RefreshCcw, RotateCcw, Save } from "lucide-react";

import type { NetworkPrinterConfig, PersistedPrintJob } from "@kiju/domain";
import { AccordionSection, StatusPill } from "@kiju/ui";

import {
  fetchPrintOverview,
  requestPrinterTestPrint,
  retryPrintJob,
  savePrinterConfig
} from "../lib/print-client";

type PrinterFeedback =
  | {
      tone: "success" | "alert" | "info";
      message: string;
    }
  | undefined;

const defaultPrinter: NetworkPrinterConfig = {
  enabled: false,
  host: "",
  port: 9100,
  model: "Epson TM-T70II"
};

const formatDateTime = (value?: string) => {
  if (!value) {
    return "Noch kein Eintrag";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
};

const jobTypeLabels: Record<PersistedPrintJob["type"], string> = {
  receipt: "Kassenbon",
  reprint: "Reprint",
  "daily-close": "Tagesabschluss",
  "kitchen-ticket": "Küchenbon",
  "test-print": "Testdruck"
};

const jobStatusTones: Record<
  PersistedPrintJob["status"],
  "navy" | "amber" | "red" | "green" | "slate"
> = {
  pending: "amber",
  processing: "navy",
  printed: "green",
  failed: "red"
};

const jobStatusLabels: Record<PersistedPrintJob["status"], string> = {
  pending: "Warteschlange",
  processing: "Wird gedruckt",
  printed: "Gedruckt",
  failed: "Fehlgeschlagen"
};

export const PrinterAdminPanel = () => {
  const [printer, setPrinter] = useState<NetworkPrinterConfig>(defaultPrinter);
  const [draft, setDraft] = useState({
    enabled: false,
    host: "",
    port: "9100"
  });
  const [jobs, setJobs] = useState<PersistedPrintJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  const [feedback, setFeedback] = useState<PrinterFeedback>();

  const refreshOverview = async (preserveFeedback = true) => {
    const overview = await fetchPrintOverview();

    if (!overview) {
      setIsLoading(false);
      if (!preserveFeedback) {
        setFeedback({
          tone: "alert",
          message: "Druckstatus konnte gerade nicht geladen werden."
        });
      }
      return;
    }

    setPrinter(overview.printer);
    if (!isDraftDirty) {
      setDraft({
        enabled: overview.printer.enabled,
        host: overview.printer.host,
        port: String(overview.printer.port)
      });
    }
    setJobs(overview.jobs);
    setIsLoading(false);
  };

  useEffect(() => {
    void refreshOverview();

    const timer = window.setInterval(() => {
      void refreshOverview();
    }, 5000);

    return () => window.clearInterval(timer);
  }, [isDraftDirty]);

  const pendingCount = useMemo(
    () => jobs.filter((job) => job.status === "pending" || job.status === "processing").length,
    [jobs]
  );
  const failedCount = useMemo(
    () => jobs.filter((job) => job.status === "failed").length,
    [jobs]
  );

  const handleSave = async () => {
    setIsSaving(true);
    const result = await savePrinterConfig({
      enabled: draft.enabled,
      host: draft.host,
      port: Number(draft.port || "9100")
    });
    setIsSaving(false);

    if (!result.ok || !result.printer) {
      setFeedback({
        tone: "alert",
        message: result.message ?? "Druckerkonfiguration konnte nicht gespeichert werden."
      });
      return;
    }

    setPrinter(result.printer);
    setDraft({
      enabled: result.printer.enabled,
      host: result.printer.host,
      port: String(result.printer.port)
    });
    setIsDraftDirty(false);
    setFeedback({
      tone: "success",
      message: "Druckerkonfiguration wurde gespeichert."
    });
    await refreshOverview();
  };

  const handleTest = async () => {
    setIsTesting(true);
    const result = await requestPrinterTestPrint();
    setIsTesting(false);

    if (!result.ok) {
      setFeedback({
        tone: "alert",
        message: result.message ?? "Testdruck konnte nicht gestartet werden."
      });
      return;
    }

    setFeedback({
      tone: "info",
      message: "Testdruck wurde in die Warteschlange gelegt."
    });
    await refreshOverview();
  };

  const handleRetry = async (jobId: string) => {
    const result = await retryPrintJob(jobId);
    if (!result.ok) {
      setFeedback({
        tone: "alert",
        message: result.message ?? "Druckjob konnte nicht erneut gesendet werden."
      });
      return;
    }

    setFeedback({
      tone: "success",
      message: "Druckjob wurde erneut in die Warteschlange gelegt."
    });
    await refreshOverview();
  };

  const isDirty =
    draft.enabled !== printer.enabled ||
    draft.host !== printer.host ||
    Number(draft.port || "9100") !== printer.port;

  return (
    <div id="drucker">
      <AccordionSection
        title="Drucker"
        eyebrow="Epson TM-T70II im Netzwerk"
        defaultOpen={false}
        className="kiju-admin-accordion"
        action={
          <>
            <StatusPill
              label={printer.enabled ? "Aktiv" : "Deaktiviert"}
              tone={printer.enabled ? "green" : "slate"}
            />
            <StatusPill
              label={`${pendingCount} offen`}
              tone={pendingCount > 0 ? "amber" : "slate"}
            />
            <StatusPill
              label={`${failedCount} Fehler`}
              tone={failedCount > 0 ? "red" : "slate"}
            />
          </>
        }
      >
        <div className="kiju-admin-layout">
          <article className="kiju-admin-panel">
            <div className="kiju-admin-row kiju-admin-row--top">
              <div className="kiju-admin-heading-stack">
                <strong>Netzwerkdrucker</strong>
                <span>Küchenbons und Kassenbons laufen über denselben Epson.</span>
              </div>
              <StatusPill label={printer.model} tone="navy" />
            </div>

            <div className="kiju-admin-row">
              <label className="kiju-checkbox-row">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, enabled: event.target.checked }));
                    setIsDraftDirty(true);
                  }}
                />
                <span>Drucker aktiv</span>
              </label>
              <label className="kiju-inline-field">
                <span>Port</span>
                <input
                  value={draft.port}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, port: event.target.value }));
                    setIsDraftDirty(true);
                  }}
                />
              </label>
            </div>

            <label className="kiju-inline-field">
              <span>IP-Adresse oder Hostname</span>
              <input
                placeholder="z. B. 192.168.178.70"
                value={draft.host}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, host: event.target.value }));
                  setIsDraftDirty(true);
                }}
              />
            </label>

            <div className="kiju-admin-meta">
              <span>Letzter Test: {formatDateTime(printer.lastTestAt)}</span>
              <span>Letzter Fehler: {printer.lastError?.trim() || "Kein Fehler gespeichert"}</span>
            </div>

            <div className="kiju-admin-action-row">
              <button
                type="button"
                className="kiju-button kiju-button--primary"
                onClick={handleSave}
                disabled={isSaving || !isDirty}
              >
                <Save size={16} />
                {isSaving ? "Speichert..." : "Speichern"}
              </button>
              <button
                type="button"
                className="kiju-button kiju-button--secondary"
                onClick={handleTest}
                disabled={isTesting || isLoading}
              >
                <Printer size={16} />
                {isTesting ? "Startet..." : "Testdruck"}
              </button>
              <button
                type="button"
                className="kiju-button kiju-button--secondary"
                onClick={() => void refreshOverview(false)}
                disabled={isLoading}
              >
                <RefreshCcw size={16} />
                Aktualisieren
              </button>
            </div>

            {feedback ? (
              <div className={`kiju-inline-panel${feedback.tone === "alert" ? " is-alert" : ""}`}>
                <span>{feedback.message}</span>
              </div>
            ) : null}
          </article>

          <div className="kiju-admin-list">
            <article className="kiju-admin-panel">
              <div className="kiju-admin-row kiju-admin-row--top">
                <div className="kiju-admin-heading-stack">
                  <strong>Druckwarteschlange</strong>
                  <span>
                    {jobs.length} {jobs.length === 1 ? "Job" : "Jobs"} gespeichert
                  </span>
                </div>
                <div className="kiju-admin-action-row">
                  <StatusPill label={`${pendingCount} offen`} tone={pendingCount > 0 ? "amber" : "slate"} />
                  <StatusPill label={`${failedCount} Fehler`} tone={failedCount > 0 ? "red" : "slate"} />
                </div>
              </div>

              {isLoading ? (
                <div className="kiju-inline-panel">
                  <span>Druckstatus wird geladen...</span>
                </div>
              ) : jobs.length === 0 ? (
                <div className="kiju-inline-panel">
                  <span>Aktuell sind noch keine Druckjobs vorhanden.</span>
                </div>
              ) : (
                jobs.slice(0, 18).map((job) => (
                  <article key={job.id} className="kiju-admin-panel">
                    <div className="kiju-admin-row kiju-admin-row--top">
                      <div className="kiju-admin-heading-stack">
                        <strong>{job.title}</strong>
                        <span>{job.subtitle ?? job.tableLabel ?? jobTypeLabels[job.type]}</span>
                      </div>
                      <div className="kiju-admin-action-row">
                        <StatusPill label={jobTypeLabels[job.type]} tone="navy" />
                        <StatusPill
                          label={jobStatusLabels[job.status]}
                          tone={jobStatusTones[job.status]}
                        />
                        {job.status === "failed" ? (
                          <button
                            type="button"
                            className="kiju-button kiju-button--secondary"
                            onClick={() => void handleRetry(job.id)}
                          >
                            <RotateCcw size={16} />
                            Erneut senden
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="kiju-admin-meta">
                      <span>Erstellt: {formatDateTime(job.createdAt)}</span>
                      <span>Zuletzt geändert: {formatDateTime(job.updatedAt)}</span>
                      <span>Versuche: {job.attemptCount}</span>
                    </div>

                    {job.error ? (
                      <div className="kiju-inline-panel is-alert">
                        <span>{job.error}</span>
                      </div>
                    ) : null}
                  </article>
                ))
              )}
            </article>
          </div>
        </div>
      </AccordionSection>
    </div>
  );
};
