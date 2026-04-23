"use client";

import { Bell, Clock3, Menu, MoonStar, Printer, SunMedium, UserCog, Users } from "lucide-react";
import { useRouter } from "next/navigation";

import { routeConfig } from "@kiju/config";
import type { AppNotification, Role } from "@kiju/domain";

import { useDemoApp } from "../lib/app-state";
import { useTheme } from "./theme-provider";

const roleLabels: Record<Role, string> = {
  admin: "Admin",
  waiter: "Service",
  kitchen: "Küche"
};

type ServiceHistoryEntry = {
  sessionId: string;
  tableName: string;
  closedAtLabel: string;
  closedByName: string;
  guestCountLabel: string;
  totalLabel: string;
  payments: {
    id: string;
    methodLabel: string;
    amountLabel: string;
    payerLabel: string;
    label: string;
  }[];
};

type ServiceTopbarMenuProps = {
  unreadNotifications: AppNotification[];
  onNotificationAction: (notification: AppNotification) => void;
  historyEntries: ServiceHistoryEntry[];
  onHistoryPrint: (sessionId: string) => void;
};

export const ServiceTopbarMenu = ({
  unreadNotifications,
  onNotificationAction,
  historyEntries,
  onHistoryPrint
}: ServiceTopbarMenuProps) => {
  const router = useRouter();
  const { currentUser, actions } = useDemoApp();
  const { theme, setTheme } = useTheme();

  const openLogin = () => {
    actions.logout();
    router.push(routeConfig.login);
  };

  return (
    <details className="kiju-service-menu-popover">
      <summary className="kiju-service-menu-popover__trigger">
        <Menu size={18} />
        <span>Menü</span>
        <strong>{unreadNotifications.length}</strong>
      </summary>
      <div className="kiju-service-menu-popover__panel">
        <section className="kiju-service-menu-section">
          <header>
            <strong>Hinweise</strong>
            <span>{unreadNotifications.length} offen</span>
          </header>
          {unreadNotifications.length === 0 ? (
            <div className="kiju-inline-panel">
              <span>Aktuell gibt es keine offenen Hinweise.</span>
            </div>
          ) : (
            unreadNotifications.slice(0, 8).map((notification) => (
              <article key={notification.id} className="kiju-notification-row">
                <Bell size={16} />
                <div>
                  <strong>{notification.title}</strong>
                  <span>{notification.body}</span>
                </div>
                <button
                  type="button"
                  className="kiju-button kiju-button--secondary kiju-notification-row__action"
                  onClick={() => onNotificationAction(notification)}
                >
                  {notification.kind === "service-drinks" ||
                  notification.kind === "service-course-ready"
                    ? "Annehmen"
                    : "Erledigt"}
                </button>
              </article>
            ))
          )}
        </section>

        <section className="kiju-service-menu-section">
          <header>
            <strong>Verlauf</strong>
            <span>{historyEntries.length} abgeschlossen</span>
          </header>
          {historyEntries.length === 0 ? (
            <div className="kiju-inline-panel">
              <span>Noch keine abgerechneten Tische vorhanden.</span>
            </div>
          ) : (
            <details className="kiju-service-history">
              <summary className="kiju-service-history__summary">
                <span>Abgerechnete Tische öffnen</span>
                <strong>{historyEntries.length}</strong>
              </summary>
              <div className="kiju-service-history__list">
                {historyEntries.slice(0, 12).map((entry) => (
                  <article key={entry.sessionId} className="kiju-service-history-item">
                    <div className="kiju-service-history-item__head">
                      <div>
                        <strong>{entry.tableName}</strong>
                        <span>Service: {entry.closedByName}</span>
                      </div>
                      <button
                        type="button"
                        className="kiju-button kiju-button--secondary"
                        onClick={() => onHistoryPrint(entry.sessionId)}
                      >
                        <Printer size={16} />
                        Bon drucken
                      </button>
                    </div>
                    <div className="kiju-service-history-item__meta">
                      <span>
                        <Clock3 size={14} />
                        {entry.closedAtLabel}
                      </span>
                      <span>
                        <Users size={14} />
                        {entry.guestCountLabel}
                      </span>
                      <strong>{entry.totalLabel}</strong>
                    </div>
                    <div className="kiju-service-history-item__payments">
                      {entry.payments.map((payment) => (
                        <div key={payment.id} className="kiju-service-history-payment">
                          <strong>{payment.amountLabel}</strong>
                          <span>
                            {payment.methodLabel} · {payment.payerLabel}
                          </span>
                          <small>{payment.label}</small>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </details>
          )}
        </section>

        <section className="kiju-service-menu-section">
          <header>
            <strong>Darstellung</strong>
            <span>{theme === "dark" ? "Dunkel" : "Hell"}</span>
          </header>
          <div className="kiju-service-menu-theme" role="group" aria-label="Farbthema wählen">
            <button
              type="button"
              className={`kiju-theme-toggle__button ${theme === "light" ? "is-active" : ""}`}
              onClick={() => setTheme("light")}
            >
              <SunMedium size={16} />
              Hell
            </button>
            <button
              type="button"
              className={`kiju-theme-toggle__button ${theme === "dark" ? "is-active" : ""}`}
              onClick={() => setTheme("dark")}
            >
              <MoonStar size={16} />
              Dunkel
            </button>
          </div>
        </section>

        <section className="kiju-service-menu-section">
          <header>
            <strong>Konto</strong>
            <span>{roleLabels[currentUser?.role ?? "waiter"]}</span>
          </header>
          <button type="button" className="kiju-button kiju-button--secondary" onClick={openLogin}>
            <UserCog size={18} />
            Rolle wechseln
          </button>
        </section>
      </div>
    </details>
  );
};
