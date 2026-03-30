"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BellRing,
  CheckCheck,
  ChefHat,
  Clock3,
  ListOrdered,
  TimerReset
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
import { StatusPill } from "@kiju/ui";

import { resolveCourseStatus, useDemoApp } from "../lib/app-state";
import { RoleSwitchPopover } from "./role-switch-popover";
import { RouteGuard } from "./route-guard";

const ticketCourses: CourseKey[] = ["starter", "main", "dessert", "drinks"];

const ticketStatusLabels = {
  blocked: "Blockiert",
  countdown: "Countdown",
  ready: "Sofort",
  completed: "Fertig"
} as const;

const ticketStatusTones: Record<
  keyof typeof ticketStatusLabels,
  "navy" | "amber" | "red" | "green" | "slate"
> = {
  blocked: "red",
  countdown: "amber",
  ready: "green",
  completed: "navy"
};

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
  seatLabel: string;
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
  releasedAt?: string;
  completedAt?: string;
  minutesLeft: number;
  status: TicketStatus;
  itemCount: number;
  seatCount: number;
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

export const KitchenBoard = () => {
  const { state, unreadNotifications, actions, currentUser } = useDemoApp();
  const [clock, setClock] = useState(() => Date.now());
  const [showArchived, setShowArchived] = useState(false);

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
        const items = getItemsForCourse(session, course);
        const resolved = resolveCourseStatus(session, course);
        const status =
          courseTicket.status === "countdown"
            ? resolved.status
            : (courseTicket.status as TicketStatus | "not-recorded" | "skipped");

        if ((status === "not-recorded" || status === "skipped") && items.length === 0) {
          return [];
        }

        if (!courseTicket.sentAt && items.length === 0) {
          return [];
        }

        const lines = items.map((item) => {
          const product = getProductById(state.products, item.productId);
          const seatLabel =
            table.seats.find((seat) => seat.id === item.seatId)?.label ??
            item.seatId.replace(`${table.id}-seat-`, "P");

          return {
            id: item.id,
            quantity: item.quantity,
            seatLabel,
            productName: product?.name ?? "Unbekannt",
            modifiers: buildModifierLabels(item, product),
            note: item.note
          };
        });

        const ticket: KitchenTicket = {
          id: `${table.id}-${course}`,
          ticketNumber,
          tableId: table.id,
          tableName: table.name,
          course,
          courseLabel: courseLabels[course],
          sentAt: courseTicket.sentAt ?? items.find((item) => item.sentAt)?.sentAt,
          releasedAt: courseTicket.releasedAt,
          completedAt: courseTicket.completedAt,
          minutesLeft: resolved.minutesLeft,
          status:
            status === "completed" || status === "ready" || status === "countdown"
              ? status
              : "blocked",
          itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
          seatCount: new Set(items.map((item) => item.seatId)).size,
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

        if (left.status === "countdown" && right.status === "countdown") {
          const countdownDelta = left.minutesLeft - right.minutesLeft;
          if (countdownDelta !== 0) return countdownDelta;
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

  const primaryTicket = activeTickets[0];
  const queueTickets = activeTickets.slice(1, 7);
  const blockedCount = activeTickets.filter((ticket) => ticket.status === "blocked").length;
  const readyCount = activeTickets.filter((ticket) => ticket.status === "ready").length;

  const allOpenItems = useMemo(() => {
    const grouped = new Map<
      string,
      { id: string; label: string; quantity: number; courseLabel: string; ticketCount: number }
    >();

    for (const ticket of activeTickets) {
      for (const line of ticket.lines) {
        const key = `${ticket.course}:${line.productName}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.quantity += line.quantity;
          existing.ticketCount += 1;
          continue;
        }

        grouped.set(key, {
          id: key,
          label: line.productName,
          quantity: line.quantity,
          courseLabel: ticket.courseLabel,
          ticketCount: 1
        });
      }
    }

    return [...grouped.values()].sort((left, right) => {
      if (right.quantity !== left.quantity) return right.quantity - left.quantity;
      return left.label.localeCompare(right.label, "de");
    });
  }, [activeTickets]);

  const renderTicketCard = (ticket: KitchenTicket, featured = false) => {
    const cardClassName = [
      "kiju-ticket-card",
      featured ? "is-featured" : "",
      `is-${ticket.status}`
    ]
      .filter(Boolean)
      .join(" ");

    const actionLabel = ticket.status === "blocked" ? "Jetzt freigeben" : "Ticket abschließen";
    const actionIcon = ticket.status === "blocked" ? <TimerReset size={18} /> : <CheckCheck size={18} />;
    const actionHandler = () =>
      ticket.status === "blocked"
        ? actions.releaseCourse(ticket.tableId, ticket.course)
        : actions.markCourseCompleted(ticket.tableId, ticket.course);

    return (
      <article key={ticket.id} className={cardClassName}>
        <div className="kiju-ticket-card__meta-row">
          <strong>Ticket {ticket.ticketNumber}</strong>
          <div className="kiju-ticket-card__clock-group">
            <span>
              <Clock3 size={13} />
              {formatClock(ticket.sentAt)}
            </span>
            <span>{formatDuration(ticket.sentAt, clock)}</span>
          </div>
        </div>

        <div className="kiju-ticket-card__title-row">
          <div>
            <span className="kiju-ticket-card__table-label">{ticket.tableName}</span>
            <h2>{ticket.courseLabel}</h2>
          </div>
          <StatusPill
            label={
              ticket.status === "countdown"
                ? `${ticket.minutesLeft} Min.`
                : ticketStatusLabels[ticket.status]
            }
            tone={ticketStatusTones[ticket.status]}
          />
        </div>

        <ol className="kiju-ticket-card__list">
          {ticket.lines.map((line) => (
            <li key={line.id} className="kiju-ticket-line">
              <span className="kiju-ticket-line__quantity">{line.quantity}</span>
              <div className="kiju-ticket-line__copy">
                <strong>{line.productName}</strong>
                <span>{line.seatLabel}</span>
                {line.modifiers.length > 0 ? (
                  <em>+ {line.modifiers.join(" · ")}</em>
                ) : null}
                {line.note ? <em>Hinweis: {line.note}</em> : null}
              </div>
            </li>
          ))}
        </ol>

        <footer className="kiju-ticket-card__footer">
          <div className="kiju-ticket-card__footer-copy">
            <span>{ticket.tableName}</span>
            <small>
              {ticket.seatCount} {ticket.seatCount === 1 ? "Platz" : "Plätze"} · {ticket.itemCount}{" "}
              {ticket.itemCount === 1 ? "Posten" : "Posten"}
            </small>
          </div>
          <button className="kiju-ticket-card__action" onClick={actionHandler}>
            {actionIcon}
            {actionLabel}
          </button>
        </footer>
      </article>
    );
  };

  return (
    <RouteGuard allowedRoles={["kitchen", "admin"]}>
      <main className="kiju-page kiju-kitchen-screen">
        <header className="kiju-kitchen-topbar">
          <div className="kiju-kitchen-topbar__copy">
            <span className="kiju-eyebrow">Küchenpass</span>
            <h1>Bon-Wand für die laufende Produktion</h1>
            <p>
              Der nächste Bon liegt links im Fokus. Dahinter laufen alle offenen Tickets in
              Reihenfolge, rechts stehen Sammelposten und Live-Hinweise für den Pass.
            </p>
          </div>

          <div className="kiju-kitchen-topbar__actions">
            <StatusPill label={`${activeTickets.length} offene Bons`} tone="navy" />
            <StatusPill label={`${readyCount} sofort fällig`} tone={readyCount > 0 ? "green" : "slate"} />
            <StatusPill
              label={`${blockedCount} blockiert`}
              tone={blockedCount > 0 ? "red" : "slate"}
            />
            {currentUser?.role === "admin" ? (
              <Link href={routeConfig.waiter} className="kiju-button kiju-button--secondary">
                Zum Service
              </Link>
            ) : null}
            <RoleSwitchPopover />
          </div>
        </header>

        <section className="kiju-kitchen-stats">
          <article className="kiju-kitchen-stat-card">
            <span>Jetzt am Pass</span>
            <strong>{primaryTicket ? primaryTicket.tableName : "Kein Bon"}</strong>
            <small>{primaryTicket ? primaryTicket.courseLabel : "Sobald ein Gang gesendet wird, erscheint er hier."}</small>
          </article>
          <article className="kiju-kitchen-stat-card">
            <span>Reihenfolge</span>
            <strong>{activeTickets.length}</strong>
            <small>{activeTickets.length === 1 ? "Ticket wartet" : "Tickets warten"}</small>
          </article>
          <article className="kiju-kitchen-stat-card">
            <span>Archiv</span>
            <strong>{archivedTickets.length}</strong>
            <small>Zuletzt abgeschlossene Bons</small>
          </article>
          <article className="kiju-kitchen-stat-card">
            <span>Stand</span>
            <strong>{formatClock(clock)}</strong>
            <small>Automatische Aktualisierung im Sekundentakt</small>
          </article>
        </section>

        <section className="kiju-kitchen-wall">
          <div className="kiju-kitchen-wall__tickets">
            {primaryTicket ? (
              <section className="kiju-kitchen-wall__primary">{renderTicketCard(primaryTicket, true)}</section>
            ) : (
              <section className="kiju-kitchen-empty">
                <ChefHat size={32} />
                <div>
                  <strong>Aktuell wartet kein Bon auf die Küche.</strong>
                  <p>Sobald der Service einen Gang schickt, landet er hier ganz oben in der Queue.</p>
                </div>
              </section>
            )}

            <section className="kiju-kitchen-wall__queue">
              <div className="kiju-kitchen-section-heading">
                <div>
                  <span className="kiju-kitchen-section-heading__eyebrow">Warteschlange</span>
                  <h2>Nächste Tickets</h2>
                </div>
                <StatusPill label={`${queueTickets.length} sichtbar`} tone="amber" />
              </div>

              {queueTickets.length > 0 ? (
                <div className="kiju-ticket-grid">
                  {queueTickets.map((ticket) => renderTicketCard(ticket))}
                </div>
              ) : (
                <div className="kiju-kitchen-placeholder">
                  <Clock3 size={18} />
                  Hinter dem aktuellen Bon wartet gerade nichts Weiteres.
                </div>
              )}
            </section>

            <footer className="kiju-kitchen-wall__footer">
              <button
                className="kiju-kitchen-archive-toggle"
                onClick={() => setShowArchived((value) => !value)}
              >
                <ListOrdered size={18} />
                {showArchived ? "Alte Bons ausblenden" : "Alte Bons anzeigen"}
              </button>
              <div className="kiju-kitchen-refresh-indicator">
                <Clock3 size={16} />
                1 Sek
              </div>
            </footer>
          </div>

          <aside className="kiju-kitchen-sidebar">
            <section className="kiju-kitchen-panel">
              <div className="kiju-kitchen-section-heading">
                <div>
                  <span className="kiju-kitchen-section-heading__eyebrow">Sammelliste</span>
                  <h2>Alle Posten</h2>
                </div>
                <StatusPill label={`${allOpenItems.length} Positionen`} tone="navy" />
              </div>

              {allOpenItems.length > 0 ? (
                <div className="kiju-kitchen-summary-table">
                  <div className="kiju-kitchen-summary-table__head">
                    <span>Stück</span>
                    <span>Bezeichnung</span>
                    <span>Gang</span>
                  </div>
                  {allOpenItems.map((item) => (
                    <div key={item.id} className="kiju-kitchen-summary-table__row">
                      <strong>{item.quantity}</strong>
                      <span>{item.label}</span>
                      <small>{item.courseLabel}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="kiju-kitchen-panel__empty">
                  Noch keine offenen Positionen in der Produktionsliste.
                </p>
              )}
            </section>

            <section className="kiju-kitchen-panel">
              <div className="kiju-kitchen-section-heading">
                <div>
                  <span className="kiju-kitchen-section-heading__eyebrow">Live</span>
                  <h2>Hinweise</h2>
                </div>
                <StatusPill
                  label={`${unreadNotifications.length} offen`}
                  tone={unreadNotifications.length > 0 ? "amber" : "slate"}
                />
              </div>

              {unreadNotifications.length === 0 ? (
                <p className="kiju-kitchen-panel__empty">Keine offenen Hinweise aus Service oder Abrechnung.</p>
              ) : (
                <div className="kiju-kitchen-notifications">
                  {unreadNotifications.slice(0, 5).map((notification) => (
                    <button
                      key={notification.id}
                      className="kiju-kitchen-notification"
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

            {showArchived ? (
              <section className="kiju-kitchen-panel">
                <div className="kiju-kitchen-section-heading">
                  <div>
                    <span className="kiju-kitchen-section-heading__eyebrow">Archiv</span>
                    <h2>Alte Bons</h2>
                  </div>
                  <StatusPill label={`${archivedTickets.length} zuletzt`} tone="green" />
                </div>

                {archivedTickets.length > 0 ? (
                  <div className="kiju-kitchen-archived-list">
                    {archivedTickets.map((ticket) => (
                      <article key={ticket.id} className="kiju-kitchen-archived-ticket">
                        <div>
                          <strong>
                            {ticket.tableName} · {ticket.courseLabel}
                          </strong>
                          <span>{formatClock(ticket.completedAt)}</span>
                        </div>
                        <StatusPill label="Fertig" tone="green" />
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="kiju-kitchen-panel__empty">Noch keine abgeschlossenen Bons in diesem Durchlauf.</p>
                )}
              </section>
            ) : null}
          </aside>
        </section>
      </main>
    </RouteGuard>
  );
};
