"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BellRing,
  CheckCheck,
  ChefHat,
  Clock3,
  ListOrdered,
  RefreshCw
} from "lucide-react";

import { routeConfig } from "@kiju/config";
import {
  courseLabels,
  getItemsForCourse,
  getProductById,
  getSessionForTable,
  type CourseKey,
  type OrderItem,
  type Product
} from "@kiju/domain";

import { resolveCourseStatus, useDemoApp } from "../lib/app-state";
import { RoleSwitchPopover } from "./role-switch-popover";
import { RouteGuard } from "./route-guard";

const ticketCourses: CourseKey[] = ["starter", "main", "dessert"];
const MAX_VISIBLE_TICKETS = 7;

const ticketStatusLabels = {
  blocked: "Noch nicht zubereiten",
  countdown: "Wartezeit läuft",
  ready: "Frei zur Zubereitung",
  completed: "Fertig"
} as const;

const ticketStatusShortLabels = {
  blocked: "Gesperrt",
  countdown: "Timer",
  ready: "Frei",
  completed: "Fertig"
} as const;

const ticketStatusRank: Record<keyof typeof ticketStatusLabels, number> = {
  ready: 0,
  countdown: 1,
  blocked: 2,
  completed: 3
};

type TicketStatus = keyof typeof ticketStatusLabels;

type KitchenTicketLine = {
  id: string;
  quantity: number;
  targetLabel: string;
  productName: string;
  modifiers: string[];
  note?: string;
};

type KitchenTicket = {
  id: string;
  ticketNumber: number;
  tableId: string;
  tableName: string;
  course: CourseKey;
  courseLabel: string;
  sentAt?: string;
  completedAt?: string;
  minutesLeft: number;
  status: TicketStatus;
  itemCount: number;
  targetSummary: string;
  lines: KitchenTicketLine[];
};

const formatClock = (value: number | string | undefined) => {
  if (!value) return "--:--";

  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
};

const formatDuration = (from: string | undefined, now: number) => {
  if (!from) return "00:00:00";

  const totalSeconds = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
};

const buildModifierLabels = (item: OrderItem, product: Product | undefined) =>
  item.modifiers.flatMap((selection) => {
    const group = product?.modifierGroups.find((entry) => entry.id === selection.groupId);
    if (!group) return [];

    return selection.optionIds.map((optionId) => {
      const option = group.options.find((entry) => entry.id === optionId);
      return option?.name ?? optionId;
    });
  });

const resolveTargetLabel = (
  item: OrderItem,
  table: { id: string; seats: { id: string; label: string }[] }
) => {
  if (item.target.type === "table") {
    return "Tisch";
  }

  const seatId = item.target.seatId;
  return (
    table.seats.find((seat) => seat.id === seatId)?.label ??
    seatId.replace(`${table.id}-seat-`, "P")
  );
};

const buildTargetSummary = (items: OrderItem[]) => {
  const hasTableTarget = items.some((item) => item.target.type === "table");
  const seatCount = new Set(
    items
      .filter((item) => item.target.type === "seat")
      .map((item) => (item.target.type === "seat" ? item.target.seatId : ""))
  ).size;

  if (hasTableTarget && seatCount === 0) return "Tisch";
  if (hasTableTarget) return `Tisch + ${seatCount} ${seatCount === 1 ? "Platz" : "Plätze"}`;
  return `${seatCount} ${seatCount === 1 ? "Platz" : "Plätze"}`;
};

