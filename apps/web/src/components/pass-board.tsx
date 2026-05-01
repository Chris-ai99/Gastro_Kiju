"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BellRing,
  CheckCheck,
  ChefHat,
  Clock3,
  ListOrdered,
  RefreshCw,
  RotateCcw
} from "lucide-react";

import { routeConfig } from "@kiju/config";
import {
  courseLabels,
  getProductById,
  getSessionForTable,
  isOrderItemCanceled,
  type CourseKey,
  type KitchenTicketBatch,
  type KitchenUnitStatus,
  type OrderItem,
  type OrderSession,
  type Product,
  type Role
} from "@kiju/domain";

import { useDemoApp } from "../lib/app-state";
import { RoleSwitchPopover } from "./role-switch-popover";
import { RouteGuard } from "./route-guard";

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

const kitchenUnitStatusLabels: Record<KitchenUnitStatus, string> = {
  pending: "Offen",
  "in-progress": "In Bearbeitung",
  completed: "Fertig"
};

const nextKitchenUnitStatusLabels: Record<KitchenUnitStatus, string> = {
  pending: "In Bearbeitung",
  "in-progress": "Fertig",
  completed: "Offen"
};

type TicketStatus = keyof typeof ticketStatusLabels;
type PassStation = "kitchen" | "bar";

type PassTicketUnit = {
  id: string;
  unitIndex: number;
  status: KitchenUnitStatus;
  label: string;
};

type PassTicketLine = {
  id: string;
  quantity: number;
  openQuantity: number;
  targetLabel: string;
  productName: string;
  modifiers: string[];
  note?: string;
  canceledAt?: string;
  units?: PassTicketUnit[];
};

type PassTicket = {
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
  canUndoCompletion: boolean;
  lines: PassTicketLine[];
};

type PassStationConfig = {
  allowedRoles: Role[];
  workspaceLabel: string;
  adminSwitchHref: string;
  adminSwitchLabel: string;
  showWaitControls: boolean;
  getBatches: (session: OrderSession) => KitchenTicketBatch[];
};

