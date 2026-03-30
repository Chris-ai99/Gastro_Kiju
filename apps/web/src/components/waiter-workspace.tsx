"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  ChefHat,
  CirclePause,
  Clock3,
  Euro,
  Minus,
  Plus,
  Receipt,
  ShoppingBag,
  Trash2,
  Users
} from "lucide-react";

import { routeConfig, serviceLabels } from "@kiju/config";
import { buildDashboardSummary, euro, type CourseKey, type OrderItem } from "@kiju/domain";
import { AccordionSection, MetricCard, ProgressSteps, SectionCard, StatusPill } from "@kiju/ui";

import {
  calculateSessionTotal,
  courseLabels,
  getOrderableProducts,
  getSessionForTable,
  resolveCourseStatus,
  resolveProductName,
  useDemoApp
} from "../lib/app-state";
import { RoleSwitchPopover } from "./role-switch-popover";
import { RouteGuard } from "./route-guard";

const serviceSteps = ["Getränke", "Vorspeise", "Hauptspeise", "Nachtisch", "Review"] as const;

const normalizePublicBasePath = (value?: string) => {
  if (!value) return "";

  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";

  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
};

const waiterFloorplanImageSrc = `${normalizePublicBasePath(process.env["NEXT_PUBLIC_BASE_PATH"])}/haus-amos-floorplan-map.svg`;

type FloorplanHotspot = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type FloorplanSeatAnchor = {
  left: number;
  top: number;
};

const waiterFloorplanHotspots: Record<string, FloorplanHotspot> = {
  "table-1": { left: 2.4, top: 16.2, width: 11.4, height: 18.8 },
  "table-2": { left: 2.4, top: 62.6, width: 11.4, height: 18.8 },
  "table-3": { left: 29.8, top: 6.6, width: 12.5, height: 22.5 },
  "table-4": { left: 48.7, top: 6.6, width: 12.5, height: 22.5 },
  "table-5": { left: 80.2, top: 6.6, width: 12.8, height: 29.2 },
  "table-6": { left: 80.2, top: 35.7, width: 12.8, height: 29.4 }
};

const waiterFloorplanSeatAnchors: Record<string, FloorplanSeatAnchor[]> = {
  "table-1": [
    { left: 5.8, top: 14.8 },
    { left: 11.4, top: 14.8 },
    { left: 20.0, top: 25.2 },
    { left: 5.6, top: 36.8 },
    { left: 11.4, top: 36.8 }
  ],
  "table-2": [
    { left: 5.8, top: 59.8 },
    { left: 11.5, top: 59.8 },
    { left: 18.0, top: 71.4 },
    { left: 5.6, top: 83.2 },
    { left: 11.4, top: 83.2 }
  ],
  "table-3": [
    { left: 29, top: 11 },
    { left: 40, top: 11 },
    { left: 29, top: 24.8 },
    { left: 40.2, top: 24.8 },
    { left: 34.5, top: 36 }
  ],
  "table-4": [
    { left: 50.3, top: 11 },
    { left: 61.0, top: 11 },
    { left: 50.3, top: 24.8 },
    { left: 61.0, top: 24.8 },
    { left: 55.7, top: 36 }
  ],
  "table-5": [
    { left: 81.0, top: 14 },
    { left: 92.6, top: 14 },
    { left: 91.6, top: 28 },
    { left: 81, top: 28 }
  ],
  "table-6": [
    { left: 81.0, top: 43.8 },
    { left: 92.1, top: 43.8 },
    { left: 81.0, top: 57.9 },
    { left: 92.1, top: 57.5 },
    { left: 86.6, top: 75.6 }
  ]
};

const statusLabel: Record<string, string> = {
  idle: "Bereit",
  serving: "In Bedienung",
  hold: "Hold",
  waiting: "Warten",
  "ready-to-bill": "Verbuchen",
  planned: "Geplant"
};

const toneByStatus: Record<string, "navy" | "amber" | "red" | "green" | "slate"> = {
  idle: "slate",
  serving: "navy",
  hold: "amber",
  waiting: "red",
  "ready-to-bill": "green",
  planned: "slate"
};

