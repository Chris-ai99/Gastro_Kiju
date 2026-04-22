"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  ChefHat,
  CheckCircle2,
  Clock3,
  Euro,
  Map,
  Minus,
  Plus,
  Receipt,
  ShoppingBag,
  Trash2,
  Users,
  X
} from "lucide-react";

import { routeConfig, serviceLabels } from "@kiju/config";
import {
  buildDashboardSummary,
  euro,
  getSeatItems,
  getTableTargetItems,
  type CourseKey,
  type OrderItem,
  type OrderSession,
  type OrderTarget,
  type Product,
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
import { ThermalReceiptPaper } from "./thermal-receipt-paper";

const serviceSteps = ["Getränke", "Vorspeise", "Hauptspeise", "Nachtisch", "Review"] as const;
const serviceStepCourses: (CourseKey | "review")[] = [
  "drinks",
  "starter",
  "main",
  "dessert",
  "review"
];

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
  waiting: "Warten",
  "ready-to-bill": "Verbuchen",
  planned: "Geplant"
};

const paymentMethodLabels: Record<"cash" | "card" | "voucher", string> = {
  cash: "Bar",
  card: "Karte",
  voucher: "Gutschein"
};

const toneByStatus: Record<string, "navy" | "amber" | "red" | "green" | "slate"> = {
  idle: "slate",
  serving: "navy",
  waiting: "red",
  "ready-to-bill": "green",
  planned: "slate"
};

