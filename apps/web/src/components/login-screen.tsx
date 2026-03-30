"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ChefHat,
  LogIn,
  ShieldCheck,
  TabletSmartphone,
  Users
} from "lucide-react";

import { routeConfig } from "@kiju/config";
import { AccordionSection, SectionCard, StatusPill } from "@kiju/ui";

import { useDemoApp } from "../lib/app-state";

const roleRoutes = {
  waiter: routeConfig.waiter,
  kitchen: routeConfig.kitchen,
  admin: routeConfig.admin
} as const;

const quickStarts = [
  {
    label: "Als Service starten",
    helper: "Direkt ins Service-Dashboard mit Systemkonto.",
    identifier: "Service",
    secret: "Service1234",
    tone: "navy" as const,
    icon: Users
  },
  {
    label: "Als Küche starten",
    helper: "Direkt in den Küchenmonitor mit Produktionsansicht.",
    identifier: "Kueche",
    secret: "2026",
    tone: "amber" as const,
    icon: ChefHat
  },
  {
    label: "Als Admin starten",
    helper: "Direkt in Konfiguration, Produkte und Tagesübersicht.",
    identifier: "Admin",
    secret: "Admin1234",
    tone: "green" as const,
    icon: ShieldCheck
  }
] as const;

export const LoginScreen = () => {
  const router = useRouter();
  const { actions, currentUser, hydrated } = useDemoApp();
  const [identifier, setIdentifier] = useState("Service");
  const [secret, setSecret] = useState("Service1234");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated || !currentUser) return;
    router.replace(roleRoutes[currentUser.role]);
  }, [currentUser, hydrated, router]);

  const handleLogin = (nextIdentifier: string, nextSecret: string) => {
    const result = actions.login(nextIdentifier, nextSecret);

    if (!result.ok || !result.user) {
      setError(result.message ?? "Login fehlgeschlagen.");
      return;
    }

    setError(null);
    router.replace(roleRoutes[result.user.role]);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handleLogin(identifier, secret);
  };

  return (
    <main className="kiju-login-shell">
      <section className="kiju-login-hero kiju-login-hero--compact">
        <div className="kiju-login-copy">
          <StatusPill label="KiJu Gastro System" tone="navy" />
          <h1>Schneller Einstieg für Service, Küche und Administration.</h1>
          <p>
            Wähle direkt deine Rolle oder melde dich manuell an. Nach dem Login geht es sofort in
            die passende Arbeitsansicht.
          </p>

          <div className="kiju-quickstart-grid">
            {quickStarts.map((entry) => {
              const Icon = entry.icon;
              return (
                <button
                  key={entry.label}
                  type="button"
                  className="kiju-quickstart-card"
                  onClick={() => handleLogin(entry.identifier, entry.secret)}
                >
                  <div className="kiju-quickstart-card__top">
                    <StatusPill label={entry.label.replace("Als ", "").replace(" starten", "")} tone={entry.tone} />
                    <Icon size={20} />
                  </div>
                  <strong>{entry.label}</strong>
                  <span>{entry.helper}</span>
                  <span className="kiju-quickstart-card__cta">
                    Direkt öffnen
                    <ArrowRight size={16} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <SectionCard
          title="Manuell anmelden"
          eyebrow="Login"
          action={
            <div className="kiju-inline-flag">
              <TabletSmartphone size={16} />
              Tablet-first
            </div>
          }
        >
          <form className="kiju-form" onSubmit={submit}>
            <label>
              <span>Benutzername oder Name</span>
              <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} />
            </label>
            <label>
              <span>Passwort oder PIN</span>
              <input
                type="password"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
              />
            </label>
            {error ? <p className="kiju-error">{error}</p> : null}
            <button type="submit" className="kiju-button kiju-button--primary">
              <LogIn size={18} />
              Jetzt anmelden
            </button>
          </form>

          <AccordionSection
            title="Systemzugänge anzeigen"
            eyebrow="Schnellhilfe"
            defaultOpen={false}
            contentClassName="kiju-login-credentials"
          >
            <div className="kiju-inline-panel">
              <strong>Service</strong>
              <span>Benutzer: Service</span>
              <small>Passwort: Service1234 oder PIN 1234</small>
            </div>
            <div className="kiju-inline-panel">
              <strong>Küche</strong>
              <span>Benutzer: Kueche</span>
              <small>Passwort: Kitchen1234 oder PIN 2026</small>
            </div>
            <div className="kiju-inline-panel">
              <strong>Admin</strong>
              <span>Benutzer: Admin</span>
              <small>Passwort: Admin1234</small>
            </div>
          </AccordionSection>
        </SectionCard>
      </section>
    </main>
  );
};
