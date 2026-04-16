"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  ChefHat,
  LayoutGrid,
  PlusCircle,
  ReceiptText,
  RotateCcw,
  Save,
  Trash2,
  Users
} from "lucide-react";

import { routeConfig } from "@kiju/config";
import {
  buildClosedSessions,
  calculateGuestCount,
  calculateSessionTotal,
  euro,
  type NotificationTone,
  type ProductCategory,
  type ProductionTarget,
  type Role,
  type ServiceOrderMode
} from "@kiju/domain";
import { AccordionSection, SectionCard, StatusPill } from "@kiju/ui";

import { courseLabels, resolveProductName, useDemoApp } from "../lib/app-state";
import { RoleSwitchPopover } from "./role-switch-popover";
import { RouteGuard } from "./route-guard";

const resetSteps = [
  "Schritt 1 von 3: Standarddaten wirklich vorbereiten?",
  "Schritt 2 von 3: Dabei werden alle Änderungen und Bestellungen gelöscht.",
  "Schritt 3 von 3: Jetzt endgültig alles auf Standard zurücksetzen."
] as const;

const roleLabels: Record<Role, string> = {
  admin: "Admin",
  waiter: "Kellner",
  kitchen: "Küche"
};

const productionLabels: Record<ProductionTarget, string> = {
  service: "Service",
  bar: "Bar",
  kitchen: "Küche"
};

const notificationToneLabels: Record<NotificationTone, string> = {
  info: "Info",
  success: "Bereit",
  alert: "Wichtig"
};

const notificationTonePills: Record<
  NotificationTone,
  "navy" | "amber" | "red" | "green" | "slate"
> = {
  info: "navy",
  success: "green",
  alert: "red"
};

const productCategoryOrder: ProductCategory[] = ["starter", "main", "drinks", "dessert"];

const sessionStatusLabels: Record<string, string> = {
  serving: "In Bedienung",
  hold: "Hold",
  waiting: "Warten",
  "ready-to-bill": "Rechnung offen",
  closed: "Abgeschlossen"
};

const sessionStatusTones: Record<string, "navy" | "amber" | "red" | "green" | "slate"> = {
  serving: "navy",
  hold: "amber",
  waiting: "red",
  "ready-to-bill": "green",
  closed: "green"
};

type FeedbackState =
  | {
      tone: "success" | "alert";
      message: string;
    }
  | undefined;

const zeroResetSteps = [
  "Schritt 1 von 3: Standardkonfiguration wirklich wiederherstellen?",
  "Schritt 2 von 3: Laufende Bestellungen, Hinweise und Tageswerte werden zurückgesetzt.",
  "Schritt 3 von 3: Jetzt endgültig die Standardkonfiguration laden."
] as const;

const formatAdminDateTime = (value: string) =>
  new Date(value).toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short"
  });

