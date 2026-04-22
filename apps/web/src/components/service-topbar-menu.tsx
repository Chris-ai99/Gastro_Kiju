"use client";

import { Bell, Menu, MoonStar, SunMedium, UserCog } from "lucide-react";
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

type ServiceTopbarMenuProps = {
  unreadNotifications: AppNotification[];
  onNotificationAction: (notification: AppNotification) => void;
};

export const ServiceTopbarMenu = ({
  unreadNotifications,
  onNotificationAction
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
