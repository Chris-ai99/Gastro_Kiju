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
  Split,
  Trash2,
  Users,
  X
} from "lucide-react";

import { routeConfig, serviceLabels } from "@kiju/config";
import {
  EXTRA_INGREDIENTS_MODIFIER_GROUP_ID,
  buildClosedSessions,
  buildDashboardSummary,
  calculateGuestCount,
  calculatePaidItemQuantity,
  calculateItemTotal,
  calculateSessionBillableTotal,
  calculateSessionOpenTotal,
  euro,
  getCheckoutTableIds,
  getLinkedTableGroupForTable,
  getOpenLineItems,
  getProductById,
  getSeatItems,
  getTableTargetItems,
  isOrderItemCanceled,
  type CourseKey,
  type ExtraIngredient,
  type OrderItem,
  type OrderSession,
  type OrderTarget,
  type PaymentLineItem,
  type Product,
  type TableSeat
} from "@kiju/domain";
import {
  buildReceiptDocumentFromSessions,
  buildReceiptPrintDocument,
  type ReceiptDocumentInput,
  type ReceiptDocumentMode
} from "@kiju/print-bridge";
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
import { createPrintJob } from "../lib/print-client";
import { RouteGuard } from "./route-guard";
import { ServiceTopbarMenu } from "./service-topbar-menu";
import { ThermalReceiptPaper } from "./thermal-receipt-paper";

const orderWizardSteps = [
  "Getränke",
  "Vorspeise",
  "Hauptspeise",
  "Nachtisch"
] as const;
const checkoutWizardSteps = ["Abrechnung"] as const;
const wizardSteps = ["Tisch", ...orderWizardSteps, "Abrechnung"] as const;
type OrderWizardStepLabel = (typeof orderWizardSteps)[number];
type CheckoutWizardStepLabel = (typeof checkoutWizardSteps)[number];
type WizardStepLabel = OrderWizardStepLabel | CheckoutWizardStepLabel;
type WaiterOrderStep = CourseKey | "checkout";
type WaiterStep = "table" | WaiterOrderStep;

