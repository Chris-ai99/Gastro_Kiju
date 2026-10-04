"use client";

import { useEffect, useState, type FormEvent, type PropsWithChildren } from "react";
import { KeyRound, RefreshCw } from "lucide-react";

import { resolveApiUrl } from "@kiju/config";

type AccessState = "checking" | "required" | "authorized" | "unavailable";

export const InternalAccessGate = ({ children }: PropsWithChildren) => {
  const [status, setStatus] = useState<AccessState>("checking");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const checkSession = async () => {
    setStatus("checking");
    setMessage(null);
    try {
      const response = await fetch(resolveApiUrl("auth/session"), { cache: "no-store" });
      if (!response.ok) {
        setStatus("unavailable");
        setMessage("Der Gastro-Server ist nicht erreichbar.");
        return;
      }
      const payload = (await response.json()) as { authenticated?: boolean };
      setStatus(payload.authenticated ? "authorized" : "required");
    } catch {
      setStatus("unavailable");
      setMessage("Der Gastro-Server ist nicht erreichbar.");
    }
  };

  useEffect(() => {
    void checkSession();
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!code.trim() || submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch(resolveApiUrl("auth/access"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() })
      });
      const payload = (await response.json().catch(() => null)) as
        | { authenticated?: boolean; message?: string }
        | null;
      if (!response.ok || !payload?.authenticated) {
        setStatus(response.status >= 500 ? "unavailable" : "required");
        setMessage(payload?.message ?? "Der Betriebscode ist ungültig.");
        return;
      }
      setCode("");
      setStatus("authorized");
    } catch {
      setStatus("unavailable");
      setMessage("Der Gastro-Server ist nicht erreichbar.");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "authorized") return <>{children}</>;
  if (status === "checking") {
    return <main className="kiju-loading">Sichere Serververbindung wird geprüft …</main>;
  }

  return (
    <main className="kiju-empty-state kiju-server-gate">
      <KeyRound size={32} />
      <h1>{status === "required" ? "Betriebscode erforderlich" : "Server nicht erreichbar"}</h1>
      <p>
        {status === "required"
          ? "Gib den gemeinsamen Betriebscode dieses Geräts ein."
          : "Die interne Gastro-API antwortet derzeit nicht."}
      </p>
      {status === "required" ? (
        <form className="kiju-form" onSubmit={submit}>
          <label>
            <span>Betriebscode</span>
            <input
              type="password"
              autoComplete="current-password"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoFocus
            />
          </label>
          <button className="kiju-button kiju-button--primary" type="submit" disabled={submitting}>
            <KeyRound size={16} />
            {submitting ? "Prüfe …" : "Gerät freischalten"}
          </button>
        </form>
      ) : (
        <button className="kiju-button kiju-button--primary" type="button" onClick={() => void checkSession()}>
          <RefreshCw size={16} />
          Erneut verbinden
        </button>
      )}
      {message ? <p className="kiju-error">{message}</p> : null}
    </main>
  );
};