export const AdminPanel = () => {
  const { state, actions, currentUser, unreadNotifications } = useDemoApp();
  const router = useRouter();
  const closedSessions = useMemo(() => buildClosedSessions(state), [state]);
  const [feedback, setFeedback] = useState<FeedbackState>();
  const [resetStep, setResetStep] = useState(0);
  const [productForm, setProductForm] = useState({
    name: "",
    description: "",
    category: "drinks" as ProductCategory,
    price: "0.00",
    taxRate: "19",
    productionTarget: "service" as ProductionTarget
  });
  const [userForm, setUserForm] = useState({
    name: "",
    username: "",
    role: "waiter" as Role,
    password: "",
    pin: ""
  });
  const [userDrafts, setUserDrafts] = useState<
    Record<
      string,
      {
        name: string;
        username: string;
        role: Role;
        password: string;
        pin: string;
        active: boolean;
      }
    >
  >({});
  const [tableForm, setTableForm] = useState({
    name: "",
    seatCount: "4",
    active: true,
    note: ""
  });

  const productUsage = useMemo(() => {
    const usage = new Map<string, { open: number; closed: number }>();

    state.sessions.forEach((session) => {
      session.items.forEach((item) => {
        const current = usage.get(item.productId) ?? { open: 0, closed: 0 };
        if (session.status === "closed") {
          current.closed += item.quantity;
        } else {
          current.open += item.quantity;
        }
        usage.set(item.productId, current);
      });
    });

    return usage;
  }, [state.sessions]);

  const userAssignments = useMemo(() => {
    const usage = new Map<string, number>();

    state.sessions.forEach((session) => {
      usage.set(session.waiterId, (usage.get(session.waiterId) ?? 0) + 1);
    });

    return usage;
  }, [state.sessions]);

  const tableAssignments = useMemo(() => {
    const usage = new Map<string, { sessions: number; items: number; closed: number }>();

    state.tables.forEach((table) => {
      usage.set(table.id, { sessions: 0, items: 0, closed: 0 });
    });

    state.sessions.forEach((session) => {
      const current = usage.get(session.tableId) ?? { sessions: 0, items: 0, closed: 0 };
      current.sessions += 1;
      current.items += session.items.length;
      if (session.status === "closed") {
        current.closed += 1;
      }
      usage.set(session.tableId, current);
    });

    return usage;
  }, [state.sessions, state.tables]);

  const groupedProducts = useMemo(
    () =>
      productCategoryOrder.map((category) => ({
        category,
        label: courseLabels[category],
        products: state.products
          .filter((product) => product.category === category)
          .sort((left, right) => left.name.localeCompare(right.name, "de"))
      })),
    [state.products]
  );

  const adminCount = useMemo(
    () => state.users.filter((user) => user.role === "admin").length,
    [state.users]
  );
  const activeAdminCount = useMemo(
    () => state.users.filter((user) => user.role === "admin" && user.active).length,
    [state.users]
  );
  const openSessions = useMemo(
    () => state.sessions.filter((session) => session.status !== "closed"),
    [state.sessions]
  );
  const sortedSessions = useMemo(
    () =>
      [...state.sessions].sort((left, right) => {
        if (left.status === "closed" && right.status !== "closed") return 1;
        if (left.status !== "closed" && right.status === "closed") return -1;
        return left.tableId.localeCompare(right.tableId, "de");
      }),
    [state.sessions]
  );
  const tablesNeedingAttention = useMemo(
    () =>
      state.sessions.filter(
        (session) =>
          session.status === "hold" ||
          session.status === "waiting" ||
          session.status === "ready-to-bill"
      ).length,
    [state.sessions]
  );
  const tableNames = useMemo(
    () => new Map(state.tables.map((table) => [table.id, table.name])),
    [state.tables]
  );

  const handleOpenWorkspace = (role: "waiter" | "kitchen") => {
    const targetUser = state.users.find((user) => user.role === role && user.active);
    if (!targetUser) {
      setFeedback({
        tone: "alert",
        message:
          role === "waiter"
            ? "Es ist aktuell kein aktives Service-Konto vorhanden."
            : "Es ist aktuell kein aktives Küchenkonto vorhanden."
      });
      return;
    }

    const result = actions.login(targetUser.username, targetUser.password);
    if (!result.ok) {
      setFeedback({
        tone: "alert",
        message:
          result.message ??
          (role === "waiter"
            ? "Service-Ansicht konnte nicht geöffnet werden."
            : "Küchenansicht konnte nicht geöffnet werden.")
      });
      return;
    }

    router.push(role === "waiter" ? routeConfig.waiter : routeConfig.kitchen);
  };

  const handleUserDraftChange = (
    userId: string,
    patch: Partial<{
      name: string;
      username: string;
      role: Role;
      password: string;
      pin: string;
      active: boolean;
    }>
  ) => {
    const baseUser = state.users.find((entry) => entry.id === userId);
    if (!baseUser) return;

    setUserDrafts((current) => ({
      ...current,
      [userId]: {
        name: current[userId]?.name ?? baseUser.name,
        username: current[userId]?.username ?? baseUser.username,
        role: current[userId]?.role ?? baseUser.role,
        password: current[userId]?.password ?? baseUser.password,
        pin: current[userId]?.pin ?? (baseUser.pin ?? ""),
        active: current[userId]?.active ?? baseUser.active,
        ...patch
      }
    }));
  };

  const handleSaveUser = (userId: string) => {
    const draft = userDrafts[userId];
    const baseUser = state.users.find((entry) => entry.id === userId);
    if (!draft || !baseUser) return;

    const result = actions.updateUser(userId, {
      name: draft.name,
      username: draft.username,
      role: draft.role,
      password: draft.password,
      pin: draft.pin,
      active: draft.active
    });

    if (!result.ok) {
      setFeedback({
        tone: "alert",
        message: result.message ?? "Mitarbeiter konnte nicht gespeichert werden."
      });
      return;
    }

    setUserDrafts((current) => {
      const next = { ...current };
      delete next[userId];
      return next;
    });
    setFeedback({
      tone: "success",
      message: `Mitarbeiterdaten für ${draft.name || baseUser.name} wurden gespeichert.`
    });
  };

  const handleResetClick = () => {
    if (resetStep < zeroResetSteps.length - 1) {
      setResetStep((current) => current + 1);
      return;
    }

    actions.resetDemoState();
    setResetStep(0);
    setUserDrafts({});
    setFeedback({
      tone: "success",
      message:
        "Standardkonfiguration wiederhergestellt. Tische, Leistungen und Benutzer sind wieder gesetzt; Bestellungen, Hinweise und Tageswerte wurden zurückgesetzt."
    });
  };

  const handleCreateProduct = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const result = actions.createProduct({
      name: productForm.name,
      description: productForm.description,
      category: productForm.category,
      priceCents: Math.round(Number(productForm.price || "0") * 100),
      taxRate: Number(productForm.taxRate || "0"),
      productionTarget: productForm.productionTarget
    });

    if (!result.ok) {
      setFeedback({
        tone: "alert",
        message: result.message ?? "Leistung konnte nicht angelegt werden."
      });
      return;
    }

    setProductForm({
      name: "",
      description: "",
      category: "drinks",
      price: "0.00",
      taxRate: "19",
      productionTarget: "service"
    });
    setFeedback({ tone: "success", message: "Leistung erfolgreich angelegt." });
  };

  const handleDeleteProduct = (productId: string) => {
    const result = actions.deleteProduct(productId);
    if (!result.ok) {
      setFeedback({
        tone: "alert",
        message: result.message ?? "Leistung konnte nicht gelöscht werden."
      });
      return;
    }

    setFeedback({
      tone: "success",
      message: "Leistung wurde vollständig aus Stammdaten und Bestellungen entfernt."
    });
  };

  const handleCreateUser = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const result = actions.createUser({
      name: userForm.name,
      username: userForm.username,
      role: userForm.role,
      password: userForm.password,
      pin: userForm.pin
    });

    if (!result.ok) {
      setFeedback({
        tone: "alert",
        message: result.message ?? "Benutzer konnte nicht angelegt werden."
      });
      return;
    }

    setUserForm({
      name: "",
      username: "",
      role: "waiter",
      password: "",
      pin: ""
    });
    setFeedback({ tone: "success", message: "Benutzer erfolgreich angelegt." });
  };

  const handleDeleteUser = (userId: string) => {
    const result = actions.deleteUser(userId);
    if (!result.ok) {
      setFeedback({
        tone: "alert",
        message: result.message ?? "Benutzer konnte nicht gelöscht werden."
      });
      return;
    }

    setUserDrafts((current) => {
      const next = { ...current };
      delete next[userId];
      return next;
    });
    setFeedback({ tone: "success", message: "Benutzer wurde gelöscht." });
  };

  const handleCreateTable = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const result = actions.createTable({
      name: tableForm.name,
      seatCount: Number(tableForm.seatCount || "0"),
      active: tableForm.active,
      note: tableForm.note
    });

    if (!result.ok) {
      setFeedback({
        tone: "alert",
        message: result.message ?? "Tisch konnte nicht angelegt werden."
      });
      return;
    }

    setTableForm({
      name: "",
      seatCount: "4",
      active: true,
      note: ""
    });
    setFeedback({ tone: "success", message: "Tisch erfolgreich angelegt." });
  };

  const handleDeleteTable = (tableId: string) => {
    actions.removeTableAndServices(tableId);
    setFeedback({ tone: "success", message: "Tisch samt Leistungen wurde gelöscht." });
  };

  const handleServiceOrderModeChange = (mode: ServiceOrderMode) => {
    actions.setServiceOrderMode(mode);
    setFeedback({
      tone: "success",
      message:
        mode === "table"
          ? "Bestellmodus auf ganzen Tisch umgestellt."
          : "Bestellmodus auf Sitzplätze umgestellt."
    });
  };

  const handleSeatVisibleChange = (tableId: string, seatId: string, visible: boolean) => {
    actions.setSeatVisible(tableId, seatId, visible);
    setFeedback({
      tone: "success",
      message: visible
        ? "Sitzplatz ist wieder im Service sichtbar."
        : "Sitzplatz ausgeblendet; offene Positionen wurden auf den Tisch verschoben."
    });
  };

  const handleDeleteSession = (sessionId: string) => {
    const result = actions.deleteSession(sessionId);
    if (!result.ok) {
      setFeedback({
        tone: "alert",
        message: result.message ?? "Bestellung konnte nicht gelöscht werden."
      });
      return;
    }

    setFeedback({ tone: "success", message: "Bestellung wurde gelöscht." });
  };

  const handleDismissNotification = (notificationId: string) => {
    actions.markNotificationRead(notificationId);
    setFeedback({ tone: "success", message: "Hinweis wurde ausgeblendet." });
  };

  return (
    <RouteGuard allowedRoles={["admin"]}>
      <main className="kiju-page kiju-admin-shell">
        <section className="kiju-admin-hero">
          <div className="kiju-admin-hero__copy">
            <span className="kiju-eyebrow">Executive Cockpit</span>
            <h1>Admin-Cockpit für Betrieb, Service und Abrechnung.</h1>
            <p>
              Alle Stammdaten, Tische, Bestellungen und Abschlüsse an einem Ort. Die
              Arbeitsbereiche bleiben standardmäßig eingeklappt und öffnen sich nur dann, wenn du
              sie wirklich brauchst.
            </p>
          </div>
          <div className="kiju-admin-hero__actions">
            <button
              type="button"
              className="kiju-button kiju-button--secondary"
              onClick={() => handleOpenWorkspace("waiter")}
            >
              <LayoutGrid size={18} />
              Service
            </button>
            <button
              type="button"
              className="kiju-button kiju-button--secondary"
              onClick={() => handleOpenWorkspace("kitchen")}
            >
              <ChefHat size={18} />
              Küche
            </button>
            <RoleSwitchPopover />
          </div>
        </section>

        <section className="kiju-admin-toolbar">
          <div className="kiju-admin-link-pills">
            <a className="kiju-admin-link-pill" href="#cockpit">
              Cockpit
            </a>
            <a className="kiju-admin-link-pill" href="#hinweise">
              Hinweise
            </a>
            <a className="kiju-admin-link-pill" href="#leistungen">
              Leistungen
            </a>
            <a className="kiju-admin-link-pill" href="#mitarbeiter">
              Mitarbeiter
            </a>
            <a className="kiju-admin-link-pill" href="#tische">
              Tische
            </a>
            <a className="kiju-admin-link-pill" href="#bestellungen">
              Bestellungen
            </a>
            <a className="kiju-admin-link-pill" href="#reset">
              Reset
            </a>
          </div>
          <div className="kiju-admin-status-pills">
            <span className="kiju-admin-mini-pill">
              <Users size={14} />
              {currentUser?.name ?? "Admin"} · {roleLabels[currentUser?.role ?? "admin"]}
            </span>
            <span className="kiju-admin-mini-pill">
              <Bell size={14} />
              {unreadNotifications.length} Hinweise
            </span>
            <span className="kiju-admin-mini-pill">
              <ReceiptText size={14} />
              {closedSessions.length} Abschlüsse
            </span>
          </div>
        </section>

        {feedback ? (
          <div className={`kiju-admin-feedback is-${feedback.tone}`}>
            <strong>{feedback.tone === "success" ? "Erfolgreich" : "Hinweis"}</strong>
            <span>{feedback.message}</span>
          </div>
        ) : null}

        <section id="cockpit" className="kiju-admin-kpi-grid">
          <article className="kiju-admin-kpi-card">
            <span className="kiju-admin-kpi-card__label">Umsatz heute</span>
            <strong>{euro(state.dailyStats.revenueCents)}</strong>
            <small>{state.dailyStats.servedTables} Tische abgeschlossen</small>
          </article>
          <article className="kiju-admin-kpi-card">
            <span className="kiju-admin-kpi-card__label">Offene Bestellungen</span>
            <strong>{openSessions.length}</strong>
            <small>{tablesNeedingAttention} benötigen direkte Aufmerksamkeit</small>
          </article>
          <article className="kiju-admin-kpi-card">
            <span className="kiju-admin-kpi-card__label">Aktive Tische</span>
            <strong>{state.tables.filter((table) => table.active).length}</strong>
            <small>von {state.tables.length} hinterlegten Tischen</small>
          </article>
          <article className="kiju-admin-kpi-card">
            <span className="kiju-admin-kpi-card__label">Leistungen</span>
            <strong>{state.products.length}</strong>
            <small>mit Preisen, Kategorien und Produktionszielen</small>
          </article>
          <article className="kiju-admin-kpi-card">
            <span className="kiju-admin-kpi-card__label">Aktive Admins</span>
            <strong>{activeAdminCount}</strong>
            <small>{adminCount} Admin-Konten insgesamt</small>
          </article>
          <article className="kiju-admin-kpi-card">
            <span className="kiju-admin-kpi-card__label">Offene Hinweise</span>
            <strong>{unreadNotifications.length}</strong>
            <small>Küche, Service und Abrechnung live synchronisiert</small>
          </article>
        </section>

        <SectionCard
          title="Betriebsfokus"
          eyebrow="Live-Überblick"
          className="kiju-admin-section-card"
          action={<StatusPill label={`${state.sessions.length} Sessions`} tone="navy" />}
        >
          <div className="kiju-admin-focus-grid">
            <div className="kiju-admin-focus-list">
              <strong>Dringende Hinweise</strong>
              {unreadNotifications.length === 0 ? (
                <div className="kiju-inline-panel">
                  <span>Aktuell sind keine ungelesenen Hinweise offen.</span>
                </div>
              ) : (
                unreadNotifications.slice(0, 4).map((notification) => (
                  <article key={notification.id} className="kiju-admin-focus-item">
                    <strong>{notification.title}</strong>
                    <span>{notification.body}</span>
                  </article>
                ))
              )}
            </div>

            <div className="kiju-admin-focus-list">
              <strong>Letzte Abschlüsse</strong>
              {closedSessions.length === 0 ? (
                <div className="kiju-inline-panel">
                  <span>Noch keine abgeschlossenen Bestellungen vorhanden.</span>
                </div>
              ) : (
                closedSessions.slice(0, 4).map((session) => {
                  const tableName =
                    state.tables.find((table) => table.id === session.tableId)?.name ??
                    session.tableId.replace("table-", "Tisch ");

                  return (
                    <article key={session.id} className="kiju-admin-focus-item">
                      <strong>{tableName}</strong>
                      <span>
                        {calculateGuestCount(session)} Gäste ·{" "}
                        {euro(calculateSessionTotal(session, state.products))}
                      </span>
                    </article>
                  );
                })
              )}
            </div>

            <div className="kiju-admin-focus-list">
              <strong>Teamstatus</strong>
              <article className="kiju-admin-focus-item">
                <strong>Service</strong>
                <span>
                  {
                    state.users.filter((user) => user.role === "waiter" && user.active).length
                  } aktive Kellner
                </span>
              </article>
              <article className="kiju-admin-focus-item">
                <strong>Küche</strong>
                <span>
                  {
                    state.users.filter((user) => user.role === "kitchen" && user.active).length
                  } aktive Küchenkonten
                </span>
              </article>
              <article className="kiju-admin-focus-item">
                <strong>Reset-Schutz</strong>
                <span>{zeroResetSteps.length - resetStep} Sicherheitsstufen verbleiben</span>
              </article>
            </div>
          </div>
        </SectionCard>

        <div className="kiju-admin-stack">
          <div id="hinweise">
            <AccordionSection
              title="Hinweise"
              eyebrow="Benachrichtigungen aus Küche, Service und Abrechnung"
              defaultOpen={false}
              className="kiju-admin-accordion"
              action={
                <StatusPill
                  label={`${unreadNotifications.length} offen`}
                  tone={unreadNotifications.length > 0 ? "amber" : "slate"}
                />
              }
            >
              <div className="kiju-admin-list">
                {unreadNotifications.length === 0 ? (
                  <div className="kiju-inline-panel">
                    <span>Aktuell sind keine offenen Benachrichtigungen vorhanden.</span>
                  </div>
                ) : (
                  unreadNotifications.map((notification) => {
                    const tableName = notification.tableId
                      ? tableNames.get(notification.tableId) ?? notification.tableId
                      : undefined;

                    return (
                      <article key={notification.id} className="kiju-admin-panel">
                        <div className="kiju-admin-row kiju-admin-row--top">
                          <div className="kiju-admin-heading-stack">
                            <strong>{notification.title}</strong>
                            <span>{notification.body}</span>
                          </div>
                          <div className="kiju-admin-action-row">
                            <StatusPill
                              label={notificationToneLabels[notification.tone]}
                              tone={notificationTonePills[notification.tone]}
                            />
                            {tableName ? <StatusPill label={tableName} tone="slate" /> : null}
                            <button
                              type="button"
                              className="kiju-button kiju-button--secondary"
                              onClick={() => handleDismissNotification(notification.id)}
                            >
                              Wegklicken
                            </button>
                          </div>
                        </div>

                        <div className="kiju-admin-meta">
                          <span>Erfasst: {formatAdminDateTime(notification.createdAt)}</span>
                          {tableName ? <span>Quelle: {tableName}</span> : null}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </AccordionSection>
          </div>

          <div id="leistungen">
            <AccordionSection
              title="Leistungen"
              eyebrow="Serviceleistungen, Preise und Kategorien"
              defaultOpen={false}
              className="kiju-admin-accordion"
              action={<StatusPill label={`${state.products.length} Einträge`} tone="navy" />}
            >
              <div className="kiju-admin-layout">
                <form className="kiju-admin-panel" onSubmit={handleCreateProduct}>
                  <strong>Neue Leistung anlegen</strong>
                  <label className="kiju-inline-field">
                    <span>Name</span>
                    <input
                      value={productForm.name}
                      onChange={(event) =>
                        setProductForm((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </label>
                  <label className="kiju-inline-field">
                    <span>Beschreibung</span>
                    <textarea
                      value={productForm.description}
                      onChange={(event) =>
                        setProductForm((current) => ({
                          ...current,
                          description: event.target.value
                        }))
                      }
                    />
                  </label>
                  <div className="kiju-admin-row">
                    <label className="kiju-inline-field">
                      <span>Kategorie</span>
                      <select
                        value={productForm.category}
                        onChange={(event) =>
                          setProductForm((current) => ({
                            ...current,
                            category: event.target.value as ProductCategory
                          }))
                        }
                      >
                        {productCategoryOrder.map((category) => (
                          <option key={category} value={category}>
                            {courseLabels[category]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="kiju-inline-field">
                      <span>Produktionsziel</span>
                      <select
                        value={productForm.productionTarget}
                        onChange={(event) =>
                          setProductForm((current) => ({
                            ...current,
                            productionTarget: event.target.value as ProductionTarget
                          }))
                        }
                      >
                        <option value="service">Service</option>
                        <option value="bar">Bar</option>
                        <option value="kitchen">Küche</option>
                      </select>
                    </label>
                  </div>
                  <div className="kiju-admin-row">
                    <label className="kiju-inline-field">
                      <span>Preis EUR</span>
                      <input
                        type="number"
                        min="0"
                        step="0.10"
                        value={productForm.price}
                        onChange={(event) =>
                          setProductForm((current) => ({ ...current, price: event.target.value }))
                        }
                      />
                    </label>
                    <label className="kiju-inline-field">
                      <span>Steuer %</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={productForm.taxRate}
                        onChange={(event) =>
                          setProductForm((current) => ({
                            ...current,
                            taxRate: event.target.value
                          }))
                        }
                      />
                    </label>
                  </div>
                  <button type="submit" className="kiju-button kiju-button--primary">
                    <PlusCircle size={18} />
                    Leistung anlegen
                  </button>
                </form>

                <div className="kiju-admin-list">
                  {groupedProducts.map(({ category, label, products }) => (
                    <section key={category} className="kiju-admin-category-group">
                      <div className="kiju-admin-category-group__header">
                        <div className="kiju-admin-heading-stack">
                          <strong>{label}</strong>
                          <span>
                            {products.length} {products.length === 1 ? "Leistung" : "Leistungen"}
                          </span>
                        </div>
                        <StatusPill
                          label={`${products.length} ${products.length === 1 ? "Eintrag" : "Einträge"}`}
                          tone="slate"
                        />
                      </div>

                      {products.length === 0 ? (
                        <div className="kiju-inline-panel">
                          <span>Aktuell ist in dieser Kategorie noch keine Leistung angelegt.</span>
                        </div>
                      ) : (
                        products.map((product) => {
                          const usage = productUsage.get(product.id) ?? { open: 0, closed: 0 };

                          return (
                            <AccordionSection
                              key={product.id}
                              title={product.name}
                              eyebrow={productionLabels[product.productionTarget]}
                              defaultOpen={false}
                              className="kiju-admin-accordion kiju-admin-product-accordion"
                              contentClassName="kiju-admin-product-accordion__content"
                              action={
                                <>
                                  <StatusPill label={courseLabels[product.category]} tone="navy" />
                                  <StatusPill label={euro(product.priceCents)} tone="slate" />
                                </>
                              }
                            >
                              <div className="kiju-admin-row kiju-admin-row--top">
                                <div className="kiju-admin-heading-stack">
                                  <strong>Leistung bearbeiten</strong>
                                  <span>
                                    Offen genutzt: {usage.open} · Historisch genutzt: {usage.closed}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className="kiju-button kiju-button--danger"
                                  onClick={() => handleDeleteProduct(product.id)}
                                >
                                  <Trash2 size={16} />
                                  Löschen
                                </button>
                              </div>

                              <div className="kiju-admin-row">
                                <label className="kiju-inline-field">
                                  <span>Name</span>
                                  <input
                                    value={product.name}
                                    onChange={(event) =>
                                      actions.updateProduct(product.id, { name: event.target.value })
                                    }
                                  />
                                </label>
                                <label className="kiju-inline-field">
                                  <span>Kategorie</span>
                                  <select
                                    value={product.category}
                                    onChange={(event) =>
                                      actions.updateProduct(product.id, {
                                        category: event.target.value as ProductCategory
                                      })
                                    }
                                  >
                                    {productCategoryOrder.map((entryCategory) => (
                                      <option key={entryCategory} value={entryCategory}>
                                        {courseLabels[entryCategory]}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>

                              <label className="kiju-inline-field">
                                <span>Beschreibung</span>
                                <textarea
                                  value={product.description}
                                  onChange={(event) =>
                                    actions.updateProduct(product.id, {
                                      description: event.target.value
                                    })
                                  }
                                />
                              </label>

                              <div className="kiju-admin-row">
                                <label className="kiju-inline-field">
                                  <span>Produktionsziel</span>
                                  <select
                                    value={product.productionTarget}
                                    onChange={(event) =>
                                      actions.updateProduct(product.id, {
                                        productionTarget: event.target.value as ProductionTarget
                                      })
                                    }
                                  >
                                    <option value="service">Service</option>
                                    <option value="bar">Bar</option>
                                    <option value="kitchen">Küche</option>
                                  </select>
                                </label>
                                <label className="kiju-inline-field">
                                  <span>Preis EUR</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.10"
                                    value={(product.priceCents / 100).toFixed(2)}
                                    onChange={(event) =>
                                      actions.updateProduct(product.id, {
                                        priceCents: Math.round(Number(event.target.value || "0") * 100)
                                      })
                                    }
                                  />
                                </label>
                                <label className="kiju-inline-field">
                                  <span>Steuer %</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={product.taxRate}
                                    onChange={(event) =>
                                      actions.updateProduct(product.id, {
                                        taxRate: Number(event.target.value || "0")
                                      })
                                    }
                                  />
                                </label>
                              </div>
                            </AccordionSection>
                          );
                        })
                      )}
                    </section>
                  ))}
                </div>
              </div>
            </AccordionSection>
          </div>

          <div id="mitarbeiter">
            <AccordionSection
              title="Mitarbeiter"
              eyebrow="Zugänge, Rollen und Aktivstatus"
              defaultOpen={false}
              className="kiju-admin-accordion"
              action={<StatusPill label={`${state.users.length} Konten`} tone="navy" />}
            >
              <div className="kiju-admin-layout">
                <form className="kiju-admin-panel" onSubmit={handleCreateUser}>
                  <strong>Neues Konto anlegen</strong>
                  <label className="kiju-inline-field">
                    <span>Name</span>
                    <input
                      value={userForm.name}
                      onChange={(event) =>
                        setUserForm((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </label>
                  <div className="kiju-admin-row">
                    <label className="kiju-inline-field">
                      <span>Benutzername</span>
                      <input
                        value={userForm.username}
                        onChange={(event) =>
                          setUserForm((current) => ({
                            ...current,
                            username: event.target.value
                          }))
                        }
                      />
                    </label>
                    <label className="kiju-inline-field">
                      <span>Rolle</span>
                      <select
                        value={userForm.role}
                        onChange={(event) =>
                          setUserForm((current) => ({
                            ...current,
                            role: event.target.value as Role
                          }))
                        }
                      >
                        <option value="waiter">Kellner</option>
                        <option value="kitchen">Küche</option>
                        <option value="admin">Admin</option>
                      </select>
                    </label>
                  </div>
                  <div className="kiju-admin-row">
                    <label className="kiju-inline-field">
                      <span>Passwort</span>
                      <input
                        value={userForm.password}
                        onChange={(event) =>
                          setUserForm((current) => ({
                            ...current,
                            password: event.target.value
                          }))
                        }
                      />
                    </label>
                    <label className="kiju-inline-field">
                      <span>PIN</span>
                      <input
                        value={userForm.pin}
                        onChange={(event) =>
                          setUserForm((current) => ({ ...current, pin: event.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <button type="submit" className="kiju-button kiju-button--primary">
                    <PlusCircle size={18} />
                    Mitarbeiter anlegen
                  </button>
                </form>

                <div className="kiju-admin-list">
                  {state.users.map((user) => {
                    const draft = userDrafts[user.id] ?? {
                      name: user.name,
                      username: user.username,
                      role: user.role,
                      password: user.password,
                      pin: user.pin ?? "",
                      active: user.active
                    };

                    return (
                      <article key={user.id} className="kiju-admin-panel">
                        <div className="kiju-admin-row kiju-admin-row--top">
                          <div className="kiju-admin-heading-stack">
                            <strong>{user.name}</strong>
                            <span>{user.username}</span>
                          </div>
                          <div className="kiju-admin-action-row">
                            <StatusPill
                              label={`${roleLabels[draft.role]}${draft.active ? "" : " · inaktiv"}`}
                              tone={draft.active ? "green" : "slate"}
                            />
                            <button
                              type="button"
                              className="kiju-button kiju-button--danger"
                              onClick={() => handleDeleteUser(user.id)}
                            >
                              <Trash2 size={16} />
                              Löschen
                            </button>
                          </div>
                        </div>

                        <div className="kiju-admin-row">
                          <label className="kiju-inline-field">
                            <span>Name</span>
                            <input
                              value={draft.name}
                              onChange={(event) =>
                                handleUserDraftChange(user.id, { name: event.target.value })
                              }
                            />
                          </label>
                          <label className="kiju-inline-field">
                            <span>Benutzername</span>
                            <input
                              value={draft.username}
                              onChange={(event) =>
                                handleUserDraftChange(user.id, { username: event.target.value })
                              }
                            />
                          </label>
                        </div>

                        <div className="kiju-admin-row">
                          <label className="kiju-inline-field">
                            <span>Rolle</span>
                            <select
                              value={draft.role}
                              onChange={(event) =>
                                handleUserDraftChange(user.id, {
                                  role: event.target.value as Role
                                })
                              }
                            >
                              <option value="waiter">Kellner</option>
                              <option value="kitchen">Küche</option>
                              <option value="admin">Admin</option>
                            </select>
                          </label>
                          <label className="kiju-inline-field">
                            <span>PIN</span>
                            <input
                              value={draft.pin}
                              onChange={(event) =>
                                handleUserDraftChange(user.id, { pin: event.target.value })
                              }
                            />
                          </label>
                        </div>

                        <div className="kiju-admin-row">
                          <label className="kiju-inline-field">
                            <span>Passwort</span>
                            <input
                              value={draft.password}
                              onChange={(event) =>
                                handleUserDraftChange(user.id, { password: event.target.value })
                              }
                            />
                          </label>
                          <label className="kiju-checkbox-row">
                            <input
                              type="checkbox"
                              checked={draft.active}
                              onChange={(event) =>
                                handleUserDraftChange(user.id, { active: event.target.checked })
                              }
                            />
                            <span>Konto aktiv</span>
                          </label>
                        </div>

                        <div className="kiju-admin-meta">
                          <span>{userAssignments.get(user.id) ?? 0} Session-Zuordnungen</span>
                          <span>
                            Zuletzt aktiv:{" "}
                            {user.lastSeenAt
                              ? new Date(user.lastSeenAt).toLocaleString("de-DE")
                              : "Noch kein Login"}
                          </span>
                        </div>

                        <button
                          type="button"
                          className="kiju-button kiju-button--primary"
                          onClick={() => handleSaveUser(user.id)}
                        >
                          <Save size={18} />
                          Änderungen speichern
                        </button>
                      </article>
                    );
                  })}
                </div>
              </div>
            </AccordionSection>
          </div>

          <div id="tische">
            <AccordionSection
              title="Tische"
              eyebrow="Raumlogik, Sitzplätze und Status"
              defaultOpen={false}
              className="kiju-admin-accordion"
              action={<StatusPill label={`${state.tables.length} Tische`} tone="navy" />}
            >
              <article className="kiju-admin-panel kiju-admin-mode-panel">
                <div className="kiju-admin-row kiju-admin-row--top">
                  <div className="kiju-admin-heading-stack">
                    <strong>Bestellmodus im Service</strong>
                    <span>Standard ist ganzer Tisch, Sitzplätze können bei Bedarf aktiviert werden.</span>
                  </div>
                  <StatusPill
                    label={state.serviceOrderMode === "seat" ? "Sitzplätze" : "Ganzer Tisch"}
                    tone={state.serviceOrderMode === "seat" ? "amber" : "green"}
                  />
                </div>
                <div className="kiju-admin-action-row">
                  <button
                    type="button"
                    className={`kiju-button ${
                      state.serviceOrderMode === "table"
                        ? "kiju-button--primary"
                        : "kiju-button--secondary"
                    }`}
                    onClick={() => handleServiceOrderModeChange("table")}
                  >
                    Ganzer Tisch
                  </button>
                  <button
                    type="button"
                    className={`kiju-button ${
                      state.serviceOrderMode === "seat"
                        ? "kiju-button--primary"
                        : "kiju-button--secondary"
                    }`}
                    onClick={() => handleServiceOrderModeChange("seat")}
                  >
                    Sitzplätze verwenden
                  </button>
                </div>
              </article>
              <div className="kiju-admin-layout">
                <form className="kiju-admin-panel" onSubmit={handleCreateTable}>
                  <strong>Neuen Tisch anlegen</strong>
                  <label className="kiju-inline-field">
                    <span>Name</span>
                    <input
                      value={tableForm.name}
                      onChange={(event) =>
                        setTableForm((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </label>
                  <div className="kiju-admin-row">
                    <label className="kiju-inline-field">
                      <span>Sitzplätze</span>
                      <input
                        type="number"
                        min="1"
                        max="12"
                        step="1"
                        value={tableForm.seatCount}
                        onChange={(event) =>
                          setTableForm((current) => ({
                            ...current,
                            seatCount: event.target.value
                          }))
                        }
                      />
                    </label>
                    <label className="kiju-checkbox-row">
                      <input
                        type="checkbox"
                        checked={tableForm.active}
                        onChange={(event) =>
                          setTableForm((current) => ({ ...current, active: event.target.checked }))
                        }
                      />
                      <span>Direkt aktiv</span>
                    </label>
                  </div>
                  <label className="kiju-inline-field">
                    <span>Notiz</span>
                    <textarea
                      value={tableForm.note}
                      onChange={(event) =>
                        setTableForm((current) => ({ ...current, note: event.target.value }))
                      }
                    />
                  </label>
                  <button type="submit" className="kiju-button kiju-button--primary">
                    <PlusCircle size={18} />
                    Tisch anlegen
                  </button>
                </form>

                <div className="kiju-admin-list">
                  {state.tables.map((table) => {
                    const usage = tableAssignments.get(table.id) ?? {
                      sessions: 0,
                      items: 0,
                      closed: 0
                    };

                    return (
                      <article key={table.id} className="kiju-admin-panel">
                        <div className="kiju-admin-row kiju-admin-row--top">
                          <div className="kiju-admin-heading-stack">
                            <strong>{table.name}</strong>
                            <span>{table.seatCount} Sitzplätze</span>
                          </div>
                          <div className="kiju-admin-action-row">
                            <StatusPill
                              label={table.active ? "Aktiv" : "Geplant"}
                              tone={table.active ? "green" : "slate"}
                            />
                            <button
                              type="button"
                              className="kiju-button kiju-button--danger"
                              onClick={() => handleDeleteTable(table.id)}
                            >
                              <Trash2 size={16} />
                              Löschen
                            </button>
                          </div>
                        </div>

                        <div className="kiju-admin-row">
                          <label className="kiju-inline-field">
                            <span>Name</span>
                            <input
                              value={table.name}
                              onChange={(event) =>
                                actions.updateTable(table.id, { name: event.target.value })
                              }
                            />
                          </label>
                          <label className="kiju-checkbox-row">
                            <input
                              type="checkbox"
                              checked={table.active}
                              onChange={(event) =>
                                actions.updateTable(table.id, { active: event.target.checked })
                              }
                            />
                            <span>Tisch ist aktiv und im Service sichtbar</span>
                          </label>
                        </div>

                        <label className="kiju-inline-field">
                          <span>Notiz</span>
                          <textarea
                            value={table.note ?? ""}
                            onChange={(event) =>
                              actions.updateTable(table.id, { note: event.target.value })
                            }
                          />
                        </label>

                        <div className="kiju-admin-seat-list">
                          <div className="kiju-admin-heading-stack">
                            <strong>Sitzplätze im Service</strong>
                            <span>Ausgeblendete Plätze werden nicht mehr für neue Bestellungen angeboten.</span>
                          </div>
                          <div className="kiju-admin-seat-grid">
                            {table.seats.map((seat) => (
                              <label key={seat.id} className="kiju-checkbox-row">
                                <input
                                  type="checkbox"
                                  checked={seat.visible !== false}
                                  onChange={(event) =>
                                    handleSeatVisibleChange(
                                      table.id,
                                      seat.id,
                                      event.target.checked
                                    )
                                  }
                                />
                                <span>{seat.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="kiju-admin-meta">
                          <span>{usage.sessions} Sessions gesamt</span>
                          <span>{usage.closed} Abschlüsse</span>
                          <span>{usage.items} Positionen am Tisch</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </AccordionSection>
          </div>

          <div id="bestellungen">
            <AccordionSection
              title="Bestellungen"
              eyebrow="Offene und abgeschlossene Sessions"
              defaultOpen={false}
              className="kiju-admin-accordion"
              action={<StatusPill label={`${sortedSessions.length} Sessions`} tone="navy" />}
            >
              {sortedSessions.length === 0 ? (
                <div className="kiju-inline-panel">
                  <span>Aktuell sind keine Bestellungen vorhanden.</span>
                </div>
              ) : (
                <div className="kiju-admin-session-grid">
                  {sortedSessions.map((session) => {
                    const table =
                      state.tables.find((entry) => entry.id === session.tableId) ?? null;
                    const waiter =
                      state.users.find((entry) => entry.id === session.waiterId) ?? null;

                    return (
                      <article key={session.id} className="kiju-admin-session-card">
                        <div className="kiju-admin-session-card__header">
                          <div className="kiju-admin-heading-stack">
                            <strong>{table?.name ?? session.tableId.replace("table-", "Tisch ")}</strong>
                            <span>{waiter?.name ?? "Nicht zugeordnet"}</span>
                          </div>
                          <div className="kiju-admin-action-row">
                            <StatusPill
                              label={sessionStatusLabels[session.status] ?? "Status"}
                              tone={sessionStatusTones[session.status] ?? "slate"}
                            />
                            <button
                              type="button"
                              className="kiju-button kiju-button--danger"
                              onClick={() => handleDeleteSession(session.id)}
                            >
                              <Trash2 size={16} />
                              Löschen
                            </button>
                          </div>
                        </div>

                        <div className="kiju-admin-session-card__meta">
                          <span>{calculateGuestCount(session)} Gäste</span>
                          <span>{session.items.length} Positionen</span>
                          <span>{euro(calculateSessionTotal(session, state.products))}</span>
                        </div>

                        <div className="kiju-admin-session-card__items">
                          {session.items.length === 0 ? (
                            <div className="kiju-inline-panel">
                              <span>Diese Session enthält aktuell keine Positionen.</span>
                            </div>
                          ) : (
                            session.items.map((item) => {
                              const targetLabel = (() => {
                                if (item.target.type === "table") {
                                  return "Tisch";
                                }

                                const seatId = item.target.seatId;
                                return table?.seats.find((seat) => seat.id === seatId)?.label ?? seatId;
                              })();

                              return (
                                <div key={item.id} className="kiju-line-item">
                                  <span>
                                    {item.quantity}× {resolveProductName(state.products, item.productId)}
                                  </span>
                                  <span>
                                    {targetLabel} · {courseLabels[item.category]}
                                  </span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </AccordionSection>
          </div>

          <div id="reset">
            <AccordionSection
              title="Reset"
              eyebrow="Systemstart und Standardkonfiguration"
              defaultOpen={false}
              className="kiju-admin-accordion"
              action={<StatusPill label="Geschützt" tone="red" />}
            >
              <div className="kiju-danger-zone">
                <article className="kiju-danger-block">
                  <div className="kiju-danger-copy">
                    <strong>Standardkonfiguration wiederherstellen</strong>
                    <p>
                      Lädt die feste Grundkonfiguration neu. Tische, Leistungen und Benutzer werden
                      auf Standard gesetzt; laufende Bestellungen, Hinweise und Tageswerte werden
                      zurückgesetzt.
                    </p>
                    <small>{zeroResetSteps[resetStep]}</small>
                  </div>
                  <div className="kiju-danger-actions">
                    <button
                      type="button"
                      className="kiju-button kiju-button--danger"
                      onClick={handleResetClick}
                    >
                      <AlertTriangle size={18} />
                      {resetStep === zeroResetSteps.length - 1
                        ? "Jetzt endgültig Standard laden"
                        : "Sicherheitsstufe bestätigen"}
                    </button>
                    {resetStep > 0 ? (
                      <button
                        type="button"
                        className="kiju-button kiju-button--secondary"
                        onClick={() => setResetStep(0)}
                      >
                        <RotateCcw size={18} />
                        Sicherheitsstufen zurücksetzen
                      </button>
                    ) : null}
                  </div>
                </article>
              </div>
            </AccordionSection>
          </div>
        </div>
      </main>
    </RouteGuard>
  );
};
