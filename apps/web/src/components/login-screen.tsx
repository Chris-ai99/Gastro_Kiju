"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogIn } from "lucide-react";

import { routeConfig } from "@kiju/config";
import { SectionCard } from "@kiju/ui";

import { useDemoApp } from "../lib/app-state";

const roleRoutes = {
  waiter: routeConfig.waiter,
  kitchen: routeConfig.kitchen,
  admin: routeConfig.admin
} as const;

export const LoginScreen = () => {
  const router = useRouter();
  const { actions, currentUser, hydrated } = useDemoApp();
  const [identifier, setIdentifier] = useState("");
  const [secret, setSecret] = useState("");
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
        <SectionCard
          title="Anmelden"
          eyebrow="KiJu Gastro"
          action={
            <div className="kiju-login-badge">
              <KeyRound size={16} />
              PIN
            </div>
          }
        >
          <p className="kiju-login-intro">
            PIN eingeben. Falls eine PIN mehrfach vergeben ist, zusätzlich den Namen eintragen.
          </p>
          <form className="kiju-form" onSubmit={submit}>
            <label>
              <span>PIN oder Passwort</span>
              <input
                type="password"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                autoComplete="current-password"
                autoFocus
              />
            </label>
            <label>
              <span>Name oder Benutzername, falls nötig</span>
              <input
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                autoComplete="username"
              />
            </label>
            {error ? <p className="kiju-error">{error}</p> : null}
            <button type="submit" className="kiju-button kiju-button--primary">
              <LogIn size={18} />
              Anmelden
            </button>
          </form>
        </SectionCard>
      </section>
    </main>
  );
};
