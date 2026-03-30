"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChefHat, LogOut, ShieldCheck, UserCog, Users } from "lucide-react";

import { routeConfig } from "@kiju/config";
import type { Role } from "@kiju/domain";

import { useDemoApp } from "../lib/app-state";

const roleLabels: Record<Role, string> = {
  admin: "Admin",
  waiter: "Service",
  kitchen: "Küche"
};

const roleDescriptions: Record<Role, string> = {
  admin: "Konfiguration, Stammdaten und Tagesübersicht",
  waiter: "Floorplan, Sitzplätze und Bestellaufnahme",
  kitchen: "Produktionsmonitor und Küchenstatus"
};

const roleRoutes: Record<Role, string> = {
  admin: routeConfig.admin,
  waiter: routeConfig.waiter,
  kitchen: routeConfig.kitchen
};

const roleIcons = {
  admin: ShieldCheck,
  waiter: Users,
  kitchen: ChefHat
} as const;

export const RoleSwitchPopover = () => {
  const router = useRouter();
  const { state, currentUser, actions } = useDemoApp();
  const [error, setError] = useState<string | null>(null);

  const roleTargets = useMemo(
    () =>
      (["waiter", "kitchen", "admin"] as const).map((role) => {
        const activeUsers = state.users.filter((user) => user.role === role && user.active);
        const preferredUser =
          currentUser?.role === role
            ? currentUser
            : activeUsers.find((user) => user.id !== currentUser?.id) ?? activeUsers[0];

        return {
          role,
          user: preferredUser,
          activeCount: activeUsers.length,
          isCurrent: currentUser?.role === role
        };
      }),
    [currentUser, state.users]
  );

  const switchRole = (role: Role) => {
    const target = roleTargets.find((entry) => entry.role === role);
    if (!target?.user) {
      setError(`Für ${roleLabels[role]} ist aktuell kein aktives Konto hinterlegt.`);
      return;
    }

    if (target.isCurrent && currentUser?.id === target.user.id) {
      setError(null);
      router.push(roleRoutes[role]);
      return;
    }

    const result = actions.login(target.user.username, target.user.password);
    if (!result.ok) {
      setError(result.message ?? `${roleLabels[role]} konnte nicht geöffnet werden.`);
      return;
    }

    setError(null);
    router.push(roleRoutes[role]);
  };

  const handleLogout = () => {
    setError(null);
    actions.logout();
    router.push(routeConfig.login);
  };

  return (
    <details className="kiju-role-switch-popover">
      <summary className="kiju-role-switch-popover__trigger">
        <UserCog size={18} />
        <span>Rolle wechseln</span>
        <small>{roleLabels[currentUser?.role ?? "waiter"]}</small>
      </summary>
      <div className="kiju-role-switch-popover__panel">
        <div className="kiju-role-switch-popover__header">
          <div>
            <strong>Arbeitsbereich wechseln</strong>
            <span>
              {currentUser
                ? `${currentUser.name} ist gerade als ${roleLabels[currentUser.role]} aktiv.`
                : "Keine aktive Rolle geladen."}
            </span>
          </div>
        </div>

        <div className="kiju-role-switch-popover__list">
          {roleTargets.map((entry) => {
            const Icon = roleIcons[entry.role];
            return (
              <button
                key={entry.role}
                type="button"
                className={`kiju-role-switch-option ${entry.isCurrent ? "is-current" : ""}`}
                onClick={() => switchRole(entry.role)}
                disabled={!entry.user}
              >
                <span className="kiju-role-switch-option__icon">
                  <Icon size={18} />
                </span>
                <span className="kiju-role-switch-option__copy">
                  <strong>{roleLabels[entry.role]}</strong>
                  <small>
                    {entry.user
                      ? `${entry.user.name}${entry.activeCount > 1 ? ` · ${entry.activeCount} aktive Konten` : ""}`
                      : "Kein aktives Konto"}
                  </small>
                  <small>{roleDescriptions[entry.role]}</small>
                </span>
              </button>
            );
          })}
        </div>

        {error ? <p className="kiju-role-switch-popover__error">{error}</p> : null}

        <button
          type="button"
          className="kiju-button kiju-button--secondary kiju-role-switch-popover__logout"
          onClick={handleLogout}
        >
          <LogOut size={16} />
          Zur Anmeldung
        </button>
      </div>
    </details>
  );
};
