"use client";

import Link from "next/link";

import { routeConfig } from "@kiju/config";
import type { Role } from "@kiju/domain";

import { useDemoApp } from "../lib/app-state";

export const RouteGuard = ({
  allowedRoles,
  children
}: {
  allowedRoles: Role[];
  children: React.ReactNode;
}) => {
  const { hydrated, currentUser } = useDemoApp();

  if (!hydrated) {
    return <main className="kiju-loading">System wird geladen...</main>;
  }

  if (!currentUser) {
    return (
      <main className="kiju-empty-state">
        <h1>Bitte zuerst anmelden</h1>
        <p>Die Rolle ist noch nicht aktiv. Gehe zur Startseite und melde dich an.</p>
        <Link href={routeConfig.login} className="kiju-button kiju-button--primary">
          Zum Login
        </Link>
      </main>
    );
  }

  if (!allowedRoles.includes(currentUser.role)) {
    return (
      <main className="kiju-empty-state">
        <h1>Kein Zugriff</h1>
        <p>Diese Ansicht ist für deine Rolle aktuell nicht freigeschaltet.</p>
        <Link href={routeConfig.login} className="kiju-button kiju-button--secondary">
          Rolle wechseln
        </Link>
      </main>
    );
  }

  return <>{children}</>;
};
