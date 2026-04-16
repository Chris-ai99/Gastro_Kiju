"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  ChefHat,
  CheckCircle2,
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
import {
  buildDashboardSummary,
  euro,
  getSeatItems,
  getTableTargetItems,
  type CourseKey,
  type OrderItem,
  type OrderTarget,
  type TableSeat
} from "@kiju/domain";
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

const serviceSteps = ["GetrÃ¤nke", "Vorspeise", "Hauptspeise", "Nachtisch", "Review"] as const;

const normalizePublicBasePath = (value?: string) => {
  if (!value) return "";

  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";

  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
};

const waiterFloorplanImageSrc = `${normalizePublicBasePath(process.env["NEXT_PUBLIC_BASE_PATH"])}/kellner-haupt-bild.png`;

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
  blocked: "Blockiert in der KÃ¼che",
  countdown: "In Warteschlange",
  ready: "Servierbereit",
  completed: "Abgeschlossen",
  skipped: "Ãœbersprungen"
};

const courseTicketStatusTones: Record<string, "navy" | "amber" | "red" | "green" | "slate"> = {
  "not-recorded": "slate",
  blocked: "red",
  countdown: "amber",
  ready: "green",
  completed: "navy",
  skipped: "slate"
};

const tableOrderTarget: OrderTarget = { type: "table" };

const isSeatVisible = (seat: TableSeat) => seat.visible !== false;

const getVisibleSeats = (seats: TableSeat[]) => seats.filter(isSeatVisible);

const isItemForTarget = (item: OrderItem, target: OrderTarget) =>
  target.type === "table"
    ? item.target.type === "table"
    : item.target.type === "seat" && item.target.seatId === target.seatId;

const serviceTicketCourses: CourseKey[] = ["drinks", "starter", "main", "dessert"];

const ticketStatusDisplayLabels: Record<string, string> = {
  "not-recorded": "Noch nicht gesendet",
  blocked: "Noch nicht zubereiten",
  countdown: "Wartezeit lÃ¤uft",
  ready: "Frei in der KÃ¼che",
  completed: "Fertig in der KÃ¼che",
  skipped: "Ãœbersprungen"
};

const ticketStatusDisplayTones: Record<string, "navy" | "amber" | "red" | "green" | "slate"> = {
  "not-recorded": "slate",
  blocked: "red",
  countdown: "amber",
  ready: "navy",
  completed: "green",
  skipped: "slate"
};

