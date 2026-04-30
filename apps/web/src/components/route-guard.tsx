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
        <h1>Bitte zuerst einen Bereich wählen</h1>
        <p>Gehe zur Startseite und öffne Küche, Getränke oder Service.</p>
        <Link href={routeConfig.login} className="kiju-button kiju-button--primary">
          Zur Startseite
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
          Bereich wechseln
        </Link>
      </main>
    );
  }

  return <>{children}</>;
};
