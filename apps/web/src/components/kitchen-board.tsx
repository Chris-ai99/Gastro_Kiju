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
  blocked: "Gesperrt",
  countdown: "Wartezeit läuft",
  ready: "Frei zur Zubereitung",
  completed: "Fertig"
} as const;

const ticketStatusShortLabels = {
  blocked: "Gesperrt",
  countdown: "Warten",
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
  status: TicketStatus;
  itemCount: number;
  targetSummary: string;
  waitLabel?: string;
  waitExpired?: boolean;
  lines: KitchenTicketLine[];
};

const formatClock = (value: number | string | undefined) => {
  if (!value) return "--:--";

  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
};

const formatWaitDuration = (secondsLeft: number) => {
  const safeSeconds = Math.max(0, secondsLeft);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const resolveWaitDisplay = (
  ticket: { sentAt?: string; releasedAt?: string; countdownMinutes: number },
  now: number
) => {
  const waitStartedAt = ticket.releasedAt ?? ticket.sentAt;
  if (!waitStartedAt) {
    return {
      label: `${Math.max(1, ticket.countdownMinutes || 1)}:00`,
      expired: false
    };
  }

  const startTime = new Date(waitStartedAt).getTime();
  const waitMinutes = Math.max(1, ticket.countdownMinutes || 1);
  if (!Number.isFinite(startTime)) {
    return {
      label: `${waitMinutes}:00`,
      expired: false
    };
  }

  const secondsLeft = Math.max(0, Math.ceil((startTime + waitMinutes * 60 * 1000 - now) / 1000));

  return {
    label: formatWaitDuration(secondsLeft),
    expired: secondsLeft <= 0
  };
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
  const [showArchived, setShowArchived] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [kitchenClock, setKitchenClock] = useState(() => Date.now());
  const hasWaitingTickets = state.sessions.some((session) =>
    Object.values(session.courseTickets).some(
      (ticket) => ticket.status === "countdown" && Boolean(ticket.sentAt)
    )
  );

  useEffect(() => {
    if (!hasWaitingTickets) return;

    const timer = window.setInterval(() => {
      setKitchenClock(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [hasWaitingTickets]);

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
            : "ready";
        const waitDisplay =
          ticketStatus === "countdown"
            ? resolveWaitDisplay(courseTicket, kitchenClock)
            : undefined;

        const ticket: KitchenTicket = {
          id: `${table.id}-${course}`,
          ticketNumber,
          tableId: table.id,
          tableName: table.name,
          course,
          courseLabel: courseLabels[course],
          sentAt: courseTicket.sentAt,
          completedAt: courseTicket.completedAt,
          status: ticketStatus,
          itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
          targetSummary: buildTargetSummary(items),
          waitLabel: waitDisplay?.label,
          waitExpired: waitDisplay?.expired,
          lines
        };

        ticketNumber += 1;
        return [ticket];
      });
    });
  }, [kitchenClock, state.products, state.sessions, state.tables]);

  const sortedTickets = useMemo(
    () =>
      [...tickets].sort((left, right) => {
        const rankDelta = ticketStatusRank[left.status] - ticketStatusRank[right.status];
        if (rankDelta !== 0) return rankDelta;

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
  const readyCount = activeTickets.filter((ticket) => ticket.status === "ready").length;
  const waitingCount = activeTickets.filter((ticket) => ticket.status === "countdown").length;

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
    const canReleaseWait = ticket.status === "countdown";
    const stateBadge = ticketStatusShortLabels[ticket.status];

    return (
      <article key={ticket.id} className={`kiju-pass-ticket is-${ticket.status}`}>
        <header className="kiju-pass-ticket__header">
          <strong>Ticket {ticket.ticketNumber}</strong>
          <div className="kiju-pass-ticket__times">
            <span>
              <Clock3 size={12} />
              {formatClock(ticket.sentAt)}
            </span>
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

        {ticket.status === "countdown" ? (
          <div className={`kiju-pass-ticket__wait ${ticket.waitExpired ? "is-expired" : ""}`}>
            <span>{ticket.waitExpired ? "Wartezeit abgelaufen" : "Startet in"}</span>
            <strong>{ticket.waitLabel ?? "0:00"}</strong>
            <small>
              {ticket.waitExpired
                ? "Jetzt bestätigen oder sofort freigeben."
                : "Dieser Gang bleibt bis dahin auf Warten."}
            </small>
          </div>
        ) : null}

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
          {ticket.status !== "countdown" ? (
            <button
              type="button"
              className="kiju-pass-ticket__action"
              onClick={() => actions.markCourseCompleted(ticket.tableId, ticket.course)}
              disabled={!canMarkCompleted}
              aria-label={
                canMarkCompleted
                  ? `${ticket.courseLabel} für ${ticket.tableName} als fertig markieren`
                  : `${ticket.courseLabel} für ${ticket.tableName} ist bereits fertig`
              }
            >
              <CheckCheck size={18} />
            </button>
          ) : null}
          {canReleaseWait ? (
            <button
              type="button"
              className="kiju-pass-ticket__action kiju-pass-ticket__action--wait"
              onClick={() => actions.releaseCourse(ticket.tableId, ticket.course)}
              aria-label={
                ticket.waitExpired
                  ? `Wartezeit für ${ticket.courseLabel} an ${ticket.tableName} bestätigen`
                  : `Wartezeit für ${ticket.courseLabel} an ${ticket.tableName} überspringen`
              }
            >
              {ticket.waitExpired ? "Bestätigen" : "Überspringen"}
            </button>
          ) : null}
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
            <span>{readyCount} frei</span>
            <span>{waitingCount} wartet</span>
          </div>

          <div className="kiju-kitchen-wallboard__footer-right">
            <span className="kiju-kitchen-wallboard__refresh">
              <RefreshCw size={16} />
              Live
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

