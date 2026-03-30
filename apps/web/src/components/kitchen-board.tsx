"use client";

import Link from "next/link";
import { BellRing, CheckCheck, ChefHat, TimerReset } from "lucide-react";

import { kitchenRules, routeConfig } from "@kiju/config";
import { buildKitchenSummary } from "@kiju/domain";
import { AccordionSection, SectionCard, StatusPill } from "@kiju/ui";

import {
  courseLabels,
  getSessionForTable,
  resolveCourseStatus,
  useDemoApp
} from "../lib/app-state";
import { RoleSwitchPopover } from "./role-switch-popover";
import { RouteGuard } from "./route-guard";

const statusTone: Record<string, "navy" | "amber" | "red" | "green" | "slate"> = {
  "not-recorded": "slate",
  skipped: "slate",
  blocked: "red",
  countdown: "amber",
  ready: "green",
  completed: "navy"
};

export const KitchenBoard = () => {
  const { state, unreadNotifications, actions, currentUser } = useDemoApp();

  return (
    <RouteGuard allowedRoles={["kitchen", "admin"]}>
      <main className="kiju-page">
        <header className="kiju-topbar">
          <div>
            <span className="kiju-eyebrow">Küchenmonitor</span>
            <h1>Feste 7-Spalten-Produktion für alle Tische.</h1>
            <p>
              Von links nach rechts immer Tisch 1 bis 7, von oben nach unten Vorspeise,
              Hauptspeise, Nachtisch, Getränke.
            </p>
          </div>
          <div className="kiju-topbar-actions">
            <StatusPill label={`${unreadNotifications.length} neue Meldungen`} tone="amber" />
            {currentUser?.role === "admin" ? (
              <Link href={routeConfig.waiter} className="kiju-button kiju-button--secondary">
                Zum Service
              </Link>
            ) : null}
            <RoleSwitchPopover />
          </div>
        </header>

        <SectionCard
          title="Küchenmatrix"
          eyebrow="Wave Logic"
          action={<StatusPill label={`${kitchenRules.fixedColumns} feste Spalten`} tone="navy" />}
        >
          <div className="kiju-kitchen-grid">
            {state.tables.map((table) => {
              const session = getSessionForTable(state.sessions, table.id);
              const summary = buildKitchenSummary(session, table, state.products);
              return (
                <article key={table.id} className="kiju-kitchen-column">
                  <header className="kiju-kitchen-column__header">
                    <strong>{summary.tableName}</strong>
                    <small>{table.active ? "aktiv" : "geplant"}</small>
                  </header>
                  {(["starter", "main", "dessert", "drinks"] as const).map((course) => {
                    const resolved = resolveCourseStatus(session, course);
                    const entry = summary.courses.find((item) => item.course === course)!;
                    const effectiveStatus =
                      entry.status === "countdown" ? resolved.status : entry.status;
                    return (
                      <section key={course} className="kiju-kitchen-cell">
                        <div className="kiju-kitchen-cell__header">
                          <span>{courseLabels[course]}</span>
                          <StatusPill
                            label={
                              effectiveStatus === "countdown"
                                ? `in ${resolved.minutesLeft} min`
                                : effectiveStatus === "ready"
                                  ? "bereit"
                                  : effectiveStatus === "blocked"
                                    ? "rot"
                                    : effectiveStatus === "completed"
                                      ? "fertig"
                                      : entry.label
                            }
                            tone={statusTone[effectiveStatus]}
                          />
                        </div>
                        <p>{entry.label}</p>
                        <div className="kiju-kitchen-cell__actions">
                          {entry.status === "blocked" ? (
                            <button
                              className="kiju-button kiju-button--secondary"
                              onClick={() => actions.releaseCourse(table.id, course)}
                            >
                              <TimerReset size={16} />
                              Freigeben
                            </button>
                          ) : null}
                          {effectiveStatus === "ready" || effectiveStatus === "countdown" ? (
                            <button
                              className="kiju-button kiju-button--primary"
                              onClick={() => actions.markCourseCompleted(table.id, course)}
                            >
                              <CheckCheck size={16} />
                              Als fertig markieren
                            </button>
                          ) : null}
                          {effectiveStatus === "completed" ? (
                            <div className="kiju-inline-flag">
                              <ChefHat size={16} />
                              Fertig an Service gemeldet
                            </div>
                          ) : null}
                        </div>
                      </section>
                    );
                  })}
                </article>
              );
            })}
          </div>
        </SectionCard>

        <AccordionSection title="Live-Hinweise" eyebrow="Synchronisation" defaultOpen={false}>
          {unreadNotifications.length === 0 ? (
            <p>Keine ungelesenen Hinweise.</p>
          ) : (
            unreadNotifications.slice(0, 6).map((notification) => (
              <button
                key={notification.id}
                className="kiju-notification-row"
                onClick={() => actions.markNotificationRead(notification.id)}
              >
                <BellRing size={16} />
                <div>
                  <strong>{notification.title}</strong>
                  <span>{notification.body}</span>
                </div>
              </button>
            ))
          )}
        </AccordionSection>
      </main>
    </RouteGuard>
  );
};