const describeCourseTicketStatus = (status: string, minutesLeft: number) => {
  switch (status) {
    case "not-recorded":
      return "Der Gang ist erfasst, aber noch nicht an die KÃ¼che gesendet.";
    case "blocked":
      return `Noch ${minutesLeft} Min. gesperrt. Nur der Service kann die Wartezeit Ã¼berspringen.`;
    case "countdown":
      return `Noch ${minutesLeft} Min. bis der Gang in der KÃ¼che freigegeben ist.`;
    case "ready":
      return "Jetzt frei in der KÃ¼che. Noch nicht als fertig gemeldet.";
    case "completed":
      return "In der KÃ¼che als fertig markiert. Der Service kann servieren.";
    case "skipped":
      return "Dieser Gang wurde Ã¼bersprungen.";
    default:
      return "Aktueller Stand wird synchronisiert.";
  }
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
  const serviceOrderMode = state.serviceOrderMode ?? "table";
  const usesSeatMode = serviceOrderMode === "seat";
  const visibleSeats = useMemo(
    () => (selectedTable ? getVisibleSeats(selectedTable.seats) : []),
    [selectedTable]
  );
  const selectedOrderTarget: OrderTarget =
    usesSeatMode && selectedSeatId ? { type: "seat", seatId: selectedSeatId } : tableOrderTarget;
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

    if (!usesSeatMode) {
      if (selectedSeatId !== "") {
        setSelectedSeatId("");
      }
      return;
    }

    if (!visibleSeats.some((seat) => seat.id === selectedSeatId)) {
      setSelectedSeatId(visibleSeats[0]?.id ?? "");
    }
  }, [selectedSeatId, selectedTable, usesSeatMode, visibleSeats]);

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
  const selectedTargetLabel =
    selectedOrderTarget.type === "table"
      ? "Tisch"
      : selectedTable?.seats.find((seat) => seat.id === selectedOrderTarget.seatId)?.label ??
        "Sitzplatz";
  const activeCourseTicketState =
    activeCourse === "review" || !selectedSession
      ? null
      : resolveCourseStatus(selectedSession, activeCourse);
  const syncStatusLabel =
    sharedSync.status === "online"
      ? "GerÃ¤te-Sync aktiv"
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
    if (!selectedSession) return [];

    if (!usesSeatMode) {
      return selectedSession.items.filter((item) =>
        activeCourse === "review" ? true : item.category === activeCourse
      );
    }

    return selectedSession.items.filter((item) =>
      activeCourse === "review"
        ? isItemForTarget(item, selectedOrderTarget)
        : isItemForTarget(item, selectedOrderTarget) && item.category === activeCourse
    );
  }, [activeCourse, selectedOrderTarget, selectedSession, usesSeatMode]);
  const tableTargetItems = useMemo(
    () => (usesSeatMode ? getTableTargetItems(selectedSession) : selectedSession?.items ?? []),
    [selectedSession, usesSeatMode]
  );
  const visibleSeatSummaries = useMemo(
    () => visibleSeats.map((seat) => ({ seat, items: getSeatItems(selectedSession, seat.id) })),
    [selectedSession, visibleSeats]
  );
  const tableCourseStatuses = useMemo(() => {
    if (!selectedSession) return [];

    return serviceTicketCourses
      .map((course) => {
        const itemCount = selectedSession.items
          .filter((item) => item.category === course)
          .reduce((sum, item) => sum + item.quantity, 0);
        const resolved = resolveCourseStatus(selectedSession, course);

        return {
          course,
          itemCount,
          minutesLeft: resolved.minutesLeft,
          status: resolved.status
        };
      })
      .filter((entry) => entry.itemCount > 0 || entry.status !== "not-recorded");
  }, [selectedSession]);

  const sessionTotal = calculateSessionTotal(selectedSession, state.products);
  const activeServiceNotification =
    unreadNotifications.find((notification) => notification.kind === "service-drinks") ??
    unreadNotifications.find(
      (notification) =>
        notification.kind === "service-drinks-accepted" ||
        notification.kind === "service-course-ready"
    ) ??
    null;
  const drinkDeliveryNotifications = unreadNotifications.filter(
    (notification) => notification.kind === "service-drinks"
  );
  const canSkipActiveCourseTimer =
    !!selectedTable &&
    activeCourse !== "review" &&
    activeCourse !== "drinks" &&
    !!activeCourseTicketState &&
    (activeCourseTicketState.status === "blocked" || activeCourseTicketState.status === "countdown") &&
    activeCourseTicketState.minutesLeft > 0;

  useEffect(() => {
    setServiceFeedback(null);
  }, [activeCourse, selectedSeatId, selectedTableId, serviceOrderMode]);

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
    setSelectedSeatId(usesSeatMode ? getVisibleSeats(nextTable.seats)[0]?.id ?? "" : "");

    if (!scrollToService) return;

    scrollToServiceSection();
  };

  const selectSeat = (tableId: string, seatId: string, scrollToService = false) => {
    const nextTable = state.tables.find((table) => table.id === tableId);
    if (
      !usesSeatMode ||
      !nextTable ||
      !nextTable.seats.some((seat) => seat.id === seatId && isSeatVisible(seat))
    ) {
      return;
    }

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
        detail:
          result.message ??
          (activeCourse === "drinks"
            ? "Die GetrÃ¤nke konnten nicht gemeldet werden."
            : "Die Positionen konnten nicht an die KÃ¼che gesendet werden.")
      });
      return;
    }

    const syncHint =
      activeCourse === "drinks"
        ? sharedSync.status === "online"
          ? "Der Hinweis ist jetzt auf den ServicegerÃ¤ten sichtbar."
          : "Der Hinweis wurde lokal gespeichert. FÃ¼r alle ServicegerÃ¤te muss der gemeinsame Sync erreichbar sein."
        : sharedSync.status === "online"
          ? "Der Bon ist fÃ¼r KÃ¼che und andere GerÃ¤te jetzt im gemeinsamen Stand."
          : "Der Bon wurde lokal gespeichert. FÃ¼r mehrere GerÃ¤te muss der gemeinsame Sync erreichbar sein.";

    setServiceFeedback({
      tone: "success",
      title:
        activeCourse === "drinks" ? "GetrÃ¤nke gemeldet" : `${courseLabels[activeCourse]} gesendet`,
      detail: `${result.message ?? "Die Positionen wurden erfolgreich an die KÃ¼che gesendet."} ${syncHint}`
    });
  };

  const handleReleaseCourse = () => {
    if (!selectedTable || activeCourse === "review" || activeCourse === "drinks") return;

    actions.releaseCourse(selectedTable.id, activeCourse);
    setServiceFeedback({
      tone: "info",
      title: "Wartezeit Ã¼bersprungen",
      detail: `${courseLabels[activeCourse]} ist in der KÃ¼che jetzt freigegeben.`
    });
  };

  const handleNotificationAction = (notification: (typeof unreadNotifications)[number]) => {
    if (isWaiterView && notification.kind === "service-drinks") {
      actions.markNotificationRead(notification.id, "shared");
      setServiceFeedback({
        tone: "info",
        title: "Getränke angenommen",
        detail: "Alle im Service sehen jetzt, dass du dich darum kümmerst."
      });
      return;
    }

    actions.markNotificationRead(notification.id, "local");
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

    return items.map((item) => {
      const itemTargetValue = item.target.type === "table" ? "table" : item.target.seatId;
      const hiddenSeat =
        item.target.type === "seat"
          ? (() => {
              const seatId = item.target.seatId;
              return visibleSeats.some((seat) => seat.id === seatId)
                ? undefined
                : selectedTable.seats.find((seat) => seat.id === seatId);
            })()
          : undefined;

      return (
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
            LÃ¶schen
          </button>
        </div>

        <div className="kiju-order-item-card__fields">
          <label className="kiju-inline-field">
            <span>Zuordnung</span>
            {usesSeatMode ? (
              <select
                value={itemTargetValue}
                onChange={(event) =>
                  actions.updateItem(selectedTable.id, item.id, {
                    target:
                      event.target.value === "table"
                        ? tableOrderTarget
                        : { type: "seat", seatId: event.target.value }
                  })
                }
              >
                <option value="table">Tisch</option>
                {visibleSeats.map((seat) => (
                  <option key={seat.id} value={seat.id}>
                    {seat.label}
                  </option>
                ))}
                {hiddenSeat ? (
                  <option value={hiddenSeat.id}>{hiddenSeat.label} (ausgeblendet)</option>
                ) : null}
              </select>
            ) : (
              <strong>Tisch</strong>
            )}
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
      );
    });
  };

  return (
    <RouteGuard allowedRoles={["waiter", "admin"]}>
      <main className="kiju-page">
        <header className="kiju-topbar">
          <div>
            <span className="kiju-eyebrow">Kellner-Dashboard</span>
            <h1>Gastro KiJu</h1>
            <p>
              Vollbild-Raumplan fÃ¼r den Service. Tisch antippen, nach unten springen und direkt am
              Tisch weiterarbeiten.
            </p>
          </div>
          <div className="kiju-topbar-actions">
            <StatusPill label={syncStatusLabel} tone={syncStatusTone} />
            {currentUser?.role === "admin" ? (
              <>
                <Link href={routeConfig.kitchen} className="kiju-button kiju-button--secondary">
                  <ChefHat size={18} />
                  Zur KÃ¼che
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
                      <article
                        key={notification.id}
                        className="kiju-notification-row"
                      >
                        <Bell size={16} />
                        <div>
                          <strong>{notification.title}</strong>
                          <span>{notification.body}</span>
                        </div>
                        <button
                          type="button"
                          className="kiju-button kiju-button--secondary kiju-notification-row__action"
                          onClick={() => handleNotificationAction(notification)}
                        >
                          {notification.kind === "service-drinks" ? "Annehmen" : "Erledigt"}
                        </button>
                      </article>
                    ))
                  )}
                </div>
              </details>
            )}
            <RoleSwitchPopover />
          </div>
        </header>

        {isWaiterView && activeServiceNotification ? (
          <aside className="kiju-service-drink-popup" role="alert" aria-live="polite">
            <div className="kiju-service-drink-popup__content">
              <span className="kiju-service-drink-popup__eyebrow">
                {activeServiceNotification.kind === "service-drinks"
                  ? "Getränke-Service"
                  : activeServiceNotification.kind === "service-drinks-accepted"
                    ? "Übernommen"
                  : "Küchenmeldung"}
              </span>
              <strong>{activeServiceNotification.title}</strong>
              <span>{activeServiceNotification.body}</span>
            </div>
            <button
              type="button"
              className="kiju-button kiju-button--primary"
              onClick={() => handleNotificationAction(activeServiceNotification)}
            >
              <CheckCircle2 size={18} />
              {activeServiceNotification.kind === "service-drinks" ? "Annehmen" : "Erledigt"}
            </button>
          </aside>
        ) : null}

        {isWaiterView ? (
          <section className="kiju-service-drink-delivery">
            <div className="kiju-service-drink-delivery__header">
              <div>
                <span>Service</span>
                <strong>Getränkeauslieferung</strong>
              </div>
              <StatusPill
                label={`${drinkDeliveryNotifications.length} offen`}
                tone={drinkDeliveryNotifications.length > 0 ? "amber" : "slate"}
              />
            </div>

            {drinkDeliveryNotifications.length === 0 ? (
              <p>Keine offenen Getränke für den Service.</p>
            ) : (
              <div className="kiju-service-drink-delivery__list">
                {drinkDeliveryNotifications.map((notification) => (
                  <article key={notification.id} className="kiju-service-drink-delivery__item">
                    <div>
                      <strong>{notification.title}</strong>
                      <span>{notification.body}</span>
                    </div>
                    <button
                      type="button"
                      className="kiju-button kiju-button--primary"
                      onClick={() => handleNotificationAction(notification)}
                    >
                      <CheckCircle2 size={18} />
                      Annehmen
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

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
                  const seatAnchors = usesSeatMode
                    ? waiterFloorplanSeatAnchors[entry.table.id] ?? []
                    : [];
                  if (!hotspot) return null;

                  return (
                    <div key={entry.table.id}>
                      <button
                      type="button"
                      className={`kiju-floorplan-hotspot ${entry.table.id === selectedTableId ? "is-selected" : ""}`}
                      aria-label={`${entry.table.name} auswÃ¤hlen`}
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
                        if (!seat || !isSeatVisible(seat)) return null;

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
                detail={`${state.dailyStats.servedTables} Tische / ${state.dailyStats.servedGuests} GÃ¤ste`}
                icon={<Euro size={18} />}
              />
            ) : (
              <MetricCard
                label="Warten / Hold"
                value={`${attentionTableCount}`}
                detail="Tische mit RÃ¼ckfrage, KÃ¼che oder Rechnung"
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
                  ? usesSeatMode
                    ? `${visibleSeats.length} sichtbare PlÃ¤tze`
                    : "Tischmodus"
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
                      {entry.guests} GÃ¤ste / {euro(entry.total)}
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
                  ? usesSeatMode
                    ? `SitzplÃ¤tze und Service fÃ¼r ${selectedTable.name}`
                    : `Service fÃ¼r ${selectedTable.name}`
                  : "Service"
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
                        {serviceOrderMode === "seat"
                          ? `${getVisibleSeats(entry.table.seats).length} sichtbare PlÃ¤tze`
                          : "Tischmodus"}{" "}
                        Â· {statusLabel[entry.status] ?? "Status"}
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

                  {usesSeatMode && visibleSeats.length > 0 ? (
                    <div className="kiju-seat-row">
                      {visibleSeats.map((seat) => (
                        <button
                          key={seat.id}
                          className={`kiju-seat-chip ${seat.id === selectedSeatId ? "is-selected" : ""}`}
                          onClick={() => setSelectedSeatId(seat.id)}
                        >
                          {seat.label}
                        </button>
                      ))}
                    </div>
                  ) : null}

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
                        {(!usesSeatMode || tableTargetItems.length > 0) ? (
                          <article className="kiju-seat-summary">
                            <header>
                              <strong>Tisch</strong>
                              <span>{tableTargetItems.length} Positionen</span>
                            </header>
                            {renderEditableItems(tableTargetItems, "Keine Positionen erfasst.")}
                          </article>
                        ) : null}
                        {usesSeatMode
                          ? visibleSeatSummaries.map(({ seat, items }) => (
                            <article key={seat.id} className="kiju-seat-summary">
                              <header>
                                <strong>{seat.label}</strong>
                                <span>{items.length} Positionen</span>
                              </header>
                              {renderEditableItems(items, "Keine Positionen erfasst.")}
                            </article>
                          ))
                          : null}
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
                              {usesSeatMode
                                ? "Split nach Sitzplatz ist vorbereitet und kann weiter vertieft werden."
                                : "Die Rechnung lÃ¤uft gesammelt auf den ausgewÃ¤hlten Tisch."}
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
                            onClick={() => actions.addItem(selectedTable.id, selectedOrderTarget, product.id)}
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
                        title={`Erfasste Leistungen fÃ¼r ${selectedTargetLabel}`}
                        eyebrow={courseLabels[activeCourse]}
                        defaultOpen={true}
                        contentClassName="kiju-order-editor"
                      >
                        <div className="kiju-order-editor__header">
                          <div>
                            <strong>Positionen kÃ¶nnen direkt bearbeitet oder gelÃ¶scht werden.</strong>
                            <span>So bleibt der Tisch im Service schneller und Ã¼bersichtlicher.</span>
                          </div>
                        </div>
                        <div className="kiju-order-editor__list">
                          {renderEditableItems(
                            editableItems,
                            `FÃ¼r ${selectedTargetLabel} wurde in ${courseLabels[activeCourse]} noch nichts erfasst.`
                          )}
                        </div>
                      </AccordionSection>

                      <div className="kiju-service-sync-row">
                        <StatusPill
                          label={
                            activeCourseTicketState
                              ? ticketStatusDisplayLabels[activeCourseTicketState.status] ??
                                activeCourseTicketState.status
                              : "Noch nicht gesendet"
                          }
                          tone={
                            activeCourseTicketState
                              ? ticketStatusDisplayTones[activeCourseTicketState.status] ?? "slate"
                              : "slate"
                          }
                        />
                        {canSkipActiveCourseTimer && activeCourseTicketState ? (
                          <StatusPill
                            label={`${activeCourseTicketState.minutesLeft} Min. Timer`}
                            tone="amber"
                          />
                        ) : null}
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
                        {canSkipActiveCourseTimer ? (
                          <button
                            className="kiju-button kiju-button--secondary"
                            onClick={handleReleaseCourse}
                          >
                            <CheckCircle2 size={18} />
                            Wartezeit Ã¼berspringen
                          </button>
                        ) : null}
                        <button
                          className="kiju-button kiju-button--secondary"
                          onClick={() => actions.skipCourse(selectedTable.id, activeCourse)}
                        >
                          Gang Ã¼berspringen
                        </button>
                        <button
                          className="kiju-button kiju-button--primary"
                          onClick={handleSendCourseToKitchen}
                        >
                          {activeCourse === "drinks" ? (
                            <>
                              <Bell size={18} />
                              GetrÃ¤nke melden
                            </>
                          ) : (
                            <>
                              <ChefHat size={18} />
                              {serviceLabels.sendToKitchen}
                            </>
                          )}
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
            eyebrow="Live fÃ¼r den gewÃ¤hlten Tisch"
            action={
              <StatusPill
                label={statusLabel[selectedSession?.status ?? "idle"] ?? "Status"}
                tone={toneByStatus[selectedSession?.status ?? "idle"] ?? "slate"}
              />
            }
            defaultOpen={true}
          >
            {!selectedTable ? (
              <p>Aktuell ist kein Tisch vorhanden. Nutze den Admin-Bereich fÃ¼r die Standardkonfiguration oder den Neuaufbau.</p>
            ) : selectedSession ? (
              <>
                <div className="kiju-inline-panel">
                  <strong>Gesamt</strong>
                  <span>{euro(sessionTotal)}</span>
                  <small>
                    {usesSeatMode
                      ? `${selectedSession.items.length} Positionen fÃ¼r ${visibleSeats.length} sichtbare PlÃ¤tze`
                      : `${selectedSession.items.length} Positionen am Tisch`}
                  </small>
                </div>
                <div className="kiju-inline-panel">
                  <strong>Direkt bearbeiten</strong>
                  <small>
                    Positionen kÃ¶nnen hier direkt verschoben, in der Menge geÃ¤ndert oder gelÃ¶scht
                    werden.
                  </small>
                </div>
                {tableCourseStatuses.length > 0 ? (
                  <div className="kiju-review-list">
                    {tableCourseStatuses.map((entry) => (
                      <article key={entry.course} className="kiju-inline-panel">
                        <strong>{courseLabels[entry.course]}</strong>
                        <div className="kiju-service-sync-row">
                          <StatusPill
                            label={ticketStatusDisplayLabels[entry.status] ?? entry.status}
                            tone={ticketStatusDisplayTones[entry.status] ?? "slate"}
                          />
                          <StatusPill
                            label={`${entry.itemCount} ${entry.itemCount === 1 ? "Position" : "Positionen"}`}
                            tone="slate"
                          />
                          {(entry.status === "blocked" || entry.status === "countdown") &&
                          entry.minutesLeft > 0 ? (
                            <StatusPill label={`${entry.minutesLeft} Min. Timer`} tone="amber" />
                          ) : null}
                        </div>
                        <small>{describeCourseTicketStatus(entry.status, entry.minutesLeft)}</small>
                      </article>
                    ))}
                  </div>
                ) : null}
                {(!usesSeatMode || tableTargetItems.length > 0) ? (
                  <article className="kiju-seat-summary">
                    <header>
                      <strong>Tisch</strong>
                      <span>{tableTargetItems.length} Artikel</span>
                    </header>
                    <div className="kiju-seat-summary__items">
                      {renderEditableItems(tableTargetItems, "Noch keine Positionen.")}
                    </div>
                  </article>
                ) : null}
                {usesSeatMode
                  ? visibleSeatSummaries.map(({ seat, items }) => (
                    <article key={seat.id} className="kiju-seat-summary">
                      <header>
                        <strong>{seat.label}</strong>
                        <span>{items.length} Artikel</span>
                      </header>
                      <div className="kiju-seat-summary__items">
                        {renderEditableItems(items, "Noch keine Positionen.")}
                      </div>
                    </article>
                  ))
                  : null}
              </>
            ) : (
              <p>FÃ¼r diesen Tisch wurde noch keine Bestellung gestartet.</p>
            )}
          </AccordionSection>
        </div>
      </main>
    </RouteGuard>
  );
};