const passStationConfig: Record<PassStation, PassStationConfig> = {
  kitchen: {
    allowedRoles: ["kitchen", "admin"],
    workspaceLabel: "KiJu Pass",
    adminSwitchHref: routeConfig.bar,
    adminSwitchLabel: "Zur Bar",
    showWaitControls: true,
    getBatches: (session) => session.kitchenTicketBatches
  },
  bar: {
    allowedRoles: ["bar", "admin"],
    workspaceLabel: "KiJu Bar",
    adminSwitchHref: routeConfig.kitchen,
    adminSwitchLabel: "Zur Küche",
    showWaitControls: false,
    getBatches: (session) => session.barTicketBatches
  }
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

const normalizeKitchenUnits = (item: OrderItem, productName: string): PassTicketUnit[] | undefined => {
  if (item.category === "drinks" || !item.sentAt) {
    return undefined;
  }

  const existingStates = Array.isArray(item.kitchenUnitStates) ? item.kitchenUnitStates : [];

  return Array.from({ length: item.quantity }, (_, index) => {
    const unitState = existingStates[index];
    const status: KitchenUnitStatus =
      item.preparedAt || unitState?.status === "completed"
        ? "completed"
        : unitState?.status === "in-progress"
          ? "in-progress"
          : "pending";

    return {
      id: `${item.id}-unit-${index}`,
      unitIndex: index,
      status,
      label:
        item.quantity === 1 ? productName : `Portion ${index + 1} · ${productName}`
    };
  });
};

const formatKitchenCount = (count: number) =>
  `${count} ${count === 1 ? "offene Portion" : "offene Portionen"}`;

export const PassBoard = ({ station }: { station: PassStation }) => {
  const config = passStationConfig[station];
  const { state, unreadNotifications, actions, currentUser } = useDemoApp();
  const [showArchived, setShowArchived] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [stationClock, setStationClock] = useState(() => Date.now());
  const hasWaitingTickets =
    config.showWaitControls &&
    state.sessions.some((session) =>
      config.getBatches(session).some((ticket) => ticket.status === "countdown")
    );

  useEffect(() => {
    if (!hasWaitingTickets) return;

    const timer = window.setInterval(() => {
      setStationClock(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [hasWaitingTickets]);

  const tickets = useMemo(() => {
    let ticketNumber = 1;

    return state.tables.flatMap((table) => {
      const session = getSessionForTable(state.sessions, table.id);
      if (!session) return [];

      return config.getBatches(session).flatMap((courseTicket) => {
        if (
          !courseTicket.sentAt ||
          courseTicket.status === "not-recorded" ||
          courseTicket.status === "skipped"
        ) {
          return [];
        }

        const ticketItemIds = new Set(courseTicket.itemIds);
        const items = session.items.filter((item) => ticketItemIds.has(item.id));
        if (items.length === 0) {
          return [];
        }

        const lines = items.map((item) => {
          const product = getProductById(state.products, item.productId);
          const productName = product?.name ?? "Unbekannt";
          const canceledAt = item.canceledAt;
          const units = station === "kitchen" ? normalizeKitchenUnits(item, productName) : undefined;
          const openQuantity = isOrderItemCanceled(item)
            ? 0
            : units
            ? units.filter((unit) => unit.status !== "completed").length
            : item.quantity;

          return {
            id: item.id,
            quantity: item.quantity,
            openQuantity,
            targetLabel: resolveTargetLabel(item, table),
            productName,
            modifiers: buildModifierLabels(item, product),
            note: item.note,
            canceledAt,
            units
          };
        });

        const ticketStatus =
          courseTicket.status === "completed" ||
          courseTicket.status === "ready" ||
          courseTicket.status === "countdown" ||
          courseTicket.status === "blocked"
            ? courseTicket.status
            : "ready";
        const waitDisplay =
          config.showWaitControls && ticketStatus === "countdown"
            ? resolveWaitDisplay(courseTicket, stationClock)
            : undefined;
        const courseLabel =
          courseTicket.sequence > 1
            ? `${courseLabels[courseTicket.course]} · Nachbestellung ${courseTicket.sequence}`
            : courseLabels[courseTicket.course];

        const ticket: PassTicket = {
          id: courseTicket.id,
          ticketNumber,
          tableId: table.id,
          tableName: table.name,
          course: courseTicket.course,
          courseLabel,
          sentAt: courseTicket.sentAt,
          completedAt: courseTicket.completedAt,
          status: ticketStatus,
          itemCount: lines.reduce((sum, line) => sum + line.openQuantity, 0),
          targetSummary: buildTargetSummary(items),
          waitLabel: waitDisplay?.label,
          waitExpired: waitDisplay?.expired,
          canUndoCompletion:
            station === "kitchen" &&
            ticketStatus === "completed" &&
            items.every((item) => !item.servedAt),
          lines
        };

        ticketNumber += 1;
        return [ticket];
      });
    });
  }, [config, state.products, state.sessions, state.tables, station, stationClock]);

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
        if (line.canceledAt) continue;
        if (line.openQuantity <= 0) continue;

        const key = `${ticket.course}:${line.productName}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.quantity += line.openQuantity;
          continue;
        }

        grouped.set(key, {
          id: key,
          label: line.productName,
          quantity: line.openQuantity
        });
      }
    }

    return [...grouped.values()].sort((left, right) => {
      if (right.quantity !== left.quantity) return right.quantity - left.quantity;
      return left.label.localeCompare(right.label, "de");
    });
  }, [activeTickets]);

  const openPortionCount = allOpenItems.reduce((sum, item) => sum + item.quantity, 0);

  const renderLineCopy = (line: PassTicketLine) => (
    <div className="kiju-pass-ticket__line-copy">
      <strong>{line.productName}</strong>
      {line.canceledAt ? <span className="kiju-pass-ticket__cancel-badge">Storniert</span> : null}
      <small>{line.targetLabel}</small>
      {line.modifiers.length > 0 ? (
        <em className="kiju-pass-ticket__modifier">{line.modifiers.join(" · ")}</em>
      ) : null}
      {line.note ? <em className="kiju-pass-ticket__note">{line.note}</em> : null}
    </div>
  );

  const renderTicketCard = (ticket: PassTicket) => {
    const canMarkCompleted = ticket.status === "ready";
    const canReleaseWait = config.showWaitControls && ticket.status === "countdown";
    const canToggleKitchenUnits = station === "kitchen" && ticket.status === "ready";
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

        {config.showWaitControls && ticket.status === "countdown" ? (
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
          {ticket.lines.map((line) => {
            if (station !== "kitchen" || !line.units) {
              return (
                <li
                  key={line.id}
                  className={`kiju-pass-ticket__line${line.canceledAt ? " is-canceled" : ""}`}
                >
                  <span className="kiju-pass-ticket__quantity">{line.quantity}</span>
                  {renderLineCopy(line)}
                </li>
              );
            }

            if (line.quantity === 1) {
              const unit = line.units[0];
              if (!unit) return null;

              return (
                <li
                  key={line.id}
                  className={`kiju-pass-ticket__line is-clickable is-${unit.status}${
                    line.canceledAt ? " is-canceled" : ""
                  }`}
                >
                  <button
                    type="button"
                    className="kiju-pass-ticket__line-button"
                    onClick={() =>
                      actions.cycleKitchenItemUnitStatus(
                        ticket.tableId,
                        ticket.id,
                        line.id,
                        unit.unitIndex
                      )
                    }
                    disabled={!canToggleKitchenUnits || Boolean(line.canceledAt)}
                    aria-label={`${ticket.tableName}, ${ticket.courseLabel}, ${line.productName}: aktuell ${
                      kitchenUnitStatusLabels[unit.status]
                    }, weiter zu ${nextKitchenUnitStatusLabels[unit.status]}`}
                  >
                    <span className="kiju-pass-ticket__quantity">{line.quantity}</span>
                    {renderLineCopy(line)}
                  </button>
                </li>
              );
            }

            return (
              <li
                key={line.id}
                className={`kiju-pass-ticket__line is-grouped${
                  line.canceledAt ? " is-canceled" : ""
                }`}
              >
                <span className="kiju-pass-ticket__quantity">{line.quantity}</span>
                <div className="kiju-pass-ticket__line-group">
                  {renderLineCopy(line)}
                  <div className="kiju-pass-ticket__units">
                    {line.units.map((unit) => (
                      <button
                        key={unit.id}
                        type="button"
                        className={`kiju-pass-ticket__unit is-${unit.status}`}
                        onClick={() =>
                          actions.cycleKitchenItemUnitStatus(
                            ticket.tableId,
                            ticket.id,
                            line.id,
                            unit.unitIndex
                          )
                        }
                        disabled={!canToggleKitchenUnits || Boolean(line.canceledAt)}
                        aria-label={`${ticket.tableName}, ${ticket.courseLabel}, ${line.productName}, Portion ${
                          unit.unitIndex + 1
                        }: aktuell ${kitchenUnitStatusLabels[unit.status]}, weiter zu ${
                          nextKitchenUnitStatusLabels[unit.status]
                        }`}
                      >
                        <span>{unit.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <footer className="kiju-pass-ticket__footer">
          <div className="kiju-pass-ticket__footer-copy">
            <span>Arbeitsplatz</span>
            <strong>{config.workspaceLabel}</strong>
            <small>
              {ticket.tableName} ·{" "}
              {station === "kitchen" ? formatKitchenCount(ticket.itemCount) : `${ticket.itemCount} Posten`}
            </small>
          </div>
          {ticket.status !== "countdown" ? (
            <button
              type="button"
              className="kiju-pass-ticket__action"
              onClick={() => actions.markCourseCompleted(ticket.tableId, ticket.course, ticket.id)}
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
              onClick={() => actions.releaseCourse(ticket.tableId, ticket.course, ticket.id)}
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
    <RouteGuard allowedRoles={config.allowedRoles}>
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
              <small>{openPortionCount} offen</small>
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
                    <div className="kiju-kitchen-wallboard__archive-copy">
                      <strong>
                        {ticket.tableName} · {ticket.courseLabel}
                      </strong>
                      <span>{formatClock(ticket.completedAt)}</span>
                    </div>
                    {ticket.canUndoCompletion ? (
                      <button
                        type="button"
                        className="kiju-kitchen-wallboard__archive-action"
                        onClick={() => actions.reopenKitchenBatch(ticket.tableId, ticket.id)}
                        aria-label={`${ticket.courseLabel} für ${ticket.tableName} zurücksetzen`}
                      >
                        <RotateCcw size={14} />
                        Zurück
                      </button>
                    ) : null}
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
              <>
                <Link href={routeConfig.waiter} className="kiju-kitchen-wallboard__service-link">
                  Zum Service
                </Link>
                <Link href={config.adminSwitchHref} className="kiju-kitchen-wallboard__service-link">
                  {config.adminSwitchLabel}
                </Link>
              </>
            ) : null}
            <RoleSwitchPopover />
          </div>
        </footer>
      </main>
    </RouteGuard>
  );
};
