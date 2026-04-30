"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Beer, ChefHat, LogIn, Settings, Users } from "lucide-react";

import { routeConfig } from "@kiju/config";
import { SectionCard } from "@kiju/ui";

import { useDemoApp } from "../lib/app-state";

const roleRoutes = {
  waiter: routeConfig.waiter,
  kitchen: routeConfig.kitchen,
  bar: routeConfig.bar,
  admin: routeConfig.admin
} as const;

type WorkspaceRole = "waiter" | "kitchen" | "bar" | "admin";

export const LoginScreen = () => {
  const router = useRouter();
  const { actions, currentUser, hydrated } = useDemoApp();
  const [serviceName, setServiceName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated || !currentUser) return;
    router.replace(roleRoutes[currentUser.role]);
  }, [currentUser, hydrated, router]);

  const handleStationStart = (role: WorkspaceRole, name?: string) => {
    const result = actions.startWorkspaceSession(role, name);

    if (!result.ok || !result.user) {
      setError(result.message ?? "Bereich konnte nicht geöffnet werden.");
      return;
    }

    setError(null);
    router.replace(roleRoutes[result.user.role]);
  };

  const submitService = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handleStationStart("waiter", serviceName);
  };

  return (
    <main className="kiju-login-shell">
      <section className="kiju-login-hero kiju-login-hero--compact">
        <SectionCard
          title="Bereich wählen"
          eyebrow="KiJu Gastro"
          action={
            <div className="kiju-login-badge">
              <LogIn size={16} />
              Start
            </div>
          }
        >
          <p className="kiju-login-intro">
            Wähle Küche, Getränke oder Service. Für den Service reicht dein Name.
          </p>

          <div className="kiju-form">
            <button
              type="button"
              className="kiju-button kiju-button--secondary"
              onClick={() => handleStationStart("kitchen")}
            >
              <ChefHat size={18} />
              Küche öffnen
            </button>
            <button
              type="button"
              className="kiju-button kiju-button--secondary"
              onClick={() => handleStationStart("bar")}
            >
              <Beer size={18} />
              Getränke öffnen
            </button>
            <button
              type="button"
              className="kiju-button kiju-button--secondary"
              onClick={() => handleStationStart("admin")}
            >
              <Settings size={18} />
              Admin öffnen
            </button>
          </div>

          <form className="kiju-form" onSubmit={submitService}>
            <label>
              <span>Service: Dein Name</span>
              <input
                value={serviceName}
                onChange={(event) => setServiceName(event.target.value)}
                autoComplete="name"
                autoFocus
                placeholder="Zum Beispiel Chris"
              />
            </label>
            {error ? <p className="kiju-error">{error}</p> : null}
            <button type="submit" className="kiju-button kiju-button--primary">
              <Users size={18} />
              Service öffnen
            </button>
          </form>
        </SectionCard>
      </section>
    </main>
  );
};