const courseTicketStatusLabels: Record<string, string> = {
  "not-recorded": "Noch nicht gesendet",
  blocked: "Blockiert in der Küche",
  countdown: "In Warteschlange",
  ready: "Servierbereit",
  completed: "Abgeschlossen",
  skipped: "Übersprungen"
};

const courseTicketStatusTones: Record<string, "navy" | "amber" | "red" | "green" | "slate"> = {
  "not-recorded": "slate",
  blocked: "red",
  countdown: "amber",
  ready: "green",
  completed: "navy",
  skipped: "slate"
};

export const WaiterWorkspace = () => {
  const { state, currentUser, unreadNotifications, sharedSync, actions } = useDemoApp();
  const serviceSectionRef = useRef<HTMLElement | null>(null);
  const dashboard = useMemo(() => buildDashboardSummary(state), [state]);
  const defaultTableId =
    dashboard.find((entry) => entry.table.active)?.table.id ?? dashboard[0]?.table.id ?? null;
  const [selectedTableId, setSelectedTableId] = useState<string | null>(defaultTableId);
  const [selectedSeatId, setSelectedSeatId] = useState("");
  const [activeCourse, setActiveCourse] = useState<CourseKey | "review">("drinks");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "voucher">("cash");
  const [serviceFeedback, setServiceFeedback] = useState<{
    tone: "success" | "alert" | "info";
    title: string;
    detail: string;
  } | null>(null);

  const isWaiterView = currentUser?.role === "waiter";
  const selectedTable = state.tables.find((table) => table.id === selectedTableId) ?? null;
  const selectedSession = selectedTable
    ? getSessionForTable(state.sessions, selectedTable.id)
    : undefined;
  const waiterMenuEntries = dashboard.filter(
    (entry) => entry.table.active || entry.table.plannedOnly || entry.table.id === selectedTableId
  );
  const waiterFloorplanEntries = waiterMenuEntries.filter(
    (entry) => entry.table.active && waiterFloorplanHotspots[entry.table.id]
  );

  useEffect(() => {
    if (!selectedTable && defaultTableId) {
      setSelectedTableId(defaultTableId);
      return;
    }

    if (!defaultTableId && selectedTableId) {
      setSelectedTableId(null);
    }
  }, [defaultTableId, selectedTable, selectedTableId]);

  useEffect(() => {
    if (!selectedTable) {
      if (selectedSeatId !== "") {
        setSelectedSeatId("");
      }
      return;
    }

    if (!selectedTable.seats.some((seat) => seat.id === selectedSeatId)) {
      setSelectedSeatId(selectedTable.seats[0]?.id ?? "");
    }
  }, [selectedSeatId, selectedTable]);

  const currentProducts = useMemo(
    () => (activeCourse === "review" ? [] : getOrderableProducts(state.products, activeCourse)),
    [activeCourse, state.products]
  );
  const activeTableCount = dashboard.filter(
    (entry) => entry.status !== "idle" && entry.status !== "planned"
  ).length;
  const attentionTableCount = dashboard.filter(
    (entry) =>
      entry.status === "hold" || entry.status === "waiting" || entry.status === "ready-to-bill"
  ).length;
  const selectedSeatLabel =
    selectedTable?.seats.find((seat) => seat.id === selectedSeatId)?.label ?? "Sitzplatz";
  const activeCourseTicketState =
    activeCourse === "review" || !selectedSession
      ? null
      : resolveCourseStatus(selectedSession, activeCourse);
  const syncStatusLabel =
    sharedSync.status === "online"
      ? "Geräte-Sync aktiv"
      : sharedSync.status === "connecting"
        ? "Synchronisiere..."
        : "Nur lokaler Stand";
  const syncStatusTone =
    sharedSync.status === "online"
      ? "green"
      : sharedSync.status === "connecting"
        ? "amber"
        : "red";
  const editableItems = useMemo(() => {
    if (!selectedSession || !selectedSeatId) return [];

    return selectedSession.items.filter((item) =>
      activeCourse === "review"
        ? item.seatId === selectedSeatId
        : item.seatId === selectedSeatId && item.category === activeCourse
    );
  }, [activeCourse, selectedSeatId, selectedSession]);

  const sessionTotal = calculateSessionTotal(selectedSession, state.products);

  useEffect(() => {
    setServiceFeedback(null);
  }, [activeCourse, selectedSeatId, selectedTableId]);

  const scrollToServiceSection = () => {
    window.requestAnimationFrame(() => {
      serviceSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  };

  const selectTable = (tableId: string, scrollToService = false) => {
    const nextTable = state.tables.find((table) => table.id === tableId);
    if (!nextTable) return;

    setSelectedTableId(tableId);
    setSelectedSeatId(nextTable.seats[0]?.id ?? "");

    if (!scrollToService) return;

    scrollToServiceSection();
  };

  const selectSeat = (tableId: string, seatId: string, scrollToService = false) => {
    const nextTable = state.tables.find((table) => table.id === tableId);
    if (!nextTable || !nextTable.seats.some((seat) => seat.id === seatId)) return;

    setSelectedTableId(tableId);
    setSelectedSeatId(seatId);

    if (!scrollToService) return;

    scrollToServiceSection();
  };

  const handleSendCourseToKitchen = () => {
    if (!selectedTable || activeCourse === "review") return;

    const result = actions.sendCourseToKitchen(selectedTable.id, activeCourse);

    if (!result.ok) {
      setServiceFeedback({
        tone: "alert",
        title: "Noch nicht gesendet",
        detail: result.message ?? "Die Positionen konnten nicht an die Küche gesendet werden."
      });
      return;
    }

    const syncHint =
      sharedSync.status === "online"
        ? "Der Bon ist für Küche und andere Geräte jetzt im gemeinsamen Stand."
        : "Der Bon wurde lokal gespeichert. Für mehrere Geräte muss der gemeinsame Sync erreichbar sein.";

    setServiceFeedback({
      tone: "success",
      title: `${courseLabels[activeCourse]} gesendet`,
      detail: `${result.message ?? "Die Positionen wurden erfolgreich an die Küche gesendet."} ${syncHint}`
    });
  };

  const renderEditableItems = (items: OrderItem[], emptyMessage: string) => {
    if (!selectedTable) return null;

    if (items.length === 0) {
      return (
        <div className="kiju-inline-panel">
          <span>{emptyMessage}</span>
        </div>
      );
    }

    return items.map((item) => (
      <article key={item.id} className="kiju-order-item-card">
        <div className="kiju-order-item-card__header">
          <div>
            <strong>{resolveProductName(state.products, item.productId)}</strong>
            <small>{courseLabels[item.category]}</small>
          </div>
          <button
            type="button"
            className="kiju-button kiju-button--danger"
            onClick={() => actions.removeItem(selectedTable.id, item.id)}
          >
            <Trash2 size={16} />
            Löschen
          </button>
        </div>

        <div className="kiju-order-item-card__fields">
          <label className="kiju-inline-field">
            <span>Sitzplatz</span>
            <select
              value={item.seatId}
              onChange={(event) =>
                actions.updateItem(selectedTable.id, item.id, { seatId: event.target.value })
              }
            >
              {selectedTable.seats.map((seat) => (
                <option key={seat.id} value={seat.id}>
                  {seat.label}
                </option>
              ))}
            </select>
          </label>

          <div className="kiju-inline-field">
            <span>Menge</span>
            <div className="kiju-quantity-control">
              <button
                type="button"
                className="kiju-button kiju-button--secondary"
                onClick={() =>
                  actions.updateItem(selectedTable.id, item.id, {
                    quantity: Math.max(1, item.quantity - 1)
                  })
                }
                disabled={item.quantity <= 1}
              >
                <Minus size={16} />
              </button>
              <strong>{item.quantity}</strong>
              <button
                type="button"
                className="kiju-button kiju-button--secondary"
                onClick={() =>
                  actions.updateItem(selectedTable.id, item.id, {
                    quantity: item.quantity + 1
                  })
                }
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>

        <label className="kiju-inline-field">
          <span>Notiz</span>
          <input
            value={item.note ?? ""}
            onChange={(event) =>
              actions.updateItem(selectedTable.id, item.id, { note: event.target.value })
            }
            placeholder="Zum Beispiel ohne Zwiebeln"
          />
        </label>
      </article>
    ));
  };

  return (
    <RouteGuard allowedRoles={["waiter", "admin"]}>
      <main className="kiju-page">
        <header className="kiju-topbar">
          <div>
            <span className="kiju-eyebrow">Kellner-Dashboard</span>
            <h1>Gastro KiJu</h1>
            <p>
              Vollbild-Raumplan für den Service. Tisch antippen, nach unten springen und direkt am
              Sitzplatz weiterarbeiten.
            </p>
          </div>
          <div className="kiju-topbar-actions">
            <StatusPill label={syncStatusLabel} tone={syncStatusTone} />
            {currentUser?.role === "admin" ? (
              <>
                <Link href={routeConfig.kitchen} className="kiju-button kiju-button--secondary">
                  <ChefHat size={18} />
                  Zur Küche
                </Link>
                <Link href={routeConfig.admin} className="kiju-button kiju-button--secondary">
                  <Receipt size={18} />
                  Admin
                </Link>
              </>
            ) : (
              <details className="kiju-notification-popover">
                <summary className="kiju-notification-popover__trigger">
                  <Bell size={18} />
                  <span>Hinweise</span>
                  <strong>{unreadNotifications.length}</strong>
                </summary>
                <div className="kiju-notification-popover__panel">
                  <div className="kiju-notification-popover__header">
                    <strong>Offene Benachrichtigungen</strong>
                    <span>{unreadNotifications.length} offen</span>
                  </div>
                  {unreadNotifications.length === 0 ? (
                    <div className="kiju-inline-panel">
                      <span>Aktuell gibt es keine offenen Hinweise.</span>
                    </div>
                  ) : (
                    unreadNotifications.slice(0, 8).map((notification) => (
                      <button
                        key={notification.id}
                        type="button"
                        className="kiju-notification-row"
                        onClick={() => actions.markNotificationRead(notification.id)}
                      >
                        <Bell size={16} />
                        <div>
                          <strong>{notification.title}</strong>
                          <span>{notification.body}</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </details>
            )}
            <RoleSwitchPopover />
          </div>
        </header>

        {isWaiterView ? (
          <section className="kiju-floorplan-stage">
            <div className="kiju-floorplan-hero">
              <img
                src={waiterFloorplanImageSrc}
                alt="Kellner Hauptbild mit dem kompletten Gastraum und den Tischen 1 bis 6"
                className="kiju-floorplan-hero__image"
                loading="eager"
                decoding="async"
                fetchPriority="high"
              />
              <div className="kiju-floorplan-hero__overlay">
                {waiterFloorplanEntries.map((entry) => {
                  const hotspot = waiterFloorplanHotspots[entry.table.id];
                  const seatAnchors = waiterFloorplanSeatAnchors[entry.table.id] ?? [];
                  if (!hotspot) return null;

                  return (
                    <div key={entry.table.id}>
                      <button
                      type="button"
                      className={`kiju-floorplan-hotspot ${entry.table.id === selectedTableId ? "is-selected" : ""}`}
                      aria-label={`${entry.table.name} auswählen`}
                      style={{
                        left: `${hotspot.left}%`,
                        top: `${hotspot.top}%`,
                        width: `${hotspot.width}%`,
                        height: `${hotspot.height}%`
                      }}
                      onClick={() => selectTable(entry.table.id, true)}
                      />
                      {seatAnchors.map((seatAnchor, index) => {
                        const seat = entry.table.seats[index];
                        if (!seat) return null;

                        return (
                          <button
                            key={seat.id}
                            type="button"
                            className={`kiju-floorplan-seat-hotspot ${seat.id === selectedSeatId ? "is-selected" : ""}`}
                            aria-label={`${entry.table.name}, Platz ${index + 1} auswaehlen`}
                            style={{
                              left: `${seatAnchor.left}%`,
                              top: `${seatAnchor.top}%`
                            }}
                            onClick={() => selectSeat(entry.table.id, seat.id, true)}
                          >
                            <span>{index + 1}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        ) : (
          <section className="kiju-metric-grid">
            <MetricCard
              label="Aktive Tische"
              value={`${activeTableCount}`}
              detail="Aktuell in Bedienung, Hold oder Warten"
              icon={<ShoppingBag size={18} />}
            />
            {currentUser?.role === "admin" ? (
              <MetricCard
                label="Heute Umsatz"
                value={euro(state.dailyStats.revenueCents)}
                detail={`${state.dailyStats.servedTables} Tische / ${state.dailyStats.servedGuests} Gäste`}
                icon={<Euro size={18} />}
              />
            ) : (
              <MetricCard
                label="Warten / Hold"
                value={`${attentionTableCount}`}
                detail="Tische mit Rückfrage, Küche oder Rechnung"
                icon={<Clock3 size={18} />}
              />
            )}
            <MetricCard
              label="Offene Hinweise"
              value={`${unreadNotifications.length}`}
              detail="Toast + Sound + Badge vorbereitet"
              icon={<Bell size={18} />}
            />
            <MetricCard
              label="Offener Tisch"
              value={selectedTable?.name ?? "Kein Tisch"}
              detail={
                selectedTable
                  ? `${selectedTable.seatCount} Sitzplätze`
                  : "Aktuell nicht angelegt"
              }
              icon={<Users size={18} />}
            />
          </section>
        )}

        <div className={`kiju-workspace ${isWaiterView ? "kiju-workspace--waiter" : ""}`}>
          {!isWaiterView ? (
            <AccordionSection
              title="Raumansicht"
              eyebrow="2.5D Service-Floor"
              action={<StatusPill label={selectedTable?.note ?? "Live-Betrieb"} tone="amber" />}
              defaultOpen={true}
            >
              <div className="kiju-floorplan">
                {dashboard.map((entry) => (
                  <button
                    key={entry.table.id}
                    className={`kiju-table-tile ${entry.table.id === selectedTableId ? "is-selected" : ""}`}
                    style={{
                      left: `${entry.table.x}%`,
                      top: `${entry.table.y}%`,
                      width: `${entry.table.width}%`,
                      height: `${entry.table.height}%`
                    }}
                    onClick={() => selectTable(entry.table.id)}
                  >
                    <span className="kiju-table-tile__name">{entry.table.name}</span>
                    <StatusPill
                      label={statusLabel[entry.status] ?? "Status"}
                      tone={toneByStatus[entry.status] ?? "slate"}
                    />
                    <small>
                      {entry.guests} Gäste / {euro(entry.total)}
                    </small>
                  </button>
                ))}
                {dashboard.length === 0 ? (
                  <div className="kiju-floorplan-empty">
                    <strong>Keine Tische vorhanden</strong>
                    <span>Lege im Admin-Bereich neue Tische und Leistungen an.</span>
                  </div>
                ) : null}
                <div className="kiju-floorplan-caption">
                  <span>Raum 9,88m x 4,54m</span>
                  <span>Aktuell {state.tables.filter((table) => table.active).length} aktive Tische</span>
                </div>
              </div>
            </AccordionSection>
          ) : null}

          <section ref={serviceSectionRef} className="kiju-service-section">
            <SectionCard
              title={
                selectedTable
                  ? `Sitzplätze und Service Plus für ${selectedTable.name}`
                  : "Sitzplätze und Service Plus"
              }
              eyebrow="Direkt unter dem Floorplan"
              action={
                <button
                  className="kiju-button kiju-button--primary"
                  onClick={() => setActiveCourse("review")}
                  disabled={!selectedTable}
                >
                  {serviceLabels.finalize}
                </button>
              }
            >
              {waiterMenuEntries.length > 0 ? (
                <div className="kiju-table-menu" role="tablist" aria-label="Tischauswahl">
                  {waiterMenuEntries.map((entry) => (
                    <button
                      key={entry.table.id}
                      type="button"
                      className={`kiju-table-menu__button ${entry.table.id === selectedTableId ? "is-selected" : ""}`}
                      onClick={() => selectTable(entry.table.id)}
                    >
                      <strong>{entry.table.name}</strong>
                      <small>
                        {entry.table.seatCount} Plätze · {statusLabel[entry.status] ?? "Status"}
                      </small>
                    </button>
                  ))}
                </div>
              ) : null}

              {selectedTable ? (
                <>
                  <ProgressSteps
                    steps={serviceSteps.map((step) => step)}
                    currentStep={activeCourse === "review" ? "Review" : courseLabels[activeCourse]}
                  />

                  <div className="kiju-seat-row">
                    {selectedTable.seats.map((seat) => (
                      <button
                        key={seat.id}
                        className={`kiju-seat-chip ${seat.id === selectedSeatId ? "is-selected" : ""}`}
                        onClick={() => setSelectedSeatId(seat.id)}
                      >
                        {seat.label}
                      </button>
                    ))}
                  </div>

                  <div className="kiju-step-tabs">
                    {(["drinks", "starter", "main", "dessert"] as CourseKey[]).map((course) => (
                      <button
                        key={course}
                        className={`kiju-step-tab ${activeCourse === course ? "is-selected" : ""}`}
                        onClick={() => setActiveCourse(course)}
                      >
                        {courseLabels[course]}
                      </button>
                    ))}
                  </div>

                  {activeCourse === "review" ? (
                    <div className="kiju-review-grid">
                      <div className="kiju-review-list">
                        {selectedTable.seats.map((seat) => {
                          const seatItems =
                            selectedSession?.items.filter((item) => item.seatId === seat.id) ?? [];

                          return (
                            <article key={seat.id} className="kiju-seat-summary">
                              <header>
                                <strong>{seat.label}</strong>
                                <span>{seatItems.length} Positionen</span>
                              </header>
                              {renderEditableItems(seatItems, "Keine Positionen erfasst.")}
                            </article>
                          );
                        })}
                      </div>

                      <div className="kiju-review-actions">
                        <SectionCard title="Zahlung und Rechnung" eyebrow="Verbuchen">
                          <div className="kiju-inline-field">
                            <span>Zahlart</span>
                            <select
                              value={paymentMethod}
                              onChange={(event) =>
                                setPaymentMethod(event.target.value as "cash" | "card" | "voucher")
                              }
                            >
                              <option value="cash">Bar</option>
                              <option value="card">Karte</option>
                              <option value="voucher">Gutschein</option>
                            </select>
                          </div>
                          <div className="kiju-inline-panel">
                            <strong>Gesamtsumme</strong>
                            <span>{euro(sessionTotal)}</span>
                            <small>
                              Split nach Sitzplatz ist vorbereitet und kann weiter vertieft werden.
                            </small>
                          </div>
                          <button
                            className="kiju-button kiju-button--primary"
                            onClick={() => actions.printReceipt(selectedTable.id)}
                          >
                            {serviceLabels.printReceipt}
                          </button>
                          <button
                            className="kiju-button kiju-button--secondary"
                            onClick={() => actions.reprintReceipt(selectedTable.id)}
                            disabled={!selectedSession?.receipt.printedAt}
                          >
                            {serviceLabels.reprintReceipt}
                          </button>
                          <button
                            className="kiju-button kiju-button--danger"
                            onClick={() => actions.closeOrder(selectedTable.id, paymentMethod)}
                            disabled={!selectedSession?.receipt.printedAt}
                          >
                            {serviceLabels.closeOrder}
                          </button>
                        </SectionCard>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="kiju-product-grid">
                        {currentProducts.map((product) => (
                          <button
                            key={product.id}
                            className="kiju-product-card"
                            onClick={() => actions.addItem(selectedTable.id, selectedSeatId, product.id)}
                          >
                            <div>
                              <strong>{product.name}</strong>
                              <p>{product.description}</p>
                            </div>
                            <div className="kiju-product-footer">
                              <StatusPill label={`${product.taxRate}% MwSt`} tone="slate" />
                              <span>{euro(product.priceCents)}</span>
                            </div>
                          </button>
                        ))}
                      </div>

                      <AccordionSection
                        title={`Erfasste Leistungen für ${selectedSeatLabel}`}
                        eyebrow={courseLabels[activeCourse]}
                        defaultOpen={true}
                        contentClassName="kiju-order-editor"
                      >
                        <div className="kiju-order-editor__header">
                          <div>
                            <strong>Positionen können direkt bearbeitet oder gelöscht werden.</strong>
                            <span>So bleibt der Tisch im Service schneller und übersichtlicher.</span>
                          </div>
                        </div>
                        <div className="kiju-order-editor__list">
                          {renderEditableItems(
                            editableItems,
                            `Für ${selectedSeatLabel} wurde in ${courseLabels[activeCourse]} noch nichts erfasst.`
                          )}
                        </div>
                      </AccordionSection>

                      <div className="kiju-service-sync-row">
                        <StatusPill
                          label={
                            activeCourseTicketState
                              ? courseTicketStatusLabels[activeCourseTicketState.status] ??
                                activeCourseTicketState.status
                              : "Noch nicht gesendet"
                          }
                          tone={
                            activeCourseTicketState
                              ? courseTicketStatusTones[activeCourseTicketState.status] ?? "slate"
                              : "slate"
                          }
                        />
                        <StatusPill label={syncStatusLabel} tone={syncStatusTone} />
                      </div>

                      {serviceFeedback ? (
                        <div
                          className={`kiju-inline-panel kiju-inline-panel--feedback is-${serviceFeedback.tone}`}
                        >
                          <strong>{serviceFeedback.title}</strong>
                          <span>{serviceFeedback.detail}</span>
                        </div>
                      ) : null}

                      <div className="kiju-step-actions">
                        <button
                          className="kiju-button kiju-button--secondary"
                          onClick={() =>
                            actions.setSessionStatus(
                              selectedTable.id,
                              "hold",
                              "Manuell auf Hold gesetzt"
                            )
                          }
                        >
                          <CirclePause size={18} />
                          {serviceLabels.onHold}
                        </button>
                        <button
                          className="kiju-button kiju-button--secondary"
                          onClick={() => actions.setSessionStatus(selectedTable.id, "waiting")}
                        >
                          <Clock3 size={18} />
                          {serviceLabels.waiting}
                        </button>
                        <button
                          className="kiju-button kiju-button--secondary"
                          onClick={() => actions.skipCourse(selectedTable.id, activeCourse)}
                        >
                          Gang überspringen
                        </button>
                        <button
                          className="kiju-button kiju-button--primary"
                          onClick={handleSendCourseToKitchen}
                        >
                          <ChefHat size={18} />
                          {serviceLabels.sendToKitchen}
                        </button>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="kiju-empty-state kiju-empty-state--compact">
                  <strong>Kein Tisch angelegt</strong>
                  <span>
                    Im Admin-Bereich kannst du neue Tische und Leistungen anlegen.
                  </span>
                </div>
              )}
            </SectionCard>
          </section>

          <AccordionSection
            title={selectedTable ? "Tischzusammenfassung" : "Tischstatus"}
            eyebrow="Live für den gewählten Tisch"
            action={
              <StatusPill
                label={statusLabel[selectedSession?.status ?? "idle"] ?? "Status"}
                tone={toneByStatus[selectedSession?.status ?? "idle"] ?? "slate"}
              />
            }
            defaultOpen={true}
          >
            {!selectedTable ? (
              <p>Aktuell ist kein Tisch vorhanden. Nutze den Admin-Bereich für die Standardkonfiguration oder den Neuaufbau.</p>
            ) : selectedSession ? (
              <>
                <div className="kiju-inline-panel">
                  <strong>Gesamt</strong>
                  <span>{euro(sessionTotal)}</span>
                  <small>
                    {selectedSession.items.length} Positionen für {selectedTable.seatCount} Sitze
                  </small>
                </div>
                <div className="kiju-inline-panel">
                  <strong>Direkt bearbeiten</strong>
                  <small>
                    Positionen können hier direkt verschoben, in der Menge geändert oder gelöscht
                    werden.
                  </small>
                </div>
                {selectedTable.seats.map((seat) => {
                  const seatItems = selectedSession.items.filter((item) => item.seatId === seat.id);
                  return (
                    <article key={seat.id} className="kiju-seat-summary">
                      <header>
                        <strong>{seat.label}</strong>
                        <span>{seatItems.length} Artikel</span>
                      </header>
                      <div className="kiju-seat-summary__items">
                        {renderEditableItems(seatItems, "Noch keine Positionen.")}
                      </div>
                    </article>
                  );
                })}
              </>
            ) : (
              <p>Für diesen Tisch wurde noch keine Bestellung gestartet.</p>
            )}
          </AccordionSection>
        </div>
      </main>
    </RouteGuard>
  );
};