export const KitchenBoard = () => {
  const { state, unreadNotifications, actions, currentUser } = useDemoApp();
  const [clock, setClock] = useState(() => Date.now());
  const [showArchived, setShowArchived] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const tickets = useMemo(() => {
    let ticketNumber = 1;

    return state.tables.flatMap((table) => {
      const session = getSessionForTable(state.sessions, table.id);
      if (!session) return [];

      return ticketCourses.flatMap((course) => {
        const courseTicket = session.courseTickets[course];
        if (!courseTicket.sentAt) {
          return [];
        }

        const items = getItemsForCourse(session, course);
        const resolved = resolveCourseStatus(session, course);
        if (resolved.status === "not-recorded" || resolved.status === "skipped") {
          return [];
        }

        const lines = items.map((item) => {
          const product = getProductById(state.products, item.productId);

          return {
            id: item.id,
            quantity: item.quantity,
            targetLabel: resolveTargetLabel(item, table),
            productName: product?.name ?? "Unbekannt",
            modifiers: buildModifierLabels(item, product),
            note: item.note
          };
        });

        const ticketStatus =
          resolved.status === "completed" ||
          resolved.status === "ready" ||
          resolved.status === "countdown" ||
          resolved.status === "blocked"
            ? resolved.status
            : "blocked";

        const ticket: KitchenTicket = {
          id: `${table.id}-${course}`,
          ticketNumber,
          tableId: table.id,
          tableName: table.name,
          course,
          courseLabel: courseLabels[course],
          sentAt: courseTicket.sentAt,
          completedAt: courseTicket.completedAt,
          minutesLeft: resolved.minutesLeft,
          status: ticketStatus,
          itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
          targetSummary: buildTargetSummary(items),
          lines
        };

        ticketNumber += 1;
        return [ticket];
      });
    });
  }, [clock, state.products, state.sessions, state.tables]);

  const sortedTickets = useMemo(
    () =>
      [...tickets].sort((left, right) => {
        const rankDelta = ticketStatusRank[left.status] - ticketStatusRank[right.status];
        if (rankDelta !== 0) return rankDelta;

        const hasTimer =
          (left.status === "blocked" || left.status === "countdown") &&
          (right.status === "blocked" || right.status === "countdown");
        if (hasTimer) {
          const timerDelta = left.minutesLeft - right.minutesLeft;
          if (timerDelta !== 0) return timerDelta;
        }

        const leftSentAt = left.sentAt ? new Date(left.sentAt).getTime() : Number.MAX_SAFE_INTEGER;
        const rightSentAt = right.sentAt
          ? new Date(right.sentAt).getTime()
          : Number.MAX_SAFE_INTEGER;
        return leftSentAt - rightSentAt;
      }),
    [tickets]
  );

  const activeTickets = sortedTickets.filter((ticket) => ticket.status !== "completed");
  const archivedTickets = sortedTickets
    .filter((ticket) => ticket.status === "completed")
    .sort((left, right) => {
      const leftCompleted = left.completedAt ? new Date(left.completedAt).getTime() : 0;
      const rightCompleted = right.completedAt ? new Date(right.completedAt).getTime() : 0;
      return rightCompleted - leftCompleted;
    })
    .slice(0, 8);

  const visibleTickets = activeTickets.slice(0, MAX_VISIBLE_TICKETS);
  const hiddenTicketCount = Math.max(0, activeTickets.length - MAX_VISIBLE_TICKETS);
  const emptySlotCount = Math.max(0, MAX_VISIBLE_TICKETS - visibleTickets.length);
  const lockedCount = activeTickets.filter(
    (ticket) => ticket.status === "blocked" || ticket.status === "countdown"
  ).length;
  const readyCount = activeTickets.filter((ticket) => ticket.status === "ready").length;

  const allOpenItems = useMemo(() => {
    const grouped = new Map<string, { id: string; label: string; quantity: number }>();

    for (const ticket of activeTickets) {
      for (const line of ticket.lines) {
        const key = `${ticket.course}:${line.productName}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.quantity += line.quantity;
          continue;
        }

        grouped.set(key, {
          id: key,
          label: line.productName,
          quantity: line.quantity
        });
      }
    }

    return [...grouped.values()].sort((left, right) => {
      if (right.quantity !== left.quantity) return right.quantity - left.quantity;
      return left.label.localeCompare(right.label, "de");
    });
  }, [activeTickets]);

  const renderTicketCard = (ticket: KitchenTicket) => {
    const canMarkCompleted = ticket.status === "ready";
    const timerVisible =
      (ticket.status === "blocked" || ticket.status === "countdown") && ticket.minutesLeft > 0;
    const stateBadge = timerVisible
      ? `${ticket.minutesLeft} Min.`
      : ticketStatusShortLabels[ticket.status];

    return (
      <article key={ticket.id} className={`kiju-pass-ticket is-${ticket.status}`}>
        <header className="kiju-pass-ticket__header">
          <strong>Ticket {ticket.ticketNumber}</strong>
          <div className="kiju-pass-ticket__times">
            <span>
              <Clock3 size={12} />
              {formatClock(ticket.sentAt)}
            </span>
            <span>{formatDuration(ticket.sentAt, clock)}</span>
          </div>
        </header>

        <div className="kiju-pass-ticket__headline">
          <div>
            <h2>{ticket.tableName}</h2>
            <span>
              {ticket.courseLabel} · {ticket.targetSummary}
            </span>
          </div>
          <div className={`kiju-pass-ticket__state is-${ticket.status}`}>
            <strong>{stateBadge}</strong>
            <span>{ticketStatusLabels[ticket.status]}</span>
          </div>
        </div>

        <ol className="kiju-pass-ticket__lines">
          {ticket.lines.map((line) => (
            <li key={line.id} className="kiju-pass-ticket__line">
              <span className="kiju-pass-ticket__quantity">{line.quantity}</span>
              <div className="kiju-pass-ticket__line-copy">
                <strong>{line.productName}</strong>
                <small>{line.targetLabel}</small>
                {line.modifiers.length > 0 ? (
                  <em className="kiju-pass-ticket__modifier">{line.modifiers.join(" · ")}</em>
                ) : null}
                {line.note ? <em className="kiju-pass-ticket__note">{line.note}</em> : null}
              </div>
            </li>
          ))}
        </ol>

        <footer className="kiju-pass-ticket__footer">
          <div className="kiju-pass-ticket__footer-copy">
            <span>Arbeitsplatz</span>
            <strong>KiJu Pass</strong>
            <small>
              {ticket.tableName} · {ticket.itemCount} {ticket.itemCount === 1 ? "Posten" : "Posten"}
            </small>
          </div>
          <button
            type="button"
            className="kiju-pass-ticket__action"
            onClick={() => actions.markCourseCompleted(ticket.tableId, ticket.course)}
            disabled={!canMarkCompleted}
            aria-label={
              canMarkCompleted
                ? `${ticket.courseLabel} für ${ticket.tableName} als fertig markieren`
                : `${ticket.courseLabel} für ${ticket.tableName} ist noch gesperrt`
            }
          >
            <CheckCheck size={18} />
          </button>
        </footer>
      </article>
    );
  };

  return (
    <RouteGuard allowedRoles={["kitchen", "admin"]}>
      <main className="kiju-page kiju-kitchen-wallboard">
        <section className="kiju-kitchen-wallboard__grid">
          {visibleTickets.map((ticket) => renderTicketCard(ticket))}
          {Array.from({ length: emptySlotCount }, (_, index) => (
            <article key={`empty-${index}`} className="kiju-pass-ticket kiju-pass-ticket--empty">
              <div>
                <ChefHat size={22} />
                <span>Freier Platz</span>
              </div>
            </article>
          ))}

          <aside className="kiju-kitchen-summary-card">
            <header className="kiju-kitchen-summary-card__header">
              <strong>Alle Posten</strong>
              <small>{allOpenItems.length} offen</small>
            </header>
            <div className="kiju-kitchen-summary-card__table">
              <div className="kiju-kitchen-summary-card__head">
                <span>Stück</span>
                <span>Bezeichnung</span>
              </div>
              {allOpenItems.length === 0 ? (
                <p className="kiju-kitchen-summary-card__empty">Keine offenen Posten.</p>
              ) : (
                allOpenItems.map((item) => (
                  <div key={item.id} className="kiju-kitchen-summary-card__row">
                    <strong>{item.quantity}</strong>
                    <span>{item.label}</span>
                  </div>
                ))
              )}
            </div>
          </aside>
        </section>

        {showArchived ? (
          <section className="kiju-kitchen-wallboard__archive">
            <div className="kiju-kitchen-wallboard__archive-head">
              <strong>Alte Bons</strong>
              <small>{archivedTickets.length} zuletzt</small>
            </div>
            {archivedTickets.length === 0 ? (
              <p className="kiju-kitchen-wallboard__archive-empty">
                Noch keine abgeschlossenen Bons in diesem Durchlauf.
              </p>
            ) : (
              <div className="kiju-kitchen-wallboard__archive-list">
                {archivedTickets.map((ticket) => (
                  <article key={ticket.id} className="kiju-kitchen-wallboard__archive-item">
                    <strong>
                      {ticket.tableName} · {ticket.courseLabel}
                    </strong>
                    <span>{formatClock(ticket.completedAt)}</span>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {showNotifications ? (
          <section className="kiju-kitchen-wallboard__notifications">
            <div className="kiju-kitchen-wallboard__archive-head">
              <strong>Hinweise</strong>
              <small>{unreadNotifications.length} offen</small>
            </div>
            {unreadNotifications.length === 0 ? (
              <p className="kiju-kitchen-wallboard__archive-empty">
                Keine offenen Hinweise aus Service oder Abrechnung.
              </p>
            ) : (
              <div className="kiju-pass-notifications">
                {unreadNotifications.slice(0, 8).map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    className="kiju-pass-notification"
                    onClick={() => actions.markNotificationRead(notification.id)}
                  >
                    <BellRing size={16} />
                    <div>
                      <strong>{notification.title}</strong>
                      <span>{notification.body}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : null}

        <footer className="kiju-kitchen-wallboard__footer">
          <div className="kiju-kitchen-wallboard__footer-left">
            <button
              type="button"
              className="kiju-kitchen-wallboard__footer-button is-icon"
              onClick={() => setShowNotifications((value) => !value)}
            >
              <BellRing size={18} />
            </button>
            <button
              type="button"
              className="kiju-kitchen-wallboard__footer-button"
              onClick={() => setShowArchived((value) => !value)}
            >
              <ListOrdered size={18} />
              {showArchived ? "Alte Bons aus" : "Alte Bons"}
            </button>
          </div>

          <div className="kiju-kitchen-wallboard__footer-center">
            {hiddenTicketCount > 0 ? <span>+{hiddenTicketCount} weitere Bons</span> : null}
            <span>{lockedCount} mit Timer</span>
            <span>{readyCount} frei</span>
          </div>

          <div className="kiju-kitchen-wallboard__footer-right">
            <span className="kiju-kitchen-wallboard__refresh">
              <RefreshCw size={16} />
              5 Sek
            </span>
            {currentUser?.role === "admin" ? (
              <Link href={routeConfig.waiter} className="kiju-kitchen-wallboard__service-link">
                Zum Service
              </Link>
            ) : null}
            <RoleSwitchPopover />
          </div>
        </footer>
      </main>
    </RouteGuard>
  );
};