const orderStepSequence: WaiterOrderStep[] = [
  "drinks",
  "starter",
  "main",
  "dessert"
];
const waiterStepLabels: Record<WaiterOrderStep, WizardStepLabel> = {
  drinks: "Getränke",
  starter: "Vorspeise",
  main: "Hauptspeise",
  dessert: "Nachtisch",
  checkout: "Abrechnung"
};
const waiterStepByLabel: Record<WizardStepLabel, WaiterOrderStep> = {
  Getränke: "drinks",
  Vorspeise: "starter",
  Hauptspeise: "main",
  Nachtisch: "dessert",
  Abrechnung: "checkout"
};
const serviceFeedbackTimeoutMs = 3000;
const isCourseStep = (step: WaiterStep): step is CourseKey =>
  step === "drinks" || step === "starter" || step === "main" || step === "dessert";

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

  if (course === "drinks") {
    switch (status) {
      case "not-recorded":
        return "Die Getränke sind erfasst, aber noch nicht an die Bar gesendet.";
      case "ready":
        return "Jetzt an der Bar. Noch nicht als fertig gemeldet.";
      case "completed":
        return "An der Bar als fertig markiert. Der Service kann ausliefern.";
      case "skipped":
        return "Die Getränkerunde wurde übersprungen.";
      default:
        return "Aktueller Getränkestand wird synchronisiert.";
    }
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

const resolveItemModifierLabels = (
  item: Pick<OrderItem, "productId" | "modifiers">,
  products: Product[]
) => {
  const product = getProductById(products, item.productId);
  if (!product || item.modifiers.length === 0) {
    return [];
  }

  return item.modifiers.flatMap((selection) => {
    const group = product.modifierGroups.find((entry) => entry.id === selection.groupId);
    if (!group) {
      return [];
    }

    const optionNames = selection.optionIds
      .map((optionId) => group.options.find((option) => option.id === optionId)?.name)
      .filter((optionName): optionName is string => Boolean(optionName));

    if (optionNames.length === 0) {
      return [];
    }

    return [`${group.name}: ${optionNames.join(", ")}`];
  });
};

const resolveExtraIngredientLabels = (
  item: Pick<OrderItem, "modifiers">,
  product: Product | undefined,
  extraIngredients: ExtraIngredient[]
) => {
  const selectedIngredientIds =
    item.modifiers.find((selection) => selection.groupId === EXTRA_INGREDIENTS_MODIFIER_GROUP_ID)
      ?.optionIds ?? [];
  if (selectedIngredientIds.length === 0) {
    return [];
  }

  const extraIngredientOptions = product?.modifierGroups.find(
    (group) => group.id === EXTRA_INGREDIENTS_MODIFIER_GROUP_ID
  )?.options;
  const ingredientNamesById = new globalThis.Map(
    extraIngredients.map((ingredient) => [ingredient.id, ingredient.name])
  );

  return selectedIngredientIds.map(
    (ingredientId) =>
      extraIngredientOptions?.find((option) => option.id === ingredientId)?.name ??
      ingredientNamesById.get(ingredientId) ??
      ingredientId
  );
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

const formatHistoryDateTime = (value?: string) => {
  if (!value) return "Zeit unbekannt";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
};

const resolveHistoryPaymentTargets = (
  session: OrderSession,
  table: { seats: TableSeat[] },
  payment: OrderSession["payments"][number]
) => {
  const itemIds = new Set(payment.lineItems.map((lineItem) => lineItem.itemId));
  const targetLabels = [
    ...new Set(
      session.items.flatMap((item) => {
        if (!itemIds.has(item.id)) return [];

        const target = item.target;
        if (target.type === "table") {
          return ["Tisch"];
        }

        return [table.seats.find((seat: TableSeat) => seat.id === target.seatId)?.label ?? "Sitzplatz"];
      })
    )
  ];

  return targetLabels.length > 0 ? targetLabels.join(", ") : "Unbekannt";
};

export const WaiterWorkspace = () => {
  const { state, currentUser, unreadNotifications, sharedSync, actions } = useDemoApp();
  const serviceSectionRef = useRef<HTMLElement | null>(null);
  const floorplanSectionRef = useRef<HTMLElement | null>(null);
  const orderWizardModalRef = useRef<HTMLDivElement | null>(null);
  const dashboard = useMemo(() => buildDashboardSummary(state), [state]);
  const defaultTableId =
    dashboard.find((entry) => entry.table.active)?.table.id ?? dashboard[0]?.table.id ?? null;
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedSeatId, setSelectedSeatId] = useState("");
  const [currentStep, setCurrentStep] = useState<WaiterStep>("table");
  const [isTableActionDialogOpen, setIsTableActionDialogOpen] = useState(false);
  const [isOrderWizardOpen, setIsOrderWizardOpen] = useState(false);
  const [activeDrinkSubcategory, setActiveDrinkSubcategory] = useState(fallbackDrinkSubcategory);
  const [showMobileFloorplan, setShowMobileFloorplan] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "voucher">("cash");
  const [selectedPaymentQuantities, setSelectedPaymentQuantities] = useState<Record<string, number>>({});
  const [linkTableSelection, setLinkTableSelection] = useState<string[]>([]);
  const [isLinkTablesOpen, setIsLinkTablesOpen] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState<{
    printMode: "receipt" | "reprint";
    receiptMode: ReceiptDocumentMode;
    openedAt: string;
    title: string;
    tableSummary: string;
    sessionIds: string[];
    receipt: ReceiptDocumentInput;
  } | null>(null);
  const [serviceFeedback, setServiceFeedback] = useState<{
    tone: "success" | "alert" | "info";
    title: string;
    detail: string;
  } | null>(null);
  const [waitPlannerOpen, setWaitPlannerOpen] = useState(false);
  const [waitCourse, setWaitCourse] = useState<CourseKey>("main");
  const [waitMinutes, setWaitMinutes] = useState("10");
  const [extraIngredientsItemId, setExtraIngredientsItemId] = useState<string | null>(null);
  const [extraIngredientDraftIds, setExtraIngredientDraftIds] = useState<string[]>([]);
  const [sentItemNoteDrafts, setSentItemNoteDrafts] = useState<Record<string, string>>({});
  const sentItemNoteTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingSentItemNotesRef = useRef<
    Record<string, { tableId: string; itemId: string; note: string }>
  >({});

  const isWaiterView = currentUser?.role === "waiter";
  const selectedTable = state.tables.find((table) => table.id === selectedTableId) ?? null;
  const selectedSession = selectedTable
    ? getSessionForTable(state.sessions, selectedTable.id)
    : undefined;
  const extraIngredientsCatalog = state.extraIngredients ?? [];
  const serviceOrderMode = state.serviceOrderMode ?? "table";
  const usesSeatMode = serviceOrderMode === "seat";
  const visibleSeats = useMemo(
    () => (selectedTable ? getVisibleSeats(selectedTable.seats) : []),
    [selectedTable]
  );
  const selectedOrderTarget: OrderTarget =
    usesSeatMode && selectedSeatId ? { type: "seat", seatId: selectedSeatId } : tableOrderTarget;
  const activeCourse: CourseKey = isCourseStep(currentStep) ? currentStep : "drinks";
  const waiterMenuEntries = dashboard.filter(
    (entry) => entry.table.active || entry.table.plannedOnly || entry.table.id === selectedTableId
  );
  const waiterFloorplanEntries = waiterMenuEntries.filter(
    (entry) => entry.table.active && waiterFloorplanHotspots[entry.table.id]
  );
  const selectedDashboardEntry =
    dashboard.find((entry) => entry.table.id === selectedTableId) ?? null;
  const linkedTableGroup = selectedTableId ? getLinkedTableGroupForTable(state, selectedTableId) : undefined;
  const activeLinkedTableGroups = state.linkedTableGroups.filter((group) => group.active);
  const checkoutTableIds = selectedTableId ? getCheckoutTableIds(state, selectedTableId) : [];
  const checkoutSessions = checkoutTableIds
    .map((tableId) => ({
      table: state.tables.find((table) => table.id === tableId),
      session: getSessionForTable(state.sessions, tableId)
    }))
    .filter((entry): entry is { table: NonNullable<typeof entry.table>; session: OrderSession } =>
      Boolean(entry.table && entry.session)
    );
  const checkoutTableLabelsById = useMemo(
    () => Object.fromEntries(checkoutSessions.map(({ table }) => [table.id, table.name])),
    [checkoutSessions]
  );
  const extraIngredientsItem =
    extraIngredientsItemId && selectedSession
      ? selectedSession.items.find((item) => item.id === extraIngredientsItemId) ?? null
      : null;
  const extraIngredientsDialogOptions = useMemo(() => {
    const selectedIds = new Set(extraIngredientDraftIds);
    return extraIngredientsCatalog.filter(
      (ingredient) => ingredient.active || selectedIds.has(ingredient.id)
    );
  }, [extraIngredientDraftIds, extraIngredientsCatalog]);

  useEffect(() => {
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

  useEffect(() => {
    if (extraIngredientsItemId && !extraIngredientsItem) {
      setExtraIngredientsItemId(null);
      setExtraIngredientDraftIds([]);
    }
  }, [extraIngredientsItem, extraIngredientsItemId]);

  const canReviseSentItem = (item: OrderItem) => {
    if (isOrderItemCanceled(item)) return false;
    if (!item.sentAt) return true;
    if (!selectedSession) return false;
    if (currentUser?.role === "admin") return true;
    if (item.servedAt) return false;
    if (
      item.category !== "drinks" &&
      (item.preparedAt ||
        item.kitchenUnitStates?.some((unitState) => unitState.status !== "pending"))
    ) {
      return false;
    }

    return calculatePaidItemQuantity(selectedSession, item.id) === 0;
  };

  const currentProducts = useMemo(
    () => getOrderableProducts(state.products, activeCourse),
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
    !selectedSession ? null : resolveServiceCourseStatus(selectedSession, activeCourse);
  const waitableCourses = useMemo(() => {
    if (!selectedSession) return [];

    return kitchenWaitCourses
      .map((course) => {
        const itemCount = selectedSession.items
          .filter((item) => item.category === course && !item.sentAt)
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
      return selectedSession.items.filter(
        (item) => item.category === activeCourse && !isOrderItemCanceled(item)
      );
    }

    return selectedSession.items.filter(
      (item) =>
        isItemForTarget(item, selectedOrderTarget) &&
        item.category === activeCourse &&
        !isOrderItemCanceled(item)
    );
  }, [activeCourse, selectedOrderTarget, selectedSession, usesSeatMode]);
  const newEditableItems = useMemo(
    () => editableItems.filter((item) => !item.sentAt),
    [editableItems]
  );
  const sentEditableItems = useMemo(
    () => editableItems.filter((item) => item.sentAt && !isOrderItemCanceled(item)),
    [editableItems]
  );
  const revisableSentItemCount = sentEditableItems.filter((item) => canReviseSentItem(item)).length;
  const hasPendingKitchenItems =
    selectedSession?.items.some((item) => item.category !== "drinks" && !item.sentAt) ?? false;
  const hasPendingDrinkItems =
    selectedSession?.items.some((item) => item.category === "drinks" && !item.sentAt) ?? false;
  const hasPendingOrderItems = hasPendingKitchenItems || hasPendingDrinkItems;
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
  const sessionBillableTotal = calculateSessionBillableTotal(selectedSession, state.products);
  const sessionOpenTotal = calculateSessionOpenTotal(selectedSession, state.products);
  const checkoutBillableTotal = checkoutSessions.reduce(
    (sum, entry) => sum + calculateSessionBillableTotal(entry.session, state.products),
    0
  );
  const checkoutOpenTotal = checkoutSessions.reduce(
    (sum, entry) => sum + calculateSessionOpenTotal(entry.session, state.products),
    0
  );
  const checkoutOpenEntries = checkoutSessions.flatMap(({ table, session }) =>
    getOpenLineItems(session).map(({ item, openQuantity }) => ({
      table,
      session,
      item,
      openQuantity,
      unitTotal: Math.round(calculateItemTotal(item, state.products) / item.quantity)
    }))
  );
  const selectedPaymentLineItems = checkoutOpenEntries
    .map(({ item, openQuantity }) => ({
      itemId: item.id,
      quantity: Math.min(openQuantity, Math.max(0, selectedPaymentQuantities[item.id] ?? 0))
    }))
    .filter((lineItem) => lineItem.quantity > 0);
  const selectedPaymentTotal = checkoutOpenEntries.reduce((sum, entry) => {
    const quantity = Math.min(
      entry.openQuantity,
      Math.max(0, selectedPaymentQuantities[entry.item.id] ?? 0)
    );
    return sum + entry.unitTotal * quantity;
  }, 0);
  const selectedPaymentQuantityTotal = selectedPaymentLineItems.reduce(
    (sum, lineItem) => sum + lineItem.quantity,
    0
  );
  const checkoutOpenQuantityTotal = checkoutOpenEntries.reduce(
    (sum, entry) => sum + entry.openQuantity,
    0
  );
  const areAllCheckoutPositionsSelected =
    checkoutOpenEntries.length > 0 &&
    checkoutOpenEntries.every(
      ({ item, openQuantity }) =>
        Math.min(openQuantity, Math.max(0, selectedPaymentQuantities[item.id] ?? 0)) === openQuantity
    );
  const checkoutOpenGroups = checkoutSessions
    .map(({ table, session }) => {
      const entries = checkoutOpenEntries.filter((entry) => entry.table.id === table.id);
      return {
        table,
        session,
        entries,
        openTotal: calculateSessionOpenTotal(session, state.products)
      };
    })
    .filter((entry) => entry.entries.length > 0);
  const canPreviewFullReceipt = checkoutBillableTotal > 0;
  const canPreviewTableReceipt = sessionBillableTotal > 0;
  const canPreviewPartialReceipt = selectedPaymentLineItems.length > 0;
  const canReprintFullReceipt = checkoutSessions.some(({ session }) => Boolean(session.receipt.printedAt));
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
  const primaryServiceDeliveryNotification = serviceDeliveryNotifications[0] ?? null;
  const additionalServiceDeliveryCount = Math.max(0, serviceDeliveryNotifications.length - 1);
  const closedSessionHistory = useMemo(
    () =>
      buildClosedSessions(state)
        .map((session) => {
          const table =
            state.tables.find((entry) => entry.id === session.tableId) ??
            ({
              seats: [],
              name: session.tableId.replace("table-", "Tisch ")
            } as const);
          const closedByName =
            state.users.find((user) => user.id === session.waiterId)?.name ?? "Unbekannt";
          const totalAmount =
            session.payments.reduce((sum, payment) => sum + payment.amountCents, 0) ||
            calculateSessionBillableTotal(session, state.products);

          return {
            sessionId: session.id,
            tableName: table.name,
            closedAtLabel: formatHistoryDateTime(
              session.receipt.closedAt ?? session.receipt.reprintedAt ?? session.receipt.printedAt
            ),
            closedByName,
            guestCountLabel: `${calculateGuestCount(session)} ${
              calculateGuestCount(session) === 1 ? "Person" : "Personen"
            }`,
            totalLabel: euro(totalAmount),
            payments:
              session.payments.length > 0
                ? session.payments.map((payment) => ({
                    id: payment.id,
                    methodLabel: paymentMethodLabels[payment.method],
                    amountLabel: euro(payment.amountCents),
                    payerLabel: resolveHistoryPaymentTargets(session, table, payment),
                    label: payment.label
                  }))
                : [
                    {
                      id: `${session.id}-full`,
                      methodLabel: "Abschluss",
                      amountLabel: euro(totalAmount),
                      payerLabel: "Tisch",
                      label: "Gesamtbon"
                    }
                  ],
            closedAtSort: Date.parse(
              session.receipt.closedAt ?? session.receipt.reprintedAt ?? session.receipt.printedAt ?? "0"
            ) || 0
          };
        })
        .sort((left, right) => right.closedAtSort - left.closedAtSort),
    [state]
  );
  useEffect(() => {
    setServiceFeedback(null);
    setWaitPlannerOpen(false);
  }, [activeCourse, selectedSeatId, selectedTableId, serviceOrderMode]);

  useEffect(() => {
    if (!serviceFeedback) return;

    const timeoutId = window.setTimeout(() => {
      setServiceFeedback(null);
    }, serviceFeedbackTimeoutMs);

    return () => window.clearTimeout(timeoutId);
  }, [serviceFeedback]);

  useEffect(() => {
    setReceiptPreview(null);
    setSelectedPaymentQuantities({});
    setLinkTableSelection(selectedTableId ? [selectedTableId] : []);
  }, [selectedTableId]);

  useEffect(() => {
    if (!isOrderWizardOpen && !isTableActionDialogOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => {
      orderWizardModalRef.current?.focus();
    });

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOrderWizardOpen, isTableActionDialogOpen]);

  useEffect(
    () => () => {
      Object.values(sentItemNoteTimersRef.current).forEach((timerId) => clearTimeout(timerId));
      sentItemNoteTimersRef.current = {};
    },
    []
  );

  const getSentItemNoteDraftKey = (tableId: string, itemId: string) => `${tableId}::${itemId}`;

  const clearSentItemNoteTimer = (draftKey: string) => {
    const timerId = sentItemNoteTimersRef.current[draftKey];
    if (!timerId) return;

    clearTimeout(timerId);
    delete sentItemNoteTimersRef.current[draftKey];
  };

  const commitSentItemNoteDraft = (tableId: string, itemId: string, note: string) => {
    const draftKey = getSentItemNoteDraftKey(tableId, itemId);
    clearSentItemNoteTimer(draftKey);
    delete pendingSentItemNotesRef.current[draftKey];
    setSentItemNoteDrafts((current) => {
      const next = { ...current };
      delete next[draftKey];
      return next;
    });
    actions.updateItem(tableId, itemId, { note });
  };

  const flushPendingSentItemNotes = () => {
    Object.values(pendingSentItemNotesRef.current).forEach(({ tableId, itemId, note }) => {
      commitSentItemNoteDraft(tableId, itemId, note);
    });
  };

  const scheduleSentItemNoteDraft = (tableId: string, itemId: string, note: string) => {
    const draftKey = getSentItemNoteDraftKey(tableId, itemId);
    pendingSentItemNotesRef.current[draftKey] = { tableId, itemId, note };
    setSentItemNoteDrafts((current) => ({ ...current, [draftKey]: note }));
    clearSentItemNoteTimer(draftKey);
    sentItemNoteTimersRef.current[draftKey] = setTimeout(() => {
      commitSentItemNoteDraft(tableId, itemId, note);
    }, 15000);
  };

  const getCheckoutOpenTotalForTable = (tableId: string) =>
    getCheckoutTableIds(state, tableId).reduce((sum, checkoutTableId) => {
      const session = getSessionForTable(state.sessions, checkoutTableId);
      return sum + calculateSessionOpenTotal(session, state.products);
    }, 0);

  const openOrderWizard = (step: WaiterOrderStep) => {
    setCurrentStep(step);
    setIsTableActionDialogOpen(false);
    setIsOrderWizardOpen(true);
  };

  const openTableActionForSelection = (tableId: string) => {
    const openTotal = getCheckoutOpenTotalForTable(tableId);
    if (openTotal > 0) {
      setCurrentStep("table");
      setIsOrderWizardOpen(false);
      setIsTableActionDialogOpen(true);
      return;
    }

    openOrderWizard("drinks");
  };

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

    if (isWaiterView) {
      openTableActionForSelection(tableId);
      return;
    }

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

    if (isWaiterView) {
      openTableActionForSelection(tableId);
      return;
    }

    if (!scrollToService) return;

    scrollToServiceSection();
  };

  const handleSendCourseToKitchen = () => {
    if (!selectedTable) return;

    const result = actions.sendCourseToKitchen(selectedTable.id, activeCourse);

    if (!result.ok) {
      setServiceFeedback({
        tone: "alert",
        title: "Noch nicht gesendet",
        detail:
          result.message ??
          (activeCourse === "drinks"
            ? "Die Getränke konnten nicht an die Bar gesendet werden."
            : "Die Positionen konnten nicht an die Küche gesendet werden.")
      });
      return;
    }

    const syncHint =
      activeCourse === "drinks"
        ? sharedSync.status === "online"
          ? "Der Bon ist für die Bar und andere Geräte jetzt im gemeinsamen Stand."
          : "Der Bon wurde lokal gespeichert. Für mehrere Geräte muss der gemeinsame Sync erreichbar sein."
        : sharedSync.status === "online"
          ? "Der Bon ist für Küche und andere Geräte jetzt im gemeinsamen Stand."
          : "Der Bon wurde lokal gespeichert. Für mehrere Geräte muss der gemeinsame Sync erreichbar sein.";

    setServiceFeedback({
      tone: "success",
      title:
        activeCourse === "drinks" ? "Getränke an Bar gesendet" : `${courseLabels[activeCourse]} gesendet`,
      detail: `${
        result.message ??
        (activeCourse === "drinks"
          ? "Die Getränke wurden erfolgreich an die Bar gesendet."
          : "Die Positionen wurden erfolgreich an die Küche gesendet.")
      } ${syncHint}`
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
      waitableCourses.some((entry) => entry.course === activeCourse)
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

  const buildReceiptPreviewState = (
    receiptMode: ReceiptDocumentMode,
    printMode: "receipt" | "reprint",
    selectedLineItems?: PaymentLineItem[]
  ) => {
    if (!selectedTable || !selectedSession) return null;

    const sessions =
      receiptMode === "table" ? [selectedSession] : checkoutSessions.map(({ session }) => session);
    if (sessions.length === 0) return null;

    const openedAt = new Date().toISOString();
    const receipt = buildReceiptDocumentFromSessions({
      sessions,
      products: state.products,
      scope: receiptMode,
      selectedLineItems: receiptMode === "partial" ? selectedLineItems : undefined,
      tableLabelsById: checkoutTableLabelsById,
      openedAt
    });
    if (receipt.sections.length === 0) return null;

    const tableSummary =
      receiptMode === "table"
        ? selectedTable.name
        : linkedTableGroup?.label ??
          [...new Set(sessions.map((session) => checkoutTableLabelsById[session.tableId] ?? session.tableId))]
            .join(", ");
    const title =
      printMode === "reprint"
        ? "Letzten Gesamtbon prüfen"
        : receiptMode === "full"
          ? "Gesamtbon prüfen"
          : receiptMode === "table"
            ? "Tisch-Bon prüfen"
            : "Teil-Bon prüfen";

    return {
      printMode,
      receiptMode,
      openedAt,
      title,
      tableSummary,
      sessionIds: sessions.map((session) => session.id),
      receipt
    };
  };

  const openReceiptPreview = (
    receiptMode: ReceiptDocumentMode,
    printMode: "receipt" | "reprint",
    selectedLineItems?: PaymentLineItem[]
  ) => {
    const nextPreview = buildReceiptPreviewState(receiptMode, printMode, selectedLineItems);
    if (!nextPreview) return;

    setReceiptPreview(nextPreview);
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

  const handleReceiptPrint = async () => {
    if (!selectedTable || !selectedSession || !receiptPreview) return;
    const tableName = receiptPreview.tableSummary;

    if (receiptPreview.printMode === "reprint") {
      actions.reprintReceipt(selectedTable.id, receiptPreview.sessionIds);
    } else {
      actions.printReceipt(selectedTable.id, receiptPreview.sessionIds);
    }

    const result = await createPrintJob({
      type: receiptPreview.printMode,
      receipt: receiptPreview.receipt,
      tableId: selectedTable.id,
      tableLabel: tableName
    });

    setServiceFeedback({
      tone: result.ok ? "success" : "alert",
      title:
        result.ok
          ? receiptPreview.printMode === "reprint"
            ? "Reprint gesendet"
            : "Bon gesendet"
          : receiptPreview.printMode === "reprint"
            ? "Reprint nicht gesendet"
            : "Bon nicht gesendet",
      detail: result.ok
        ? `${tableName} wurde an den Netzwerkdrucker gesendet.`
        : result.message ?? "Der Bon konnte nicht an den Netzwerkdrucker gesendet werden."
    });

    if (result.ok) {
      setReceiptPreview(null);
    }
  };

  const handleHistoryReceiptPrint = async (sessionId: string) => {
    const session = state.sessions.find((entry) => entry.id === sessionId);
    if (!session) return;

    setReceiptPreview(null);
    const openedAt = new Date().toISOString();
    const tableName =
      state.tables.find((table) => table.id === session.tableId)?.name ??
      session.tableId.replace("table-", "Tisch ");
    const receipt = buildReceiptDocumentFromSessions({
      sessions: [session],
      products: state.products,
      scope: "table",
      tableLabelsById: { [session.tableId]: tableName },
      openedAt
    });
    actions.reprintReceipt(session.tableId, [session.id]);

    const result = await createPrintJob({
      type: "reprint",
      receipt,
      tableId: session.tableId,
      tableLabel: tableName
    });

    setServiceFeedback({
      tone: result.ok ? "success" : "alert",
      title: result.ok ? "Reprint gesendet" : "Reprint nicht gesendet",
      detail: result.ok
        ? `${tableName} wurde erneut an den Netzwerkdrucker gesendet.`
        : result.message ?? "Der Reprint konnte nicht an den Netzwerkdrucker gesendet werden."
    });
  };

  const setPaymentQuantity = (itemId: string, quantity: number, maxQuantity: number) => {
    setSelectedPaymentQuantities((current) => ({
      ...current,
      [itemId]: Math.min(maxQuantity, Math.max(0, Math.floor(quantity)))
    }));
  };

  const togglePaymentItem = (itemId: string, checked: boolean, maxQuantity: number) => {
    setPaymentQuantity(itemId, checked ? maxQuantity : 0, maxQuantity);
  };

  const selectAllPaymentItems = () => {
    if (checkoutOpenEntries.length === 0) return;

    setSelectedPaymentQuantities((current) => {
      const next = { ...current };
      checkoutOpenEntries.forEach(({ item, openQuantity }) => {
        next[item.id] = openQuantity;
      });
      return next;
    });
  };

  const handleRecordPartialPayment = () => {
    if (!selectedTable) return;

    const result = actions.recordPartialPayment(
      checkoutTableIds,
      selectedPaymentLineItems,
      paymentMethod,
      selectedPaymentTotal === checkoutOpenTotal ? "Restzahlung" : "Teilzahlung"
    );

    setServiceFeedback({
      tone: result.ok ? "success" : "alert",
      title: result.ok ? "Zahlung verbucht" : "Zahlung nicht verbucht",
      detail: result.message ?? (result.ok ? "Die ausgewählten Positionen sind bezahlt." : "Bitte Auswahl prüfen.")
    });

    if (result.ok) {
      setSelectedPaymentQuantities({});
      setReceiptPreview(null);
    }
  };

  const handleRecordInvoiceCancellation = () => {
    if (!selectedTable || selectedPaymentLineItems.length === 0) return;

    const selectedQuantity = selectedPaymentLineItems.reduce(
      (sum, lineItem) => sum + lineItem.quantity,
      0
    );
    const confirmed = window.confirm(
      `${selectedQuantity} ${
        selectedQuantity === 1 ? "Position" : "Positionen"
      } im Wert von ${euro(selectedPaymentTotal)} wirklich stornieren?`
    );
    if (!confirmed) return;

    const result = actions.recordInvoiceCancellation(
      checkoutTableIds,
      selectedPaymentLineItems,
      "Rechnungsstorno"
    );

    setServiceFeedback({
      tone: result.ok ? "success" : "alert",
      title: result.ok ? "Storno gespeichert" : "Storno nicht gespeichert",
      detail:
        result.message ??
        (result.ok
          ? "Die ausgewählten Positionen wurden storniert."
          : "Bitte Auswahl prüfen.")
    });

    if (result.ok) {
      setSelectedPaymentQuantities({});
      setReceiptPreview(null);
    }
  };

  const handleClosePaidOrder = () => {
    if (!selectedTable) return;

    const result = actions.closePaidOrder(selectedTable.id);
    setServiceFeedback({
      tone: result.ok ? "success" : "alert",
      title: result.ok ? "Tisch geschlossen" : "Noch nicht geschlossen",
      detail:
        result.message ??
        (result.ok
          ? "Es sind keine offenen Positionen mehr vorhanden und der Tisch ist abgeschlossen."
          : "Es sind noch Positionen offen.")
    });
  };

  const closeOrderWizard = () => {
    flushPendingSentItemNotes();
    setIsOrderWizardOpen(false);
    setIsTableActionDialogOpen(false);
    setCurrentStep("table");
  };

  const finishOrderWizard = () => {
    if (!selectedTable || !selectedSession) {
      closeOrderWizard();
      return;
    }

    if (!hasPendingOrderItems) {
      closeOrderWizard();
      return;
    }

    const sendCourse: CourseKey = hasPendingKitchenItems
      ? isCourseStep(currentStep) && currentStep !== "drinks"
        ? currentStep
        : "main"
      : "drinks";
    const result = actions.sendCourseToKitchen(selectedTable.id, sendCourse);

    if (!result.ok) {
      setServiceFeedback({
        tone: "alert",
        title: "Bestellung nicht abgeschlossen",
        detail: result.message ?? "Die neuen Positionen konnten noch nicht gesendet werden."
      });
      return;
    }

    closeOrderWizard();
  };

  const goBack = () => {
    if (currentStep === "table") {
      closeOrderWizard();
      return;
    }

    if (currentStep === "checkout") {
      setIsOrderWizardOpen(false);
      if (selectedTableId && getCheckoutOpenTotalForTable(selectedTableId) > 0) {
        setIsTableActionDialogOpen(true);
      } else {
        setCurrentStep("table");
      }
      return;
    }

    const currentIndex = orderStepSequence.indexOf(currentStep);
    if (currentIndex > 0) {
      const previousStep = orderStepSequence[currentIndex - 1];
      if (previousStep) setCurrentStep(previousStep);
      return;
    }

    setIsOrderWizardOpen(false);
    if (selectedTableId && getCheckoutOpenTotalForTable(selectedTableId) > 0) {
      setCurrentStep("table");
      setIsTableActionDialogOpen(true);
    } else {
      closeOrderWizard();
    }
  };

  const goNext = () => {
    if (currentStep === "table") {
      if (!selectedTable) return;
      setCurrentStep("drinks");
      return;
    }

    if (isCourseStep(currentStep)) {
      const currentIndex = orderStepSequence.indexOf(currentStep);
      const nextStep = orderStepSequence[currentIndex + 1];
      if (nextStep) {
        setCurrentStep(nextStep);
        return;
      }
      closeOrderWizard();
      return;
    }

    handleClosePaidOrder();
  };

  const selectWizardStep = (step: string) => {
    if (step === "Tisch") closeOrderWizard();
    const nextStep = waiterStepByLabel[step as WizardStepLabel];
    if (nextStep) setCurrentStep(nextStep);
  };

  const currentWizardStepLabel =
    currentStep === "table"
      ? "Tisch"
      : waiterStepLabels[currentStep];
  const orderWizardCurrentStepLabel =
    currentStep === "table" ? waiterStepLabels.drinks : waiterStepLabels[currentStep];
  const canGoNext =
    currentStep === "table"
      ? Boolean(selectedTable)
      : currentStep === "checkout"
        ? checkoutOpenTotal === 0 && checkoutSessions.length > 0
        : true;
  const nextButtonLabel =
    currentStep === "checkout" ? "Abschließen" : "Weiter";
const sendCourseActionLabel =
  activeCourse === "drinks"
    ? sentEditableItems.length > 0
      ? "Neue Getränke an Bar senden"
      : "Getränke an Bar senden"
    : sentEditableItems.length > 0
      ? "Nachbestellung an Küche senden"
      : "Alles an Küche senden";

  const toggleLinkTableSelection = (tableId: string) => {
    setLinkTableSelection((current) =>
      current.includes(tableId)
        ? current.filter((entry) => entry !== tableId)
        : [...current, tableId]
    );
  };

  const handleLinkTables = () => {
    const result = actions.linkTables([...new Set(linkTableSelection)]);

    setServiceFeedback({
      tone: result.ok ? "success" : "alert",
      title: result.ok ? "Tische gekoppelt" : "Kopplung nicht möglich",
      detail: result.message ?? (result.ok ? "Die Tische erscheinen gemeinsam in der Abrechnung." : "Bitte mindestens zwei Tische wählen.")
    });

    return result.ok;
  };

  const handleUnlinkTableGroup = (groupId: string) => {
    const result = actions.unlinkTables(groupId);
    setServiceFeedback({
      tone: result.ok ? "success" : "alert",
      title: result.ok ? "Kopplung gelöst" : "Kopplung nicht gelöst",
      detail: result.message ?? (result.ok ? "Die Tische werden wieder einzeln abgerechnet." : "Bitte Kopplung erneut prüfen.")
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

  const handleMarkAllNotificationsRead = () => {
    actions.markNotificationsRead(unreadNotifications.map((notification) => notification.id), "local");
  };

  const handleNotificationDismiss = (notificationId: string) => {
    actions.markNotificationRead(notificationId, "local");
  };

  const handleItemRemoval = (item: OrderItem) => {
    if (!selectedTable) return;

    if (item.sentAt) {
      const confirmed = window.confirm(
        `${resolveProductName(state.products, item.productId)} wirklich stornieren?`
      );
      if (!confirmed) return;
    }

    actions.removeItem(selectedTable.id, item.id);
  };

  const handleOpenExtraIngredientsDialog = (item: OrderItem) => {
    setExtraIngredientsItemId(item.id);
    setExtraIngredientDraftIds(
      item.modifiers.find((selection) => selection.groupId === EXTRA_INGREDIENTS_MODIFIER_GROUP_ID)
        ?.optionIds ?? []
    );
  };

  const handleCloseExtraIngredientsDialog = () => {
    setExtraIngredientsItemId(null);
    setExtraIngredientDraftIds([]);
  };

  const handleToggleExtraIngredientDraft = (ingredientId: string, checked: boolean) => {
    setExtraIngredientDraftIds((current) => {
      if (checked) {
        return current.includes(ingredientId) ? current : [...current, ingredientId];
      }

      return current.filter((currentIngredientId) => currentIngredientId !== ingredientId);
    });
  };

  const handleSaveExtraIngredients = () => {
    if (!selectedTable || !extraIngredientsItem) return;

    actions.setItemExtraIngredients(selectedTable.id, extraIngredientsItem.id, extraIngredientDraftIds);
    handleCloseExtraIngredientsDialog();
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
      const isSent = Boolean(item.sentAt);
      const canEditItem = canReviseSentItem(item);
      const isLocked = !canEditItem;
      const product = getProductById(state.products, item.productId);
      const supportsExtraIngredients = product?.supportsExtraIngredients === true;
      const extraIngredientLabels = resolveExtraIngredientLabels(
        item,
        product,
        extraIngredientsCatalog
      );
      const itemTargetValue = item.target.type === "table" ? "table" : item.target.seatId;
      const sentItemNoteDraftKey = getSentItemNoteDraftKey(selectedTable.id, item.id);
      const noteValue = isSent
        ? sentItemNoteDrafts[sentItemNoteDraftKey] ?? item.note ?? ""
        : item.note ?? "";
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
        <article key={item.id} className={`kiju-order-item-card${isSent ? " is-sent" : ""}`}>
            <div className="kiju-order-item-card__main">
              <div className="kiju-order-item-card__title">
                <strong>{resolveProductName(state.products, item.productId)}</strong>
                <small>{courseLabels[item.category]}</small>
                {isSent ? (
                <StatusPill
                  label={canEditItem ? "Korrektur möglich" : "Nicht mehr änderbar"}
                  tone={canEditItem ? "amber" : "slate"}
                />
              ) : null}
            </div>

            <label className="kiju-inline-field kiju-inline-field--compact">
              <span>Ziel</span>
              {usesSeatMode ? (
                <select
                  name={`item-target-${item.id}`}
                  value={itemTargetValue}
                  disabled={isLocked}
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
                  disabled={isLocked || item.quantity <= 1}
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
                  disabled={isLocked}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            <div className="kiju-order-item-card__actions">
              {supportsExtraIngredients ? (
                <button
                  type="button"
                  className="kiju-button kiju-button--secondary"
                  onClick={() => handleOpenExtraIngredientsDialog(item)}
                  disabled={isLocked}
                >
                  <Plus size={14} />
                  Extra Zutat
                </button>
              ) : null}
              <button
                type="button"
                className="kiju-button kiju-button--danger kiju-order-item-card__delete"
                onClick={() => handleItemRemoval(item)}
                disabled={isLocked}
              >
                <Trash2 size={14} />
                {isSent ? "Storno" : "Löschen"}
              </button>
            </div>
          </div>

          {extraIngredientLabels.length > 0 ? (
            <div className="kiju-order-item-card__detail">
              <span>Extra Zutaten</span>
              <strong>{extraIngredientLabels.join(", ")}</strong>
            </div>
          ) : null}

          <label className="kiju-inline-field kiju-inline-field--note">
            <span>Notiz</span>
            <input
              name={`item-note-${item.id}`}
              value={noteValue}
              disabled={isLocked}
              onChange={(event) => {
                if (isSent) {
                  scheduleSentItemNoteDraft(selectedTable.id, item.id, event.target.value);
                  return;
                }

                actions.updateItem(selectedTable.id, item.id, { note: event.target.value });
              }}
              onBlur={() => {
                const pendingDraft = pendingSentItemNotesRef.current[sentItemNoteDraftKey];
                if (pendingDraft) {
                  commitSentItemNoteDraft(pendingDraft.tableId, pendingDraft.itemId, pendingDraft.note);
                }
              }}
              placeholder="Zum Beispiel ohne Zwiebeln"
            />
          </label>
        </article>
      );
    });
  };

  const renderActiveCourseItems = (emptyMessage: string) => {
    if (newEditableItems.length === 0 && sentEditableItems.length === 0) {
      return renderEditableItems([], emptyMessage);
    }

    return (
      <div className="kiju-order-editor__groups">
        {newEditableItems.length > 0 ? (
          <section className="kiju-order-editor__group">
            <div className="kiju-order-editor__group-title">
              <strong>Neu / noch nicht gesendet</strong>
              <span>{newEditableItems.length} Positionen</span>
            </div>
            {renderEditableItems(newEditableItems, emptyMessage)}
          </section>
        ) : null}

        {sentEditableItems.length > 0 ? (
          <section className="kiju-order-editor__group">
            <div className="kiju-order-editor__group-title">
              <strong>Bereits gesendet</strong>
              <span>
                {revisableSentItemCount > 0
                  ? "Korrektur oder Storno möglich"
                  : "Nicht mehr änderbar"}
              </span>
            </div>
            {renderEditableItems(sentEditableItems, emptyMessage)}
          </section>
        ) : null}
      </div>
    );
  };

  const receiptPreviewDocument = receiptPreview
    ? buildReceiptPrintDocument(receiptPreview.receipt)
    : null;

  const renderCheckoutOpenEntries = () => {
    if (checkoutOpenGroups.length === 0) {
      return (
        <div className="kiju-inline-panel">
          <span>Alle Positionen sind bezahlt oder storniert.</span>
        </div>
      );
    }

    return (
      <>
        <div className="kiju-checkout-selection-toolbar">
          <div>
            <strong>Positionen auswählen</strong>
            <span>
              {selectedPaymentQuantityTotal} von {checkoutOpenQuantityTotal} offenen Positionen ausgewählt
            </span>
          </div>
          <button
            type="button"
            className="kiju-button kiju-button--secondary"
            onClick={selectAllPaymentItems}
            disabled={areAllCheckoutPositionsSelected}
          >
            <CheckCircle2 size={18} />
            {areAllCheckoutPositionsSelected ? "Alles ausgewählt" : "Alle auswählen"}
          </button>
        </div>

        {checkoutOpenGroups.map(({ table, entries, openTotal }) => (
          <section key={table.id} className="kiju-checkout-table-group">
            <div className="kiju-checkout-table-group__header">
              <div>
                <strong>{table.name}</strong>
                <small>{entries.length} offene Einträge</small>
              </div>
              <strong>{euro(openTotal)}</strong>
            </div>

            <div className="kiju-review-list kiju-wizard-payment-list">
              {entries.map(({ item, openQuantity, unitTotal }) => {
                const selectedQuantity = selectedPaymentQuantities[item.id] ?? 0;
                const modifierLabels = resolveItemModifierLabels(item, state.products);

                return (
                  <article key={`${table.id}-${item.id}`} className="kiju-payment-line">
                    <label>
                      <input
                        name={`checkout-item-${item.id}`}
                        type="checkbox"
                        checked={selectedQuantity > 0}
                        onChange={(event) =>
                          togglePaymentItem(item.id, event.target.checked, openQuantity)
                        }
                      />
                      <span>
                        <strong>{resolveProductName(state.products, item.productId)}</strong>
                        <small>
                          {table.name} · {courseLabels[item.category]} · offen {openQuantity}
                        </small>
                        {modifierLabels.length > 0 || item.note ? (
                          <small>
                            {[...modifierLabels, ...(item.note ? [`Hinweis: ${item.note}`] : [])].join(
                              " · "
                            )}
                          </small>
                        ) : null}
                      </span>
                    </label>
                    <input
                      name={`payment-quantity-${item.id}`}
                      type="number"
                      min={0}
                      max={openQuantity}
                      value={selectedQuantity}
                      aria-label="Anzahl für Zahlung"
                      onChange={(event) =>
                        setPaymentQuantity(item.id, Number(event.target.value), openQuantity)
                      }
                    />
                    <strong>{euro(unitTotal * selectedQuantity)}</strong>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </>
    );
  };

  const renderReceiptPreviewPanel = () => {
    if (!receiptPreview || !receiptPreviewDocument) return null;

    const receiptModeLabel =
      receiptPreview.receiptMode === "full"
        ? "Gesamtbon"
        : receiptPreview.receiptMode === "table"
          ? "Tisch-Bon"
          : "Teil-Bon";

    return (
      <section className="kiju-receipt-preview-panel" aria-label="Bon-Vorschau">
        <div className="kiju-receipt-preview-panel__header">
          <div>
            <span className="kiju-eyebrow">Bon-Vorschau</span>
            <strong>{receiptPreview.title}</strong>
            <small>
              {receiptPreview.tableSummary} · {euro(receiptPreview.receipt.gesamt)}
            </small>
          </div>
          <div className="kiju-receipt-preview-panel__meta">
            <StatusPill label={receiptModeLabel} tone="navy" />
            <StatusPill
              label={receiptPreview.printMode === "reprint" ? "Reprint" : "Erstdruck"}
              tone="slate"
            />
          </div>
        </div>

        <ThermalReceiptPaper document={receiptPreviewDocument} />

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
    );
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
                <Link href={routeConfig.bar} className="kiju-button kiju-button--secondary">
                  <Bell size={18} />
                  Zur Bar
                </Link>
                <Link href={routeConfig.admin} className="kiju-button kiju-button--secondary">
                  <Receipt size={18} />
                  Admin
                </Link>
              </>
            ) : null}
            <ServiceTopbarMenu
              unreadNotifications={unreadNotifications}
              onNotificationAction={handleNotificationAction}
              onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
              historyEntries={closedSessionHistory}
              onHistoryPrint={handleHistoryReceiptPrint}
            />
          </div>
        </header>

        {serviceFeedback ? (
          <div
            className={`kiju-service-feedback-toast kiju-inline-panel kiju-inline-panel--feedback is-${serviceFeedback.tone}`}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <strong>{serviceFeedback.title}</strong>
            <span>{serviceFeedback.detail}</span>
          </div>
        ) : null}

        {isWaiterView && primaryServiceDeliveryNotification && !isOrderWizardOpen ? (
          <aside className="kiju-service-drink-popup-stack" role="alert" aria-live="polite">
            <article key={primaryServiceDeliveryNotification.id} className="kiju-service-drink-popup">
              <button
                type="button"
                className="kiju-service-drink-popup__dismiss"
                aria-label="Quick-Benachrichtigung schließen"
                onClick={() => handleNotificationDismiss(primaryServiceDeliveryNotification.id)}
              >
                <X size={16} />
              </button>
              <div className="kiju-service-drink-popup__content">
                <span className="kiju-service-drink-popup__eyebrow">
                  {primaryServiceDeliveryNotification.kind === "service-drinks"
                    ? "Getränke-Service"
                    : primaryServiceDeliveryNotification.kind === "service-course-ready"
                      ? "Küchenpass"
                    : primaryServiceDeliveryNotification.kind === "service-drinks-accepted" ||
                        primaryServiceDeliveryNotification.kind === "service-course-ready-accepted"
                      ? "Übernommen"
                      : "Serviceauftrag"}
                </span>
                <strong>{primaryServiceDeliveryNotification.title}</strong>
                <span>{primaryServiceDeliveryNotification.body}</span>
              </div>
              <button
                type="button"
                className="kiju-button kiju-button--primary"
                onClick={() => handleNotificationAction(primaryServiceDeliveryNotification)}
              >
                <CheckCircle2 size={18} />
                {primaryServiceDeliveryNotification.kind === "service-drinks" ||
                primaryServiceDeliveryNotification.kind === "service-course-ready"
                  ? "Annehmen"
                  : "Erledigt"}
              </button>
            </article>
            {additionalServiceDeliveryCount > 0 ? (
              <details className="kiju-service-drink-popup-more">
                <summary>+{additionalServiceDeliveryCount} weitere</summary>
                <div>
                  {serviceDeliveryNotifications.slice(1).map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => handleNotificationAction(notification)}
                    >
                      <strong>{notification.title}</strong>
                      <span>{notification.body}</span>
                    </button>
                  ))}
                </div>
              </details>
            ) : null}
          </aside>
        ) : null}

        {isWaiterView && currentStep === "table" ? (
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

        {isWaiterView && !isOrderWizardOpen ? (
          <button
            type="button"
            className="kiju-button kiju-button--secondary kiju-mobile-floorplan-toggle"
            onClick={toggleMobileFloorplan}
          >
            <Map size={18} />
            {showMobileFloorplan ? "Raumplan ausblenden" : "Raumplan anzeigen"}
          </button>
        ) : null}

        {isWaiterView && currentStep === "table" ? (
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
        ) : !isWaiterView ? (
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
        ) : null}

        {isWaiterView && currentStep === "table" ? (
          <section className="kiju-table-overview-panel" aria-label="Tischübersicht">
            <SectionCard
              title="Tischübersicht"
              eyebrow="Alle Service-Tische"
              action={
                <StatusPill
                  label={`${waiterMenuEntries.length} Tische`}
                  tone="navy"
                />
              }
            >
              <div className="kiju-table-menu kiju-table-menu--compact">
                {waiterMenuEntries.map((entry) => (
                  <button
                    key={entry.table.id}
                    type="button"
                    className={`kiju-table-menu__button ${
                      entry.table.id === selectedTableId ? "is-selected" : ""
                    }`}
                    onClick={() => selectTable(entry.table.id)}
                  >
                    <strong>{entry.table.name}</strong>
                    <small>
                      {statusLabel[entry.status] ?? "Status"} · {euro(entry.total)}
                    </small>
                  </button>
                ))}
              </div>
              <div className="kiju-step-actions">
                <button
                  type="button"
                  className="kiju-button kiju-button--secondary"
                  onClick={() => setIsLinkTablesOpen((current) => !current)}
                  aria-expanded={isLinkTablesOpen}
                  aria-controls="kiju-link-tables-panel"
                >
                  <Split size={18} />
                  Tische koppeln
                </button>
              </div>
              {isLinkTablesOpen ? (
                <div
                  id="kiju-link-tables-panel"
                  className="kiju-link-tables-panel"
                  aria-label="Tische koppeln"
                >
                  <div className="kiju-link-tables-panel__header">
                    <div>
                      <strong>Tische koppeln</strong>
                      <span className="kiju-link-tables-panel__hint">
                        Wähle mindestens zwei Tische für eine gemeinsame Abrechnung.
                      </span>
                    </div>
                    <StatusPill
                      label={`${linkTableSelection.length} ausgewählt`}
                      tone={linkTableSelection.length >= 2 ? "navy" : "slate"}
                    />
                  </div>
                  <div className="kiju-table-menu kiju-table-menu--compact">
                    {waiterMenuEntries.map((entry) => (
                      <button
                        key={entry.table.id}
                        type="button"
                        className={`kiju-table-menu__button ${
                          linkTableSelection.includes(entry.table.id) ? "is-selected" : ""
                        }`}
                        onClick={() => toggleLinkTableSelection(entry.table.id)}
                      >
                        <strong>{entry.table.name}</strong>
                        <small>
                          {statusLabel[entry.status] ?? "Status"} · {euro(entry.total)}
                        </small>
                      </button>
                    ))}
                  </div>
                  <div className="kiju-step-actions">
                    <button
                      type="button"
                      className="kiju-button kiju-button--primary"
                      onClick={handleLinkTables}
                      disabled={linkTableSelection.length < 2}
                    >
                      <Split size={18} />
                      Tische koppeln
                    </button>
                    <button
                      type="button"
                      className="kiju-button kiju-button--secondary"
                      onClick={() => setLinkTableSelection(selectedTableId ? [selectedTableId] : [])}
                      disabled={linkTableSelection.length === 0}
                    >
                      Auswahl zurücksetzen
                    </button>
                  </div>
                  {activeLinkedTableGroups.length > 0 ? (
                    <div className="kiju-linked-table-list">
                      {activeLinkedTableGroups.map((group) => (
                        <article key={group.id} className="kiju-inline-panel">
                          <strong>{group.label}</strong>
                          <span>
                            {group.tableIds
                              .map((tableId) => state.tables.find((table) => table.id === tableId)?.name ?? tableId)
                              .join(" · ")}
                          </span>
                          <button
                            type="button"
                            className="kiju-button kiju-button--secondary"
                            onClick={() => handleUnlinkTableGroup(group.id)}
                          >
                            Kopplung lösen
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </SectionCard>
          </section>
        ) : null}

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

          {isWaiterView && isTableActionDialogOpen && selectedTable ? (
          <section
            className="kiju-service-section kiju-order-wizard-overlay kiju-table-action-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="kiju-table-action-title"
          >
            <div className="kiju-table-action-dialog" tabIndex={-1}>
              <div>
                <span className="kiju-eyebrow">Tisch ausgewählt</span>
                <h2 id="kiju-table-action-title">{selectedTable.name}</h2>
                <p>
                  {linkedTableGroup
                    ? `Gekoppelt: ${linkedTableGroup.label}`
                    : "Was möchtest du als Nächstes machen?"}
                </p>
              </div>
              <div className="kiju-table-action-summary">
                <div>
                  <span>Offen</span>
                  <strong>{euro(checkoutOpenTotal)}</strong>
                </div>
                <div>
                  <span>Artikel</span>
                  <strong>{sessionItemCount}</strong>
                </div>
              </div>
              <div className="kiju-table-action-grid">
                <button
                  type="button"
                  className="kiju-table-action-choice"
                  onClick={() => openOrderWizard("drinks")}
                >
                  <ChefHat size={24} />
                  <strong>Bestellen</strong>
                  <span>Weitere Getränke und Speisen aufnehmen.</span>
                </button>
                <button
                  type="button"
                  className="kiju-table-action-choice"
                  onClick={() => openOrderWizard("checkout")}
                  disabled={checkoutSessions.length === 0}
                >
                  <Receipt size={24} />
                  <strong>Abrechnen</strong>
                  <span>Offene Positionen auswählen, bezahlen oder stornieren.</span>
                </button>
              </div>
              <button
                type="button"
                className="kiju-button kiju-button--secondary"
                onClick={closeOrderWizard}
              >
                Zurück zum Raumplan
              </button>
            </div>
          </section>
          ) : null}

          {isWaiterView && isOrderWizardOpen && selectedTable ? (
          <section
            ref={serviceSectionRef}
            className="kiju-service-section kiju-order-wizard-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="kiju-order-wizard-title"
          >
            <div
              ref={orderWizardModalRef}
              className="kiju-order-wizard-modal"
              tabIndex={-1}
            >
              <header className="kiju-order-wizard-header">
                <div className="kiju-order-wizard-header__title">
                  <span className="kiju-eyebrow">Kellner-Wizard</span>
                  <h2 id="kiju-order-wizard-title">Service für {selectedTable.name}</h2>
                  <p>
                    {linkedTableGroup
                      ? `Gemeinsame Abrechnung: ${linkedTableGroup.label}`
                      : "Bestellung, Küche und Abrechnung für den aktiven Tisch."}
                  </p>
                </div>
                <div className="kiju-order-wizard-header__meta" aria-label="Aktueller Service-Stand">
                  <div className="kiju-order-wizard-stat">
                    <span>Status</span>
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
                  </div>
                  <div className="kiju-order-wizard-stat">
                    <span>Artikel</span>
                    <strong>{sessionItemCount}</strong>
                  </div>
                  <div className="kiju-order-wizard-stat">
                    <span>Summe</span>
                    <strong>{euro(sessionTotal)}</strong>
                  </div>
                  <div className="kiju-order-wizard-stat">
                    <span>Sync</span>
                    <StatusPill label={syncStatusLabel} tone={syncStatusTone} />
                  </div>
                  <button
                    type="button"
                    className="kiju-button kiju-button--secondary"
                    onClick={closeOrderWizard}
                  >
                    <Map size={18} />
                    Tisch wechseln
                  </button>
                </div>
              </header>

              {primaryServiceDeliveryNotification ? (
                <section className="kiju-order-wizard-alerts" aria-label="Offene Auslieferungen" aria-live="polite">
                  <article key={primaryServiceDeliveryNotification.id} className="kiju-order-wizard-alert">
                    <div>
                      <span className="kiju-eyebrow">
                        {primaryServiceDeliveryNotification.kind === "service-drinks"
                          ? "Getränke-Service"
                          : primaryServiceDeliveryNotification.kind === "service-course-ready"
                            ? "Küchenpass"
                            : "Übernommen"}
                      </span>
                      <strong>{primaryServiceDeliveryNotification.title}</strong>
                      <small>{primaryServiceDeliveryNotification.body}</small>
                    </div>
                    {additionalServiceDeliveryCount > 0 ? (
                      <span className="kiju-service-more-badge">
                        +{additionalServiceDeliveryCount} weitere
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="kiju-button kiju-button--primary"
                      onClick={() => handleNotificationAction(primaryServiceDeliveryNotification)}
                    >
                      <CheckCircle2 size={18} />
                      {primaryServiceDeliveryNotification.kind === "service-drinks" ||
                      primaryServiceDeliveryNotification.kind === "service-course-ready"
                        ? "Annehmen"
                        : "Erledigt"}
                    </button>
                  </article>
                </section>
              ) : null}

              <ProgressSteps
                steps={(currentStep === "checkout" ? checkoutWizardSteps : orderWizardSteps).map((step) => step)}
                currentStep={orderWizardCurrentStepLabel}
                onStepSelect={selectWizardStep}
              />

              <div className="kiju-order-wizard-body">
                {usesSeatMode && visibleSeats.length > 0 ? (
                  <div className="kiju-seat-row kiju-order-wizard-seat-row" aria-label="Sitzplatz auswählen">
                    {visibleSeats.map((seat) => (
                      <button
                        key={seat.id}
                        type="button"
                        className={`kiju-seat-chip ${seat.id === selectedSeatId ? "is-selected" : ""}`}
                        onClick={() => setSelectedSeatId(seat.id)}
                      >
                        {seat.label}
                      </button>
                    ))}
                  </div>
                ) : null}

                {currentStep === "checkout" ? (
                  <div className="kiju-wizard-checkout-grid">
                    <section className="kiju-wizard-panel">
                      <div className="kiju-wizard-panel__header">
                        <div>
                          <span className="kiju-eyebrow">Offene Positionen</span>
                          <strong>Abrechnung vorbereiten</strong>
                        </div>
                        <StatusPill label={euro(checkoutOpenTotal)} tone={checkoutOpenTotal > 0 ? "amber" : "green"} />
                      </div>
                      <div className="kiju-review-list kiju-wizard-payment-list">
                        {renderCheckoutOpenEntries()}
                      </div>
                    </section>

                    <div className="kiju-wizard-checkout-side">
                      <section className="kiju-wizard-panel">
                        <div className="kiju-wizard-panel__header">
                          <div>
                            <span className="kiju-eyebrow">Verbuchen</span>
                            <strong>Zahlung und Storno</strong>
                          </div>
                          <StatusPill label={paymentMethodLabels[paymentMethod]} tone="navy" />
                        </div>
                        <div className="kiju-inline-field">
                          <span>Zahlart</span>
                          <select
                            name="payment-method"
                            aria-label="Zahlart"
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
                        <div className="kiju-wizard-summary-grid">
                          <div className="kiju-inline-panel">
                            <strong>Offen gesamt</strong>
                            <span>{euro(checkoutOpenTotal)}</span>
                            <small>
                              {checkoutTableIds.length > 1
                                ? `${checkoutTableIds.length} gekoppelte Tische`
                                : `${euro(sessionBillableTotal)} gesamt, ${euro(sessionOpenTotal)} offen am Tisch`}
                            </small>
                          </div>
                          <div className="kiju-inline-panel">
                            <strong>Aktueller Tisch</strong>
                            <span>{euro(sessionOpenTotal)}</span>
                            <small>{selectedTable?.name ?? "Kein Tisch gewählt"}</small>
                          </div>
                          <div className="kiju-inline-panel">
                            <strong>Auswahl</strong>
                            <span>{euro(selectedPaymentTotal)}</span>
                            <small>
                              {selectedPaymentQuantityTotal}x in {selectedPaymentLineItems.length} Einträgen
                            </small>
                          </div>
                        </div>
                        <div className="kiju-wizard-action-grid">
                          <button
                            type="button"
                            className="kiju-button kiju-button--primary"
                            onClick={handleRecordPartialPayment}
                            disabled={selectedPaymentLineItems.length === 0}
                          >
                            Auswahl bezahlt
                          </button>
                          <button
                            type="button"
                            className="kiju-button kiju-button--danger"
                            onClick={handleRecordInvoiceCancellation}
                            disabled={selectedPaymentLineItems.length === 0}
                          >
                            Auswahl stornieren
                          </button>
                          <button
                            type="button"
                            className="kiju-button kiju-button--danger"
                            onClick={handleClosePaidOrder}
                            disabled={checkoutOpenTotal > 0}
                          >
                            {serviceLabels.closeOrder}
                          </button>
                        </div>
                      </section>

                      <section className="kiju-wizard-panel">
                        <div className="kiju-wizard-panel__header">
                          <div>
                            <span className="kiju-eyebrow">Bons</span>
                            <strong>Gesamt-, Tisch- und Teilbon</strong>
                          </div>
                          <StatusPill
                            label={checkoutTableIds.length > 1 ? "Gesamtverbund" : "Einzeltisch"}
                            tone="slate"
                          />
                        </div>
                        <div className="kiju-wizard-action-grid">
                          <button
                            type="button"
                            className="kiju-button kiju-button--secondary"
                            onClick={() => openReceiptPreview("full", "receipt")}
                            disabled={!canPreviewFullReceipt}
                          >
                            Gesamtbon prüfen
                          </button>
                          <button
                            type="button"
                            className="kiju-button kiju-button--secondary"
                            onClick={() => openReceiptPreview("table", "receipt")}
                            disabled={!canPreviewTableReceipt}
                          >
                            Tisch-Bon prüfen
                          </button>
                          <button
                            type="button"
                            className="kiju-button kiju-button--secondary"
                            onClick={() => openReceiptPreview("partial", "receipt", selectedPaymentLineItems)}
                            disabled={!canPreviewPartialReceipt}
                          >
                            Teil-Bon prüfen
                          </button>
                          <button
                            type="button"
                            className="kiju-button kiju-button--secondary"
                            onClick={() => openReceiptPreview("full", "reprint")}
                            disabled={!canReprintFullReceipt}
                          >
                            Reprint letzter Gesamtbon
                          </button>
                        </div>
                      </section>

                      {renderReceiptPreviewPanel()}
                    </div>
                  </div>
                ) : isCourseStep(currentStep) ? (
                  <div className="kiju-wizard-items-layout">
                    <section className="kiju-wizard-panel">
                      <div className="kiju-wizard-panel__header">
                        <div>
                          <span className="kiju-eyebrow">{courseLabels[activeCourse]}</span>
                          <strong>Artikel auswählen</strong>
                        </div>
                        <StatusPill
                          label={formatCourseStatusLabel(activeCourseTicketState, activeCourse)}
                          tone={
                            activeCourseTicketState
                              ? ticketStatusDisplayTones[activeCourseTicketState.status] ?? "slate"
                              : "slate"
                          }
                        />
                      </div>
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
                              type="button"
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
                    </section>

                    <section className="kiju-wizard-panel kiju-order-editor">
                      <div className="kiju-order-editor__header">
                        <div>
                          <span className="kiju-eyebrow">{selectedTargetLabel}</span>
                          <strong>Erfasste Leistungen ({editableItems.length})</strong>
                        </div>
                        <StatusPill label={syncStatusLabel} tone={syncStatusTone} />
                      </div>
                      <div className="kiju-order-editor__list">
                        {renderActiveCourseItems(
                          `Für ${selectedTargetLabel} wurde in ${courseLabels[activeCourse]} noch nichts erfasst.`
                        )}
                      </div>
                    </section>

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
                              name="wait-course"
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
                              name="wait-minutes"
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

                    <div className="kiju-step-actions kiju-wizard-service-actions">
                      <button
                        type="button"
                        className="kiju-button kiju-button--secondary"
                        onClick={openWaitPlanner}
                      >
                        <Clock3 size={18} />
                        {serviceLabels.waiting}
                      </button>
                      <button
                        type="button"
                        className="kiju-button kiju-button--secondary"
                        onClick={() => actions.skipCourse(selectedTable.id, activeCourse)}
                      >
                        Gang überspringen
                      </button>
                      <button
                        type="button"
                        className="kiju-button kiju-button--primary"
                        onClick={handleSendCourseToKitchen}
                      >
                        {activeCourse === "drinks" ? (
                          <>
                            <Bell size={18} />
                            {sendCourseActionLabel}
                          </>
                        ) : (
                          <>
                            <ChefHat size={18} />
                            {sendCourseActionLabel}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="kiju-empty-state kiju-empty-state--compact">
                    <strong>{selectedTable.name} ist ausgewählt</strong>
                    <span>Gehe mit Weiter in den ersten Gang.</span>
                  </div>
                )}

              </div>

              <div className="kiju-wizard-footer">
                <button
                  type="button"
                  className="kiju-button kiju-button--secondary"
                  onClick={goBack}
                >
                  Zurück
                </button>
                <div className="kiju-wizard-footer__status">
                  <span>Schritt</span>
                  <strong>{orderWizardCurrentStepLabel}</strong>
                </div>
                <div className="kiju-wizard-footer__actions">
                  {isCourseStep(currentStep) ? (
                    <button
                      type="button"
                      className="kiju-button kiju-button--secondary"
                      onClick={finishOrderWizard}
                    >
                      Fertig
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="kiju-button kiju-button--primary"
                    onClick={goNext}
                    disabled={!canGoNext}
                  >
                    {nextButtonLabel}
                  </button>
                </div>
              </div>
            </div>
          </section>
          ) : null}

          {!isWaiterView ? (
          <section
            ref={serviceSectionRef}
            className="kiju-service-section"
          >
            <SectionCard
              className={isWaiterView ? "kiju-order-wizard-modal" : undefined}
              title={
                selectedTable
                  ? `Service für ${selectedTable.name}`
                  : "Tisch wählen"
              }
              eyebrow="Kellner-Wizard"
            >
              {currentStep === "table" && waiterMenuEntries.length > 0 ? (
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

              {isWaiterView && !isOrderWizardOpen ? (
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

              <ProgressSteps
                steps={(isWaiterView ? orderWizardSteps : wizardSteps).map((step) => step)}
                currentStep={currentWizardStepLabel}
                onStepSelect={selectWizardStep}
              />

              {selectedTable ? (
                <>
                  <div className="kiju-waiter-wizard-bar">
                    <div>
                      <span className="kiju-eyebrow">Aktiver Tisch</span>
                      <strong>
                        {selectedTable.name}
                        {linkedTableGroup ? ` · ${linkedTableGroup.label}` : ""}
                      </strong>
                    </div>
                    <div className="kiju-step-actions">
                      <button
                        type="button"
                        className="kiju-button kiju-button--secondary"
                        onClick={isWaiterView ? closeOrderWizard : () => setCurrentStep("table")}
                      >
                        <Map size={18} />
                        Tisch wechseln
                      </button>
                      <button
                        type="button"
                        className="kiju-button kiju-button--primary"
                        onClick={() => setCurrentStep("checkout")}
                      >
                        <Receipt size={18} />
                        Abrechnung
                      </button>
                    </div>
                  </div>

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

                  {currentStep === "checkout" ? (
                    <div className="kiju-review-grid">
                      <div className="kiju-review-list">
                        {renderCheckoutOpenEntries()}
                      </div>

                      <div className="kiju-review-actions">
                        <SectionCard title="Zahlung und Storno" eyebrow="Verbuchen">
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
                            <strong>Offen gesamt</strong>
                            <span>{euro(checkoutOpenTotal)}</span>
                            <small>
                              {checkoutTableIds.length > 1
                                ? `${checkoutTableIds.length} gekoppelte Tische`
                                : `${euro(sessionBillableTotal)} gesamt, ${euro(sessionOpenTotal)} offen am Tisch`}
                            </small>
                          </div>
                          <div className="kiju-inline-panel">
                            <strong>Aktueller Tisch</strong>
                            <span>{euro(sessionOpenTotal)}</span>
                            <small>{selectedTable?.name ?? "Kein Tisch gewählt"}</small>
                          </div>
                          <div className="kiju-inline-panel">
                            <strong>Auswahl</strong>
                            <span>{euro(selectedPaymentTotal)}</span>
                            <small>
                              {selectedPaymentQuantityTotal}x in {selectedPaymentLineItems.length} Einträgen
                            </small>
                          </div>
                          <button
                            className="kiju-button kiju-button--primary"
                            onClick={handleRecordPartialPayment}
                            disabled={selectedPaymentLineItems.length === 0}
                          >
                            Auswahl bezahlt
                          </button>
                          <button
                            className="kiju-button kiju-button--danger"
                            onClick={handleRecordInvoiceCancellation}
                            disabled={selectedPaymentLineItems.length === 0}
                          >
                            Auswahl stornieren
                          </button>
                          <button
                            className="kiju-button kiju-button--danger"
                            onClick={handleClosePaidOrder}
                            disabled={checkoutOpenTotal > 0}
                          >
                            {serviceLabels.closeOrder}
                          </button>
                        </SectionCard>

                        <SectionCard title="Gesamt-, Tisch- und Teilbon" eyebrow="Bons">
                          <button
                            className="kiju-button kiju-button--secondary"
                            onClick={() => openReceiptPreview("full", "receipt")}
                            disabled={!canPreviewFullReceipt}
                          >
                            Gesamtbon prüfen
                          </button>
                          <button
                            className="kiju-button kiju-button--secondary"
                            onClick={() => openReceiptPreview("table", "receipt")}
                            disabled={!canPreviewTableReceipt}
                          >
                            Tisch-Bon prüfen
                          </button>
                          <button
                            className="kiju-button kiju-button--secondary"
                            onClick={() => openReceiptPreview("partial", "receipt", selectedPaymentLineItems)}
                            disabled={!canPreviewPartialReceipt}
                          >
                            Teil-Bon prüfen
                          </button>
                          <button
                            className="kiju-button kiju-button--secondary"
                            onClick={() => openReceiptPreview("full", "reprint")}
                            disabled={!canReprintFullReceipt}
                          >
                            Reprint letzter Gesamtbon
                          </button>
                        </SectionCard>

                        {renderReceiptPreviewPanel()}
                      </div>
                    </div>
                  ) : isCourseStep(currentStep) ? (
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
                          {renderActiveCourseItems(
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
                              {sendCourseActionLabel}
                            </>
                          ) : (
                            <>
                              <ChefHat size={18} />
                              {sendCourseActionLabel}
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="kiju-empty-state kiju-empty-state--compact">
                      <strong>{selectedTable.name} ist ausgewählt</strong>
                      <span>Prüfe den Tisch und gehe mit Weiter zur Bestellgruppe.</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="kiju-empty-state kiju-empty-state--compact">
                  <strong>Tisch auswählen</strong>
                  <span>
                    Wähle zuerst einen Tisch im Raumplan oder in der Tischauswahl. Danach geht es mit Weiter zur Gruppe.
                  </span>
                </div>
              )}
              {isWaiterView ? (
                <div className="kiju-wizard-footer">
                  <button
                    type="button"
                    className="kiju-button kiju-button--secondary"
                    onClick={goBack}
                    disabled={currentStep === "table"}
                  >
                    Zurück
                  </button>
                  <button
                    type="button"
                    className="kiju-button kiju-button--primary"
                    onClick={goNext}
                    disabled={!canGoNext}
                  >
                    {nextButtonLabel}
                  </button>
                </div>
              ) : null}
            </SectionCard>
          </section>
          ) : null}

          {!isWaiterView || !isOrderWizardOpen ? (
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
          ) : null}
        </div>

        {extraIngredientsItem && selectedTable ? (
          <section
            className="kiju-service-section kiju-order-wizard-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="kiju-extra-ingredients-title"
          >
            <div className="kiju-order-wizard-modal kiju-extra-ingredients-modal" tabIndex={-1}>
              <div className="kiju-extra-ingredients-modal__header">
                <div>
                  <span className="kiju-eyebrow">Bestellposition bearbeiten</span>
                  <h2 id="kiju-extra-ingredients-title">Extra Zutaten</h2>
                  <p>
                    {resolveProductName(state.products, extraIngredientsItem.productId)} für{" "}
                    {selectedTable.name}
                  </p>
                </div>
                <button
                  type="button"
                  className="kiju-button kiju-button--secondary"
                  onClick={handleCloseExtraIngredientsDialog}
                  aria-label="Extra-Zutaten-Popup schließen"
                >
                  <X size={16} />
                  Schließen
                </button>
              </div>

              <div className="kiju-extra-ingredients-modal__body">
                {extraIngredientsDialogOptions.length > 0 ? (
                  <div className="kiju-extra-ingredients-modal__list">
                    {extraIngredientsDialogOptions.map((ingredient) => {
                      const checked = extraIngredientDraftIds.includes(ingredient.id);

                      return (
                        <label key={ingredient.id} className="kiju-checkbox-row">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              handleToggleExtraIngredientDraft(ingredient.id, event.target.checked)
                            }
                          />
                          <span className="kiju-extra-ingredients-modal__label">
                            <strong>{ingredient.name}</strong>
                            <small>
                              {euro(ingredient.priceDeltaCents)}
                              {!ingredient.active ? " · Inaktiv" : ""}
                            </small>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="kiju-inline-panel">
                    <strong>Keine Extra-Zutaten angelegt</strong>
                    <span>Lege im Admin-Bereich zuerst Zutaten für dieses Popup an.</span>
                  </div>
                )}
              </div>

              <div className="kiju-extra-ingredients-modal__actions">
                <button
                  type="button"
                  className="kiju-button kiju-button--secondary"
                  onClick={handleCloseExtraIngredientsDialog}
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  className="kiju-button kiju-button--primary"
                  onClick={handleSaveExtraIngredients}
                >
                  Speichern
                </button>
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </RouteGuard>
  );
};