const courseTicketStatusLabels: Record<string, string> = {
  "not-recorded": "Noch nicht gesendet",
  blocked: "Gesperrt",
  countdown: "Wartet",
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

const tableOrderTarget: OrderTarget = { type: "table" };

const isSeatVisible = (seat: TableSeat) => seat.visible !== false;

const getVisibleSeats = (seats: TableSeat[]) => seats.filter(isSeatVisible);

const isItemForTarget = (item: OrderItem, target: OrderTarget) =>
  target.type === "table"
    ? item.target.type === "table"
    : item.target.type === "seat" && item.target.seatId === target.seatId;

const serviceTicketCourses: CourseKey[] = ["drinks", "starter", "main", "dessert"];
const kitchenWaitCourses: CourseKey[] = ["starter", "main", "dessert"];
const waitMinutePresets = [5, 10, 15, 20, 30] as const;
const fallbackDrinkSubcategory = "Sonstiges";
const preferredDrinkSubcategoryOrder = ["Alkoholfrei", "Bier/Radler", "Wein"] as const;

const getDrinkSubcategory = (product: Product) =>
  product.drinkSubcategory?.trim() || fallbackDrinkSubcategory;

const sortDrinkSubcategories = (groups: string[]) =>
  [...groups].sort((left, right) => {
    if (left === fallbackDrinkSubcategory && right !== fallbackDrinkSubcategory) return 1;
    if (right === fallbackDrinkSubcategory && left !== fallbackDrinkSubcategory) return -1;

    const leftPreferredIndex = preferredDrinkSubcategoryOrder.indexOf(
      left as typeof preferredDrinkSubcategoryOrder[number]
    );
    const rightPreferredIndex = preferredDrinkSubcategoryOrder.indexOf(
      right as typeof preferredDrinkSubcategoryOrder[number]
    );

    if (leftPreferredIndex !== -1 || rightPreferredIndex !== -1) {
      if (leftPreferredIndex === -1) return 1;
      if (rightPreferredIndex === -1) return -1;
      return leftPreferredIndex - rightPreferredIndex;
    }

    return left.localeCompare(right, "de");
  });

const ticketStatusDisplayLabels: Record<string, string> = {
  "not-recorded": "Noch nicht gesendet",
  blocked: "Gesperrt",
  countdown: "Wartezeit",
  ready: "Frei in der Küche",
  completed: "Fertig in der Küche",
  delivered: "Geliefert",
  skipped: "Übersprungen"
};

const ticketStatusDisplayTones: Record<string, "navy" | "amber" | "red" | "green" | "slate"> = {
  "not-recorded": "slate",
  blocked: "red",
  countdown: "amber",
  ready: "navy",
  completed: "green",
  delivered: "green",
  skipped: "slate"
};

const deliveredCourseStatusLabels: Record<CourseKey, string> = {
  drinks: "Getränke geliefert",
  starter: "Vorspeise geliefert",
  main: "Hauptspeise geliefert",
  dessert: "Nachtisch geliefert"
};

const deliveredCourseStatusDescriptions: Record<CourseKey, string> = {
  drinks: "Getränke wurden geliefert.",
  starter: "Vorspeisen wurden geliefert.",
  main: "Hauptspeisen wurden geliefert.",
  dessert: "Nachtisch wurde geliefert."
};

const formatTicketStatusDisplayLabel = (course: CourseKey, status: string) =>
  status === "delivered"
    ? deliveredCourseStatusLabels[course]
    : ticketStatusDisplayLabels[status] ?? status;

const describeCourseTicketStatus = (status: string, course?: CourseKey) => {
  if (status === "delivered" && course) {
    return deliveredCourseStatusDescriptions[course];
  }

  switch (status) {
    case "not-recorded":
      return "Der Gang ist erfasst, aber noch nicht an die Küche gesendet.";
    case "countdown":
      return "Dieser Gang ist an die Küche gesendet, startet aber erst nach der Wartezeit.";
    case "blocked":
      return "Dieser Gang ist aktuell noch gesperrt.";
    case "ready":
      return "Jetzt in der Küche. Noch nicht als fertig gemeldet.";
    case "completed":
      return "In der Küche als fertig markiert. Der Service kann servieren.";
    case "skipped":
      return "Dieser Gang wurde übersprungen.";
    default:
      return "Aktueller Stand wird synchronisiert.";
  }
};

const resolveServiceCourseStatus = (session: OrderSession, course: CourseKey) => {
  const items = session.items.filter((item) => item.category === course);
  if (items.length > 0 && items.every((item) => Boolean(item.servedAt))) {
    return {
      status: "delivered" as const,
      minutesLeft: 0
    };
  }

  return resolveCourseStatus(session, course);
};

const formatCourseStatusLabel = (
  entry: { status: string; minutesLeft: number } | null,
  course?: CourseKey
) => {
  if (!entry) return "Noch nicht gesendet";
  if (entry.status === "delivered" && course) {
    return deliveredCourseStatusLabels[course];
  }

  if (entry.status !== "countdown") {
    return ticketStatusDisplayLabels[entry.status] ?? entry.status;
  }

  return entry.minutesLeft > 0
    ? `Wartet ${entry.minutesLeft} Min.`
    : "Wartezeit abgelaufen";
};

export const WaiterWorkspace = () => {
  const { state, currentUser, unreadNotifications, sharedSync, actions } = useDemoApp();
  const serviceSectionRef = useRef<HTMLElement | null>(null);
  const floorplanSectionRef = useRef<HTMLElement | null>(null);
  const dashboard = useMemo(() => buildDashboardSummary(state), [state]);
  const defaultTableId =
    dashboard.find((entry) => entry.table.active)?.table.id ?? dashboard[0]?.table.id ?? null;
  const [selectedTableId, setSelectedTableId] = useState<string | null>(defaultTableId);
  const [selectedSeatId, setSelectedSeatId] = useState("");
  const [activeCourse, setActiveCourse] = useState<CourseKey | "review">("drinks");
  const [activeDrinkSubcategory, setActiveDrinkSubcategory] = useState(fallbackDrinkSubcategory);
  const [showMobileFloorplan, setShowMobileFloorplan] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "voucher">("cash");
  const [receiptPreview, setReceiptPreview] = useState<{
    mode: "print" | "reprint";
    openedAt: string;
  } | null>(null);
  const [serviceFeedback, setServiceFeedback] = useState<{
    tone: "success" | "alert" | "info";
    title: string;
    detail: string;
  } | null>(null);
  const [waitPlannerOpen, setWaitPlannerOpen] = useState(false);
  const [waitCourse, setWaitCourse] = useState<CourseKey>("main");
  const [waitMinutes, setWaitMinutes] = useState("10");

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
  const selectedDashboardEntry =
    dashboard.find((entry) => entry.table.id === selectedTableId) ?? null;

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
  const drinkSubcategories = useMemo(() => {
    if (activeCourse !== "drinks") return [];

    return sortDrinkSubcategories([...new Set(currentProducts.map(getDrinkSubcategory))]);
  }, [activeCourse, currentProducts]);
  const selectedDrinkSubcategory = drinkSubcategories.includes(activeDrinkSubcategory)
    ? activeDrinkSubcategory
    : drinkSubcategories[0] ?? fallbackDrinkSubcategory;
  const visibleProducts = useMemo(
    () =>
      activeCourse === "drinks"
        ? currentProducts.filter(
            (product) => getDrinkSubcategory(product) === selectedDrinkSubcategory
          )
        : currentProducts,
    [activeCourse, currentProducts, selectedDrinkSubcategory]
  );

  useEffect(() => {
    if (activeCourse !== "drinks" || drinkSubcategories.length === 0) return;
    if (drinkSubcategories.includes(activeDrinkSubcategory)) return;

    const nextDrinkSubcategory = drinkSubcategories[0];
    if (nextDrinkSubcategory) {
      setActiveDrinkSubcategory(nextDrinkSubcategory);
    }
  }, [activeCourse, activeDrinkSubcategory, drinkSubcategories]);

  const activeTableCount = dashboard.filter(
    (entry) => entry.status !== "idle" && entry.status !== "planned"
  ).length;
  const attentionTableCount = dashboard.filter(
    (entry) =>
      entry.status === "waiting" || entry.status === "ready-to-bill"
  ).length;
  const selectedTargetLabel =
    selectedOrderTarget.type === "table"
      ? "Tisch"
      : selectedTable?.seats.find((seat) => seat.id === selectedOrderTarget.seatId)?.label ??
        "Sitzplatz";
  const activeCourseTicketState =
    activeCourse === "review" || !selectedSession
      ? null
      : resolveServiceCourseStatus(selectedSession, activeCourse);
  const waitableCourses = useMemo(() => {
    if (!selectedSession) return [];

    return kitchenWaitCourses
      .map((course) => {
        const itemCount = selectedSession.items
          .filter((item) => item.category === course)
          .reduce((sum, item) => sum + item.quantity, 0);
        const ticket = selectedSession.courseTickets[course];
        const resolved = resolveServiceCourseStatus(selectedSession, course);

        return {
          course,
          itemCount,
          minutesLeft: resolved.minutesLeft,
          status: resolved.status,
          isWaiting: ticket.status === "countdown"
        };
      })
      .filter(
        (entry) =>
          entry.itemCount > 0 &&
          entry.status !== "completed" &&
          entry.status !== "skipped"
      );
  }, [selectedSession]);
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
  const sessionItemCount =
    selectedSession?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const openServiceDeliveryNotifications = unreadNotifications.filter(
    (notification) =>
      notification.kind === "service-drinks" || notification.kind === "service-course-ready"
  );
  const acceptedServiceDeliveryNotifications = unreadNotifications.filter(
    (notification) =>
      (notification.kind === "service-drinks-accepted" ||
        notification.kind === "service-course-ready-accepted") &&
      (!notification.acceptedByUserId || notification.acceptedByUserId === currentUser?.id)
  );
  const serviceDeliveryNotifications = [
    ...acceptedServiceDeliveryNotifications,
    ...openServiceDeliveryNotifications
  ];

  useEffect(() => {
    setServiceFeedback(null);
    setWaitPlannerOpen(false);
  }, [activeCourse, selectedSeatId, selectedTableId, serviceOrderMode]);

  useEffect(() => {
    setReceiptPreview(null);
  }, [selectedTableId]);

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
            ? "Die Getränke konnten nicht gemeldet werden."
            : "Die Positionen konnten nicht an die Küche gesendet werden.")
      });
      return;
    }

    const syncHint =
      activeCourse === "drinks"
        ? sharedSync.status === "online"
          ? "Der Hinweis ist jetzt auf den Servicegeräten sichtbar."
          : "Der Hinweis wurde lokal gespeichert. Für alle Servicegeräte muss der gemeinsame Sync erreichbar sein."
        : sharedSync.status === "online"
          ? "Der Bon ist für Küche und andere Geräte jetzt im gemeinsamen Stand."
          : "Der Bon wurde lokal gespeichert. Für mehrere Geräte muss der gemeinsame Sync erreichbar sein.";

    setServiceFeedback({
      tone: "success",
      title:
        activeCourse === "drinks" ? "Getränke gemeldet" : `${courseLabels[activeCourse]} gesendet`,
      detail: `${result.message ?? "Die Positionen wurden erfolgreich an die Küche gesendet."} ${syncHint}`
    });
  };

  const openWaitPlanner = () => {
    if (!selectedTable || waitableCourses.length === 0) {
      setServiceFeedback({
        tone: "alert",
        title: "Keine Speisen zum Warten",
        detail: "Für diesen Tisch sind aktuell keine offenen Küchengänge gebucht."
      });
      return;
    }

    const preferredCourse =
      activeCourse !== "review" && waitableCourses.some((entry) => entry.course === activeCourse)
        ? activeCourse
        : waitableCourses[0]?.course ?? "main";

    setWaitCourse(preferredCourse);
    setWaitPlannerOpen((current) => !current);
  };

  const confirmCourseWait = () => {
    if (!selectedTable) return;

    const minutes = Number(waitMinutes);
    if (!Number.isFinite(minutes) || minutes < 1) {
      setServiceFeedback({
        tone: "alert",
        title: "Wartezeit prüfen",
        detail: "Bitte eine Wartezeit ab 1 Minute eingeben."
      });
      return;
    }

    const result = actions.setCourseWait(selectedTable.id, waitCourse, minutes);
    if (!result.ok) {
      setServiceFeedback({
        tone: "alert",
        title: "Wartezeit nicht gesetzt",
        detail: result.message ?? "Der Gang konnte nicht auf Warten gesetzt werden."
      });
      return;
    }

    setWaitPlannerOpen(false);
    setServiceFeedback({
      tone: "info",
      title: "Wartezeit gesetzt",
      detail: `${result.message ?? "Die Wartezeit wurde gesetzt."} Beim Senden an die Küche bleibt dieser Gang zuerst auf Timer.`
    });
  };

  const openReceiptPreview = (mode: "print" | "reprint") => {
    if (!selectedTable || !selectedSession) return;

    setReceiptPreview({
      mode,
      openedAt: new Date().toISOString()
    });
  };

  const toggleMobileFloorplan = () => {
    setShowMobileFloorplan((current) => {
      const next = !current;
      if (next) {
        window.requestAnimationFrame(() => {
          floorplanSectionRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        });
      }

      return next;
    });
  };

  const handleReceiptPrint = () => {
    if (!selectedTable || !selectedSession || !receiptPreview) return;

    if (receiptPreview.mode === "reprint") {
      actions.reprintReceipt(selectedTable.id);
    } else {
      actions.printReceipt(selectedTable.id);
    }

    window.requestAnimationFrame(() => {
      window.print();
    });
  };

  const handleNotificationAction = (notification: (typeof unreadNotifications)[number]) => {
    if (
      isWaiterView &&
      (notification.kind === "service-drinks" || notification.kind === "service-course-ready")
    ) {
      actions.markNotificationRead(notification.id, "shared");
      setServiceFeedback({
        tone: "info",
        title: notification.kind === "service-drinks" ? "Getränke angenommen" : "Speisen angenommen",
        detail: "Alle im Service sehen jetzt, dass du dich darum kümmerst."
      });
      return;
    }

    if (
      isWaiterView &&
      (notification.kind === "service-drinks-accepted" ||
        notification.kind === "service-course-ready-accepted")
    ) {
      actions.markNotificationRead(notification.id, "shared");
      setServiceFeedback({
        tone: "success",
        title:
          notification.kind === "service-drinks-accepted"
            ? "Getränke ausgeliefert"
            : "Speisen ausgeliefert",
        detail: "Der Auftrag wurde aus deiner Auslieferung entfernt."
      });
      return;
    }

    actions.markNotificationRead(notification.id, "local");
  };

  const handleNotificationDismiss = (notificationId: string) => {
    actions.markNotificationRead(notificationId, "local");
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
          <div className="kiju-order-item-card__main">
            <div className="kiju-order-item-card__title">
              <strong>{resolveProductName(state.products, item.productId)}</strong>
              <small>{courseLabels[item.category]}</small>
            </div>

            <label className="kiju-inline-field kiju-inline-field--compact">
              <span>Ziel</span>
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

            <div className="kiju-inline-field kiju-inline-field--compact">
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
                  <Minus size={14} />
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
                  <Plus size={14} />
                </button>
              </div>
            </div>

            <button
              type="button"
              className="kiju-button kiju-button--danger kiju-order-item-card__delete"
              onClick={() => actions.removeItem(selectedTable.id, item.id)}
            >
              <Trash2 size={14} />
              Löschen
            </button>
          </div>

          <label className="kiju-inline-field kiju-inline-field--note">
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
              Vollbild-Raumplan für den Service. Tisch antippen, nach unten springen und direkt am
              Tisch weiterarbeiten.
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
                          {notification.kind === "service-drinks" ||
                          notification.kind === "service-course-ready"
                            ? "Annehmen"
                            : "Erledigt"}
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

        {isWaiterView && serviceDeliveryNotifications.length > 0 ? (
          <aside className="kiju-service-drink-popup-stack" role="alert" aria-live="polite">
            {serviceDeliveryNotifications.map((notification) => (
              <article key={notification.id} className="kiju-service-drink-popup">
                <button
                  type="button"
                  className="kiju-service-drink-popup__dismiss"
                  aria-label="Quick-Benachrichtigung schließen"
                  onClick={() => handleNotificationDismiss(notification.id)}
                >
                  <X size={16} />
                </button>
                <div className="kiju-service-drink-popup__content">
                  <span className="kiju-service-drink-popup__eyebrow">
                    {notification.kind === "service-drinks"
                      ? "Getränke-Service"
                      : notification.kind === "service-course-ready"
                        ? "Küchenpass"
                      : notification.kind === "service-drinks-accepted" ||
                          notification.kind === "service-course-ready-accepted"
                        ? "Übernommen"
                        : "Serviceauftrag"}
                  </span>
                  <strong>{notification.title}</strong>
                  <span>{notification.body}</span>
                </div>
                <button
                  type="button"
                  className="kiju-button kiju-button--primary"
                  onClick={() => handleNotificationAction(notification)}
                >
                  <CheckCircle2 size={18} />
                  {notification.kind === "service-drinks" ||
                  notification.kind === "service-course-ready"
                    ? "Annehmen"
                    : "Erledigt"}
                </button>
              </article>
            ))}
          </aside>
        ) : null}

        {isWaiterView ? (
          <section className="kiju-service-drink-delivery">
            <div className="kiju-service-drink-delivery__header">
              <div>
                <span>Service</span>
                <strong>Auslieferung</strong>
              </div>
              <StatusPill
                label={`${serviceDeliveryNotifications.length} offen`}
                tone={serviceDeliveryNotifications.length > 0 ? "amber" : "slate"}
              />
            </div>

            {serviceDeliveryNotifications.length === 0 ? (
              <p>Keine offenen Auslieferungen für den Service.</p>
            ) : (
              <div className="kiju-service-drink-delivery__list">
                {serviceDeliveryNotifications.map((notification) => (
                  <article key={notification.id} className="kiju-service-drink-delivery__item">
                    <div>
                      <strong>{notification.title}</strong>
                      <span>{notification.body}</span>
                      {notification.kind === "service-drinks-accepted" ||
                      notification.kind === "service-course-ready-accepted" ? (
                        <small>Angenommen von {notification.acceptedByName ?? "Service"}</small>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="kiju-button kiju-button--primary"
                      onClick={() => handleNotificationAction(notification)}
                    >
                      <CheckCircle2 size={18} />
                      {notification.kind === "service-drinks-accepted" ||
                      notification.kind === "service-course-ready-accepted"
                        ? "Erledigt"
                        : "Annehmen"}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {isWaiterView ? (
          <section
            ref={floorplanSectionRef}
            className={`kiju-floorplan-stage ${showMobileFloorplan ? "is-mobile-open" : ""}`}
          >
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
                        if (!seat || !isSeatVisible(seat)) return null;

                        return (
                          <button
                            key={seat.id}
                            type="button"
                            className={`kiju-floorplan-seat-hotspot ${seat.id === selectedSeatId ? "is-selected" : ""}`}
                            aria-label={`${entry.table.name}, Platz ${index + 1} auswählen`}
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
              detail="Aktuell in Bedienung oder Warten"
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
                label="Warten"
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
                  ? usesSeatMode
                    ? `${visibleSeats.length} sichtbare Plätze`
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
                  ? usesSeatMode
                    ? `Sitzplätze und Service für ${selectedTable.name}`
                    : `Service für ${selectedTable.name}`
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
                          ? `${getVisibleSeats(entry.table.seats).length} sichtbare Plätze`
                          : "Tischmodus"}{" "}
                        · {statusLabel[entry.status] ?? "Status"}
                      </small>
                    </button>
                  ))}
                </div>
              ) : null}

              {isWaiterView ? (
                <button
                  type="button"
                  className="kiju-button kiju-button--secondary kiju-mobile-floorplan-toggle"
                  onClick={toggleMobileFloorplan}
                >
                  <Map size={18} />
                  {showMobileFloorplan ? "Raumplan ausblenden" : "Raumplan anzeigen"}
                </button>
              ) : null}

              <div className="kiju-mobile-service-summary" aria-label="Aktueller Service-Stand">
                <div>
                  <span>Aktueller Tisch</span>
                  <strong>{selectedTable?.name ?? "Kein Tisch"}</strong>
                </div>
                <StatusPill
                  label={
                    selectedDashboardEntry
                      ? statusLabel[selectedDashboardEntry.status] ?? "Status"
                      : "Bereit"
                  }
                  tone={
                    selectedDashboardEntry
                      ? toneByStatus[selectedDashboardEntry.status] ?? "slate"
                      : "slate"
                  }
                />
                <div>
                  <span>{sessionItemCount} Artikel</span>
                  <strong>{euro(sessionTotal)}</strong>
                </div>
              </div>

              {selectedTable ? (
                <>
                  <ProgressSteps
                    steps={serviceSteps.map((step) => step)}
                    currentStep={activeCourse === "review" ? "Review" : courseLabels[activeCourse]}
                    onStepSelect={(step) => {
                      const nextCourse = serviceStepCourses[serviceSteps.indexOf(step as typeof serviceSteps[number])];

                      if (nextCourse) {
                        setActiveCourse(nextCourse);
                      }
                    }}
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
                                : "Die Rechnung läuft gesammelt auf den ausgewählten Tisch."}
                            </small>
                          </div>
                          <button
                            className="kiju-button kiju-button--primary"
                            onClick={() => openReceiptPreview("print")}
                            disabled={!!selectedSession?.receipt.printedAt}
                          >
                            Bon-Vorschau öffnen
                          </button>
                          <button
                            className="kiju-button kiju-button--secondary"
                            onClick={() => openReceiptPreview("reprint")}
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

                        {receiptPreview ? (
                          <section className="kiju-receipt-preview-panel" aria-label="Bon-Vorschau">
                            <div className="kiju-receipt-preview-panel__header">
                              <div>
                                <span className="kiju-eyebrow">Bon-Vorschau</span>
                                <strong>
                                  {receiptPreview.mode === "reprint"
                                    ? "Erneuten Druck prüfen"
                                    : "Rechnung prüfen"}
                                </strong>
                              </div>
                              <StatusPill
                                label={receiptPreview.mode === "reprint" ? "Reprint" : "Erstdruck"}
                                tone="navy"
                              />
                            </div>

                            {selectedSession ? (
                              <ThermalReceiptPaper
                                session={selectedSession}
                                products={state.products}
                                openedAt={receiptPreview.openedAt}
                              />
                            ) : null}

                            <div className="kiju-receipt-preview-panel__actions">
                              <button
                                type="button"
                                className="kiju-button kiju-button--secondary"
                                onClick={() => setReceiptPreview(null)}
                              >
                                Zurück bearbeiten
                              </button>
                              <button
                                type="button"
                                className="kiju-button kiju-button--primary"
                                onClick={handleReceiptPrint}
                              >
                                Bon drucken
                              </button>
                            </div>
                          </section>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <>
                      {activeCourse === "drinks" && drinkSubcategories.length > 0 ? (
                        <div className="kiju-drink-group-tabs" aria-label="Getränkegruppen">
                          {drinkSubcategories.map((group) => (
                            <button
                              key={group}
                              type="button"
                              className={`kiju-drink-group-tab ${
                                group === selectedDrinkSubcategory ? "is-selected" : ""
                              }`}
                              onClick={() => setActiveDrinkSubcategory(group)}
                            >
                              {group}
                            </button>
                          ))}
                        </div>
                      ) : null}

                      <div className="kiju-product-grid">
                        {visibleProducts.length > 0 ? (
                          visibleProducts.map((product) => (
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
                          ))
                        ) : (
                          <div className="kiju-inline-panel">
                            <span>
                              {activeCourse === "drinks"
                                ? "In dieser Gruppe ist noch kein Getränk angelegt."
                                : `Für ${courseLabels[activeCourse]} ist noch keine Leistung angelegt.`}
                            </span>
                          </div>
                        )}
                      </div>

                      <AccordionSection
                        title={`Erfasste Leistungen für ${selectedTargetLabel} (${editableItems.length})`}
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
                            `Für ${selectedTargetLabel} wurde in ${courseLabels[activeCourse]} noch nichts erfasst.`
                          )}
                        </div>
                      </AccordionSection>

                      <div className="kiju-service-sync-row">
                        <StatusPill
                          label={formatCourseStatusLabel(activeCourseTicketState, activeCourse)}
                          tone={
                            activeCourseTicketState
                              ? ticketStatusDisplayTones[activeCourseTicketState.status] ?? "slate"
                              : "slate"
                          }
                        />
                        <StatusPill label={syncStatusLabel} tone={syncStatusTone} />
                      </div>

                      {waitPlannerOpen ? (
                        <div className="kiju-course-wait-panel">
                          <div className="kiju-course-wait-panel__header">
                            <div>
                              <strong>Gang warten lassen</strong>
                              <span>Wähle eine gebuchte Kategorie und die Wartezeit für die Küche.</span>
                            </div>
                            <button
                              type="button"
                              className="kiju-button kiju-button--secondary"
                              onClick={() => setWaitPlannerOpen(false)}
                              aria-label="Wartezeit-Auswahl schließen"
                            >
                              <X size={16} />
                            </button>
                          </div>
                          <div className="kiju-course-wait-panel__fields">
                            <label className="kiju-inline-field">
                              <span>Kategorie</span>
                              <select
                                value={waitCourse}
                                onChange={(event) => setWaitCourse(event.target.value as CourseKey)}
                              >
                                {waitableCourses.map((entry) => (
                                  <option key={entry.course} value={entry.course}>
                                    {courseLabels[entry.course]} · {entry.itemCount}{" "}
                                    {entry.itemCount === 1 ? "Position" : "Positionen"}
                                    {entry.isWaiting ? " · wartet bereits" : ""}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="kiju-inline-field">
                              <span>Minuten</span>
                              <input
                                type="number"
                                min={1}
                                max={180}
                                value={waitMinutes}
                                onChange={(event) => setWaitMinutes(event.target.value)}
                              />
                            </label>
                          </div>
                          <div className="kiju-course-wait-panel__presets">
                            {waitMinutePresets.map((minutes) => (
                              <button
                                key={minutes}
                                type="button"
                                className={`kiju-wait-preset${
                                  waitMinutes === String(minutes) ? " is-selected" : ""
                                }`}
                                onClick={() => setWaitMinutes(String(minutes))}
                              >
                                {minutes} Min.
                              </button>
                            ))}
                          </div>
                          <div className="kiju-course-wait-panel__actions">
                            <button
                              type="button"
                              className="kiju-button kiju-button--secondary"
                              onClick={() => setWaitPlannerOpen(false)}
                            >
                              Abbrechen
                            </button>
                            <button
                              type="button"
                              className="kiju-button kiju-button--primary"
                              onClick={confirmCourseWait}
                            >
                              Wartezeit bestätigen
                            </button>
                          </div>
                        </div>
                      ) : null}

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
                          onClick={openWaitPlanner}
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
                          {activeCourse === "drinks" ? (
                            <>
                              <Bell size={18} />
                              Getränke melden
                            </>
                          ) : (
                            <>
                              <ChefHat size={18} />
                              Alles an Küche senden
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
            eyebrow="Live für den gewählten Tisch"
            className="kiju-table-summary-panel"
            contentClassName="kiju-table-summary-panel__content"
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
                    {usesSeatMode
                      ? `${selectedSession.items.length} Positionen für ${visibleSeats.length} sichtbare Plätze`
                      : `${selectedSession.items.length} Positionen am Tisch`}
                  </small>
                </div>
                <div className="kiju-inline-panel">
                  <strong>Direkt bearbeiten</strong>
                  <small>
                    Positionen können hier direkt verschoben, in der Menge geändert oder gelöscht
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
                            label={formatTicketStatusDisplayLabel(entry.course, entry.status)}
                            tone={ticketStatusDisplayTones[entry.status] ?? "slate"}
                          />
                          <StatusPill
                            label={`${entry.itemCount} ${entry.itemCount === 1 ? "Position" : "Positionen"}`}
                            tone="slate"
                          />
                        </div>
                        <small>{describeCourseTicketStatus(entry.status, entry.course)}</small>
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
              <p>Für diesen Tisch wurde noch keine Bestellung gestartet.</p>
            )}
          </AccordionSection>
        </div>
        {receiptPreview && selectedSession ? (
          <div className="kiju-print-root" aria-hidden="true">
            <ThermalReceiptPaper
              session={selectedSession}
              products={state.products}
              openedAt={receiptPreview.openedAt}
              className="kiju-receipt-paper--print"
            />
          </div>
        ) : null}
      </main>
    </RouteGuard>
  );
};


