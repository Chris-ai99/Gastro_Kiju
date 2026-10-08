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
  type TableLayout,
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
import { buildPendingOrderSendSummary, isServiceBookedItem } from "../lib/order-overview";
import { RouteGuard } from "./route-guard";
import { ServiceTopbarMenu } from "./service-topbar-menu";
import { ThermalReceiptPaper } from "./thermal-receipt-paper";

const orderWizardSteps = [
  "Getränke",
  "Vorspeise",
  "Hauptspeise",
  "Nachtisch"
] as const;
const wizardSteps = ["Tisch", ...orderWizardSteps, "Abrechnung"] as const;
type OrderWizardStepLabel = (typeof orderWizardSteps)[number];
type WizardStepLabel = OrderWizardStepLabel | "Übersicht" | "Abrechnung";
type WaiterOrderStep = "overview" | CourseKey | "checkout";
type WaiterStep = "table" | WaiterOrderStep;
type CategoryDialogStage = "groups" | "products" | "review";
type CourseGroupOption = {
  label: string;
  products: Product[];
};
type RenderEditableItemsOptions = {
  readOnly?: boolean;
};

type OrderOverviewLine = {
  productId: string;
  category: CourseKey;
  quantity: number;
  totalCents: number;
  pendingQuantity: number;
  pendingTarget: "bar" | "kitchen" | null;
  sentQuantity: number;
  itemIds: string[];
  pendingItemIds: string[];
  serviceBooked: boolean;
  canceled: boolean;
  note?: string;
  target: OrderTarget;
};

const getOrderOverviewLineKey = (item: OrderItem) =>
  JSON.stringify({
    productId: item.productId,
    category: item.category,
    target: item.target,
    note: item.note ?? "",
    modifiers: item.modifiers,
    canceled: isOrderItemCanceled(item)
  });

const buildOrderOverviewLines = (items: OrderItem[], products: Product[]) => {
  const lines: OrderOverviewLine[] = [];
  const lineIndexes = new globalThis.Map<string, number>();

  items.forEach((item) => {
    const canceled = isOrderItemCanceled(item);
    const key = getOrderOverviewLineKey(item);
    const existingIndex = lineIndexes.get(key);
    const itemQuantity = Math.max(0, item.quantity);
    const serviceBooked = !canceled && isServiceBookedItem(item, products);
    const isPending = !canceled && !item.sentAt && !serviceBooked;

    if (existingIndex === undefined) {
      lineIndexes.set(key, lines.length);
      lines.push({
        productId: item.productId,
        category: item.category,
        quantity: itemQuantity,
        totalCents: calculateItemTotal(item, products),
        pendingQuantity: isPending ? itemQuantity : 0,
        pendingTarget: isPending ? (item.category === "drinks" ? "bar" : "kitchen") : null,
        sentQuantity: item.sentAt ? itemQuantity : 0,
        itemIds: [item.id],
        pendingItemIds: isPending ? [item.id] : [],
        serviceBooked,
        canceled,
        note: item.note,
        target: item.target
      });
      return;
    }

    const line = lines[existingIndex];
    if (!line) return;
    line.quantity += itemQuantity;
    line.totalCents += calculateItemTotal(item, products);
    line.itemIds.push(item.id);
    line.serviceBooked = line.serviceBooked && serviceBooked;
    line.canceled = line.canceled && canceled;
    if (item.sentAt && !canceled) {
      line.sentQuantity += itemQuantity;
    }
    if (isPending) {
      line.pendingItemIds.push(item.id);
      line.pendingQuantity += itemQuantity;
      line.pendingTarget = line.pendingTarget ?? (item.category === "drinks" ? "bar" : "kitchen");
    }
  });

  return lines;
};

const orderStepSequence: CourseKey[] = [
  "drinks",
  "starter",
  "main",
  "dessert"
];
const waiterStepLabels: Record<WaiterOrderStep, WizardStepLabel> = {
  overview: "Übersicht",
  drinks: "Getränke",
  starter: "Vorspeise",
  main: "Hauptspeise",
  dessert: "Nachtisch",
  checkout: "Abrechnung"
};
const waiterStepByLabel: Record<WizardStepLabel, WaiterOrderStep> = {
  Übersicht: "overview",
  Getränke: "drinks",
  Vorspeise: "starter",
  Hauptspeise: "main",
  Nachtisch: "dessert",
  Abrechnung: "checkout"
};
const serviceFeedbackTimeoutMs = 3000;
const serviceProductFeedbackTimeoutMs = 1000;
const isCourseStep = (step: WaiterStep): step is CourseKey =>
  step === "drinks" || step === "starter" || step === "main" || step === "dessert";

type ReceiptPreviewState = {
  printMode: "receipt" | "reprint";
  receiptMode: ReceiptDocumentMode;
  openedAt: string;
  title: string;
  tableSummary: string;
  sessionIds: string[];
  receipt: ReceiptDocumentInput;
};

const statusLabel: Record<string, string> = {
  idle: "Bereit",
  serving: "In Bedienung",
  waiting: "Warten",
  "ready-to-bill": "Verbuchen",
  planned: "Geplant"
};

const availabilityLabel: Record<"free" | "occupied", string> = {
  free: "Frei",
  occupied: "Belegt"
};

const availabilityTone: Record<"free" | "occupied", "green" | "amber"> = {
  free: "green",
  occupied: "amber"
};

const isPickupTableEntry = (table: Pick<TableLayout, "name" | "note">) =>
  /^Zum Abholen\s+\d+$/i.test(table.name.trim()) ||
  table.note?.trim().toLowerCase().startsWith("abholung") === true ||
  table.note?.trim().toLowerCase().startsWith("zum abholen") === true;

const getTableNumberLabel = (table: Pick<TableLayout, "id" | "name">) => {
  const pickupNumber = table.name.trim().match(/^Zum Abholen\s+(\d+)$/i)?.[1];
  if (pickupNumber) return `A${pickupNumber}`;

  return table.id.match(/table-(\d+)/i)?.[1] ?? table.name.match(/(\d+)/)?.[1] ?? "–";
};

const paymentMethodLabels: Record<"cash" | "card" | "voucher", string> = {
  cash: "Bar",
  card: "Karte",
  voucher: "Gutschein"
};

type CheckoutMode = "full" | "partial";
type CheckoutMutation = "idle" | "payment" | "cancellation" | "close";

const parseCentsInput = (value: string) => {
  const compact = value.replace(/\s/g, "");
  const normalized = compact.includes(",")
    ? compact.replace(/\./g, "").replace(",", ".")
    : compact;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
};

const printJobWasConfirmed = (job?: { status?: string }) => job?.status === "printed";

const printJobFeedbackLabel = (job: { status?: string } | undefined, documentLabel: string) =>
  printJobWasConfirmed(job) ? `${documentLabel} gedruckt` : `${documentLabel} in Warteschlange`;

const printJobFeedbackDetail = (job: { status?: string } | undefined, tableName: string) =>
  printJobWasConfirmed(job)
    ? `${tableName}: Der Drucker hat den Auftrag bestätigt.`
    : `${tableName}: Der Druckauftrag wurde auf dem Server gespeichert. Den tatsächlichen Druckstatus findest du in der Druckübersicht.`;

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
const fallbackCourseGroup = "Sonstiges";
const fallbackDrinkSubcategory = fallbackCourseGroup;
const preferredDrinkSubcategoryOrder = ["Alkoholfrei", "Bier/Radler", "Wein"] as const;
const preferredCourseGroupOrder: Record<CourseKey, string[]> = {
  drinks: ["Alkoholfrei", "Bier/Radler", "Wein", fallbackCourseGroup],
  starter: ["Pizzabrot", fallbackCourseGroup],
  main: ["Pizza", "Pasta", fallbackCourseGroup],
  dessert: ["Dessert", "Süßes", fallbackCourseGroup]
};

const inferDrinkSubcategory = (productName: string) => {
  const normalizedName = productName.toLocaleLowerCase("de-DE");

  if (
    normalizedName.includes("cola") ||
    normalizedName.includes("fanta") ||
    normalizedName.includes("sprite") ||
    normalizedName.includes("bionade") ||
    normalizedName.includes("wasser") ||
    normalizedName.includes("alkoholfrei") ||
    normalizedName.includes("alk. frei") ||
    normalizedName.includes("alk. freies")
  ) {
    return "Alkoholfrei";
  }

  if (normalizedName.includes("bier") || normalizedName.includes("radler")) {
    return "Bier/Radler";
  }

  if (normalizedName.includes("wein")) {
    return "Wein";
  }

  return fallbackDrinkSubcategory;
};

const getDrinkSubcategory = (product: Product) =>
  product.drinkSubcategory?.trim() || inferDrinkSubcategory(product.name);

const getFoodCourseGroup = (course: CourseKey, productName: string) => {
  const normalizedName = productName.toLocaleLowerCase("de-DE");

  if (course === "starter") {
    if (normalizedName.includes("pizza brot") || normalizedName.includes("pizzabrot")) {
      return "Pizzabrot";
    }
    return fallbackCourseGroup;
  }

  if (course === "main") {
    if (normalizedName.includes("pizza")) return "Pizza";
    if (normalizedName.includes("nudel") || normalizedName.includes("pasta")) return "Pasta";
    return fallbackCourseGroup;
  }

  if (course === "dessert") {
    if (normalizedName.includes("dessert")) return "Dessert";
    if (
      normalizedName.includes("nutella") ||
      normalizedName.includes("süß") ||
      normalizedName.includes("suess")
    ) {
      return "Süßes";
    }
    return fallbackCourseGroup;
  }

  return fallbackCourseGroup;
};

const getProductCourseGroup = (course: CourseKey, product: Product) =>
  course === "drinks" ? getDrinkSubcategory(product) : getFoodCourseGroup(course, product.name);

const sortCourseGroups = (course: CourseKey, groups: string[]) => {
  const preferredOrder = preferredCourseGroupOrder[course] ?? [fallbackCourseGroup];

  return [...groups].sort((left, right) => {
    const leftPreferredIndex = preferredOrder.indexOf(left);
    const rightPreferredIndex = preferredOrder.indexOf(right);

    if (leftPreferredIndex !== -1 || rightPreferredIndex !== -1) {
      if (leftPreferredIndex === -1) return 1;
      if (rightPreferredIndex === -1) return -1;
      return leftPreferredIndex - rightPreferredIndex;
    }

    return left.localeCompare(right, "de");
  });
};

const buildCourseGroupOptions = (course: CourseKey, products: Product[]): CourseGroupOption[] => {
  const productsByGroup = new globalThis.Map<string, Product[]>();

  products.forEach((product) => {
    const group = getProductCourseGroup(course, product);
    productsByGroup.set(group, [...(productsByGroup.get(group) ?? []), product]);
  });

  const groupLabels = new Set([...(preferredCourseGroupOrder[course] ?? []), ...productsByGroup.keys()]);

  return sortCourseGroups(course, [...groupLabels]).map((label) => ({
    label,
    products: productsByGroup.get(label) ?? []
  }));
};

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
  "not-recorded": "Noch nicht an Küche gesendet",
  blocked: "Gesperrt",
  countdown: "Wartezeit",
  ready: "An Küche gesendet",
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

const getTicketStatusTone = (status: string, itemCount = 0): "navy" | "amber" | "red" | "green" | "slate" =>
  status === "not-recorded" && itemCount > 0
    ? "red"
    : ticketStatusDisplayTones[status] ?? "slate";

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
    : status === "not-recorded" && course === "drinks"
      ? "Noch nicht an Bar gesendet"
      : status === "ready" && course === "drinks"
        ? "An Bar gesendet"
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
      return "Es sind Positionen erfasst, aber noch nicht an die Küche gesendet.";
    case "countdown":
      return "Dieser Gang ist an die Küche gesendet, startet aber erst nach der Wartezeit.";
    case "blocked":
      return "Dieser Gang ist aktuell noch gesperrt.";
    case "ready":
      return "Der Gang ist an die Küche gesendet und wartet dort auf Fertigmeldung.";
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
    return course
      ? formatTicketStatusDisplayLabel(course, entry.status)
      : ticketStatusDisplayLabels[entry.status] ?? entry.status;
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

const formatSyncTime = (value?: string) => {
  if (!value) return "Noch kein Serverstand geladen";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Serverstand unbekannt";

  return `Stand ${new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date)}`;
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
  const { state, currentUser, unreadNotifications, serverConnection, canUndoServiceHandover, actions } = useDemoApp();
  const serviceSectionRef = useRef<HTMLElement | null>(null);
  const orderWizardModalRef = useRef<HTMLDivElement | null>(null);
  const dashboard = useMemo(() => buildDashboardSummary(state), [state]);
  const defaultTableId =
    dashboard.find((entry) => entry.table.active)?.table.id ?? dashboard[0]?.table.id ?? null;
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedSeatId, setSelectedSeatId] = useState("");
  const [currentStep, setCurrentStep] = useState<WaiterStep>("table");
  const [isOrderWizardOpen, setIsOrderWizardOpen] = useState(false);
  const [showOrderAddOptions, setShowOrderAddOptions] = useState(false);
  const [isPickupNameDialogOpen, setIsPickupNameDialogOpen] = useState(false);
  const [pickupNameDraft, setPickupNameDraft] = useState("");
  const [activeCategoryDialog, setActiveCategoryDialog] = useState<CourseKey | null>(null);
  const [categoryDialogStage, setCategoryDialogStage] = useState<CategoryDialogStage>("groups");
  const [activeCourseGroup, setActiveCourseGroup] = useState(fallbackCourseGroup);
  const [categoryDialogInitialItemIds, setCategoryDialogInitialItemIds] = useState<string[]>([]);
  const [activeDrinkSubcategory, setActiveDrinkSubcategory] = useState(fallbackDrinkSubcategory);
  const paymentMethod = "cash" as const;
  const [checkoutMode, setCheckoutMode] = useState<CheckoutMode>("full");
  const [checkoutMutation, setCheckoutMutation] = useState<CheckoutMutation>("idle");
  const [cashReceivedInput, setCashReceivedInput] = useState("");
  const [invoiceCancellationConfirm, setInvoiceCancellationConfirm] = useState<{
    quantity: number;
    amountCents: number;
  } | null>(null);
  const checkoutMutationRef = useRef(false);
  const [isSendPending, setIsSendPending] = useState(false);
  const [selectedPaymentQuantities, setSelectedPaymentQuantities] = useState<Record<string, number>>({});
  const [isCloseOrderConfirmOpen, setIsCloseOrderConfirmOpen] = useState(false);
  const [linkTableSelection, setLinkTableSelection] = useState<string[]>([]);
  const [isLinkTablesOpen, setIsLinkTablesOpen] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState<ReceiptPreviewState | null>(null);
  const [serviceFeedback, setServiceFeedback] = useState<{
    tone: "success" | "alert" | "info";
    title: string;
    detail: string;
    timeoutMs?: number;
  } | null>(null);
  const [addedProductFeedback, setAddedProductFeedback] = useState<{
    productId: string;
    token: number;
  } | null>(null);
  const [waitPlannerOpen, setWaitPlannerOpen] = useState(false);
  const [waitCourse, setWaitCourse] = useState<CourseKey>("main");
  const [waitMinutes, setWaitMinutes] = useState("10");
  const [handoverTargetUserId, setHandoverTargetUserId] = useState("");
  const [supportUserId, setSupportUserId] = useState("");
  const [extraIngredientsItemId, setExtraIngredientsItemId] = useState<string | null>(null);
  const [extraIngredientDraftIds, setExtraIngredientDraftIds] = useState<string[]>([]);
  const [sentItemNoteDrafts, setSentItemNoteDrafts] = useState<Record<string, string>>({});
  const [editingOverviewLineId, setEditingOverviewLineId] = useState<string | null>(null);
  const addedProductFeedbackTimerRef = useRef<number | null>(null);
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
  const selectedDashboardEntry =
    dashboard.find((entry) => entry.table.id === selectedTableId) ?? null;
  const activeWaiterMenuEntries = waiterMenuEntries.filter((entry) => entry.table.active);
  const occupiedTableCount = activeWaiterMenuEntries.filter(
    (entry) => entry.availability === "occupied"
  ).length;
  const freeTableCount = Math.max(0, activeWaiterMenuEntries.length - occupiedTableCount);
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
  const activeWaiterUsers = state.users.filter((user) => user.role === "waiter" && user.active);
  const handoverTargetUsers = activeWaiterUsers.filter((user) => user.id !== currentUser?.id);
  const selectedServiceUserIds = new Set(
    selectedSession
      ? Array.isArray(selectedSession.serviceUserIds)
        ? selectedSession.serviceUserIds
        : [selectedSession.waiterId]
      : []
  );
  const supportTargetUsers = handoverTargetUsers.filter((user) => !selectedServiceUserIds.has(user.id));
  const selectedServiceNames = selectedSession
    ? [...selectedServiceUserIds]
        .map((userId) => state.users.find((user) => user.id === userId)?.name)
        .filter((name): name is string => Boolean(name))
    : [];
  const resolveReceiptBedienung = (sessions: OrderSession[]) =>
    currentUser?.name?.trim() ||
    sessions
      .map((session) => state.users.find((user) => user.id === session.waiterId)?.name?.trim())
      .find((name): name is string => Boolean(name)) ||
    "Service";
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

  useEffect(() => {
    if (handoverTargetUserId && !handoverTargetUsers.some((user) => user.id === handoverTargetUserId)) {
      setHandoverTargetUserId("");
    }
  }, [handoverTargetUserId, handoverTargetUsers]);

  useEffect(() => {
    if (supportUserId && !supportTargetUsers.some((user) => user.id === supportUserId)) {
      setSupportUserId("");
    }
  }, [supportTargetUsers, supportUserId]);

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
  const activeCourseGroups = useMemo(
    () => buildCourseGroupOptions(activeCourse, currentProducts),
    [activeCourse, currentProducts]
  );
  const selectedCourseGroup = activeCourseGroups.some((group) => group.label === activeCourseGroup)
    ? activeCourseGroup
    : activeCourseGroups[0]?.label ?? fallbackCourseGroup;
  const categoryDialogProducts = useMemo(
    () =>
      currentProducts.filter(
        (product) => getProductCourseGroup(activeCourse, product) === selectedCourseGroup
      ),
    [activeCourse, currentProducts, selectedCourseGroup]
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

  useEffect(() => {
    if (!activeCategoryDialog || activeCourseGroups.length === 0) return;
    if (activeCourseGroups.some((group) => group.label === activeCourseGroup)) return;

    setActiveCourseGroup(activeCourseGroups[0]?.label ?? fallbackCourseGroup);
  }, [activeCategoryDialog, activeCourseGroup, activeCourseGroups]);

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
  const activeCourseItemCount =
    selectedSession?.items
      .filter((item) => item.category === activeCourse && !isOrderItemCanceled(item))
      .reduce((sum, item) => sum + item.quantity, 0) ?? 0;
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
    serverConnection.status === "online"
      ? "Server verbunden"
      : serverConnection.status === "saving"
        ? "Speichert …"
        : serverConnection.status === "connecting" || serverConnection.status === "reconnecting"
          ? "Verbinde …"
          : "Server nicht erreichbar";
  const syncStatusTone =
    serverConnection.status === "online"
      ? "green"
      : serverConnection.status === "connecting" ||
          serverConnection.status === "reconnecting" ||
          serverConnection.status === "saving"
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
  const categoryDialogInitialItemIdSet = useMemo(
    () => new Set(categoryDialogInitialItemIds),
    [categoryDialogInitialItemIds]
  );
  const categoryDialogNewItems = useMemo(
    () => newEditableItems.filter((item) => !categoryDialogInitialItemIdSet.has(item.id)),
    [categoryDialogInitialItemIdSet, newEditableItems]
  );
  const categoryDialogExistingUnsentItems = useMemo(
    () => newEditableItems.filter((item) => categoryDialogInitialItemIdSet.has(item.id)),
    [categoryDialogInitialItemIdSet, newEditableItems]
  );
  const categoryDialogSentItems = sentEditableItems;
  const revisableSentItemCount = sentEditableItems.filter((item) => canReviseSentItem(item)).length;
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
  const fullPaymentLineItems = checkoutOpenEntries.map(({ item, openQuantity }) => ({
    itemId: item.id,
    quantity: openQuantity
  }));
  const activePaymentTotal = checkoutMode === "full" ? checkoutOpenTotal : selectedPaymentTotal;
  const cashReceivedCents = parseCentsInput(cashReceivedInput);
  const cashChangeCents = Math.max(0, cashReceivedCents - activePaymentTotal);
  const cashPaymentValid =
    paymentMethod !== "cash" || (activePaymentTotal > 0 && cashReceivedCents >= activePaymentTotal);
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

  useEffect(() => {
    if (paymentMethod !== "cash") {
      setCashReceivedInput("");
      return;
    }

    if (cashReceivedInput === "" && activePaymentTotal > 0) {
      setCashReceivedInput((activePaymentTotal / 100).toFixed(2).replace(".", ","));
    }
  }, [activePaymentTotal, cashReceivedInput, paymentMethod]);
  const sessionItemCount =
    selectedSession?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const orderOverviewLines = useMemo(
    () => buildOrderOverviewLines(selectedSession?.items ?? [], state.products),
    [selectedSession, state.products]
  );
  const orderOverviewItemCount = orderOverviewLines.reduce(
    (sum, line) => sum + (line.canceled ? 0 : line.quantity),
    0
  );
  const orderOverviewSentQuantity = orderOverviewLines.reduce(
    (sum, line) => sum + line.sentQuantity,
    0
  );
  const orderOverviewPendingQuantity = orderOverviewLines.reduce(
    (sum, line) => sum + line.pendingQuantity,
    0
  );
  const pendingOrderSendSummary = useMemo(
    () => buildPendingOrderSendSummary(selectedSession, state.products),
    [selectedSession, state.products]
  );
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
    }, serviceFeedback.timeoutMs ?? serviceFeedbackTimeoutMs);

    return () => window.clearTimeout(timeoutId);
  }, [serviceFeedback]);

  useEffect(
    () => () => {
      if (addedProductFeedbackTimerRef.current) {
        window.clearTimeout(addedProductFeedbackTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    setReceiptPreview(null);
    setSelectedPaymentQuantities({});
    setCheckoutMode("full");
    setCashReceivedInput("");
    setInvoiceCancellationConfirm(null);
    setLinkTableSelection(selectedTableId ? [selectedTableId] : []);
    setEditingOverviewLineId(null);
  }, [selectedTableId]);

  useEffect(() => {
    if (
      !isOrderWizardOpen &&
      !isPickupNameDialogOpen &&
      !isCloseOrderConfirmOpen &&
      !invoiceCancellationConfirm
    ) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => {
      if (isPickupNameDialogOpen) {
        document.getElementById("kiju-pickup-name")?.focus();
      } else if (isCloseOrderConfirmOpen) {
        document.getElementById("kiju-close-order-confirm-dialog")?.focus();
      } else if (invoiceCancellationConfirm) {
        document.getElementById("kiju-invoice-cancellation-confirm-dialog")?.focus();
      } else {
        orderWizardModalRef.current?.focus();
      }
    });

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [invoiceCancellationConfirm, isCloseOrderConfirmOpen, isOrderWizardOpen, isPickupNameDialogOpen]);

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

  const openOrderWizard = (step: WaiterStep) => {
    setCurrentStep(step);
    setActiveCategoryDialog(null);
    setShowOrderAddOptions(false);
    setCategoryDialogStage("groups");
    setCategoryDialogInitialItemIds([]);
    setIsOrderWizardOpen(true);
  };

  const openOrderOverviewForSelectedTable = () => {
    flushPendingSentItemNotes();
    openOrderWizard("overview");
  };

  const openCategoryDialog = (course: CourseKey) => {
    const nextProducts = getOrderableProducts(state.products, course);
    const initialGroup = buildCourseGroupOptions(course, nextProducts)[0]?.label ?? fallbackCourseGroup;
    const initialItemIds =
      selectedSession?.items
        .filter((item) => item.category === course && !isOrderItemCanceled(item))
        .map((item) => item.id) ?? [];

    setCurrentStep(course);
    setActiveCategoryDialog(course);
    setCategoryDialogStage("groups");
    setActiveCourseGroup(initialGroup);
    setCategoryDialogInitialItemIds(initialItemIds);
    if (course === "drinks") {
      setActiveDrinkSubcategory(initialGroup);
    }
    setWaitPlannerOpen(false);
  };

  const closeCategoryDialog = () => {
    flushPendingSentItemNotes();
    setActiveCategoryDialog(null);
    setShowOrderAddOptions(false);
    setCategoryDialogStage("groups");
    setCategoryDialogInitialItemIds([]);
    setWaitPlannerOpen(false);
    setCurrentStep("overview");
  };

  const openCategoryProductGroup = (group: string) => {
    setActiveCourseGroup(group);
    if (activeCourse === "drinks") {
      setActiveDrinkSubcategory(group);
    }
    setWaitPlannerOpen(false);
    setCategoryDialogStage("products");
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
      openOrderWizard("overview");
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
      openOrderWizard("overview");
      return;
    }

    if (!scrollToService) return;

    scrollToServiceSection();
  };

  const handleProductAdd = (productId: string) => {
    if (!selectedTable) return;

    actions.addItem(selectedTable.id, selectedOrderTarget, productId);

    const productName = resolveProductName(state.products, productId);
    setServiceFeedback({
      tone: "success",
      title: "Hinzugefügt",
      detail: `1 × ${productName} hinzugefügt`,
      timeoutMs: serviceProductFeedbackTimeoutMs
    });

    if (addedProductFeedbackTimerRef.current) {
      window.clearTimeout(addedProductFeedbackTimerRef.current);
    }

    setAddedProductFeedback(null);
    window.requestAnimationFrame(() => {
      setAddedProductFeedback({ productId, token: Date.now() });
      addedProductFeedbackTimerRef.current = window.setTimeout(() => {
        setAddedProductFeedback((current) => (current?.productId === productId ? null : current));
      }, serviceProductFeedbackTimeoutMs);
    });
  };

  const handleSendCourseToKitchen = async () => {
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

    const confirmation = await result.confirmation;
    if (confirmation && !confirmation.ok) {
      setServiceFeedback({
        tone: "alert",
        title: "Nicht gespeichert",
        detail: confirmation.message
      });
      return;
    }

    const syncHint =
      activeCourse === "drinks"
        ? "Der Server hat den Bon bestätigt und an die Bar-Geräte verteilt."
        : "Der Server hat den Bon bestätigt und an die Küchengeräte verteilt.";

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

  const confirmCourseWait = async () => {
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

    const confirmation = await result.confirmation;
    if (confirmation && !confirmation.ok) {
      setServiceFeedback({
        tone: "alert",
        title: "Wartezeit nicht gespeichert",
        detail: confirmation.message
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
      openedAt,
      bedienung: resolveReceiptBedienung(sessions)
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

  const openReceiptCheck = (receiptMode: ReceiptDocumentMode) => {
    const pinnedReceiptMode = checkoutTableIds.length > 1 ? "full" : "table";
    if (receiptMode === pinnedReceiptMode) {
      setReceiptPreview(null);
      return;
    }

    openReceiptPreview(receiptMode, "receipt");
  };

  const handleReceiptPreviewPrint = async (preview: ReceiptPreviewState, clearAfterSuccess: boolean) => {
    if (!selectedTable || !selectedSession) return;
    const tableName = preview.tableSummary;

    if (preview.printMode === "reprint") {
      actions.reprintReceipt(selectedTable.id, preview.sessionIds);
    } else {
      actions.printReceipt(selectedTable.id, preview.sessionIds);
    }

    const result = await createPrintJob({
      type: preview.printMode,
      receipt: preview.receipt,
      tableId: selectedTable.id,
      tableLabel: tableName
    });

    setServiceFeedback({
      tone: result.ok ? "success" : "alert",
      title:
        result.ok
          ? printJobFeedbackLabel(
              result.job,
              preview.printMode === "reprint" ? "Reprint" : "Bon"
            )
          : preview.printMode === "reprint"
            ? "Reprint nicht gesendet"
            : "Bon nicht gesendet",
      detail: result.ok
        ? printJobFeedbackDetail(result.job, tableName)
        : result.message ?? "Der Bon konnte nicht an den Netzwerkdrucker gesendet werden."
    });

    if (result.ok && clearAfterSuccess) {
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
      openedAt,
      bedienung: resolveReceiptBedienung([session])
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
      title: result.ok
        ? printJobFeedbackLabel(result.job, "Reprint")
        : "Reprint nicht gesendet",
      detail: result.ok
        ? printJobFeedbackDetail(result.job, tableName)
        : result.message ?? "Der Reprint konnte nicht an den Netzwerkdrucker gesendet werden."
    });
  };

  const setPaymentQuantity = (itemId: string, quantity: number, maxQuantity: number) => {
    setSelectedPaymentQuantities((current) => ({
      ...current,
      [itemId]: Math.min(maxQuantity, Math.max(0, Math.floor(quantity)))
    }));
    setCashReceivedInput("");
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
    setCashReceivedInput("");
  };

  const recordPayment = async (
    lineItems: PaymentLineItem[],
    amountCents: number,
    label: "Restzahlung" | "Teilzahlung"
  ) => {
    if (!selectedTable || lineItems.length === 0 || checkoutMutationRef.current) return;

    checkoutMutationRef.current = true;
    setCheckoutMutation("payment");
    const result = actions.recordPartialPayment(checkoutTableIds, lineItems, paymentMethod, label);

    if (!result.ok) {
      checkoutMutationRef.current = false;
      setCheckoutMutation("idle");
      setServiceFeedback({
        tone: "alert",
        title: "Zahlung nicht verbucht",
        detail: result.message ?? "Bitte die Zahlung prüfen."
      });
      return;
    }

    try {
      const confirmation = await result.confirmation;
      if (!confirmation?.ok) {
        setServiceFeedback({
          tone: "alert",
          title: "Zahlung nicht bestätigt",
          detail: confirmation?.message ?? "Die Serverbestätigung fehlt. Bitte nicht erneut klicken, sondern den Stand prüfen."
        });
        return;
      }

      setServiceFeedback({
        tone: "success",
        title: "Zahlung bestätigt",
        detail: `${euro(amountCents)} wurden als ${paymentMethodLabels[paymentMethod]} gespeichert. Der Tisch bleibt offen, bis du ihn separat schließt.`
      });
      setSelectedPaymentQuantities({});
      setCashReceivedInput("");
      setReceiptPreview(null);
    } finally {
      checkoutMutationRef.current = false;
      setCheckoutMutation("idle");
    }
  };

  const handleRecordFullPayment = () => {
    if (paymentMethod === "cash" && !cashPaymentValid) return;
    void recordPayment(fullPaymentLineItems, checkoutOpenTotal, "Restzahlung");
  };

  const handleRecordPartialPayment = () => {
    if (paymentMethod === "cash" && !cashPaymentValid) return;
    void recordPayment(selectedPaymentLineItems, selectedPaymentTotal, "Teilzahlung");
  };

  const handleRecordInvoiceCancellation = () => {
    if (!selectedTable || selectedPaymentLineItems.length === 0 || checkoutMutationRef.current) return;

    setInvoiceCancellationConfirm({
      quantity: selectedPaymentLineItems.reduce((sum, lineItem) => sum + lineItem.quantity, 0),
      amountCents: selectedPaymentTotal
    });
  };

  const confirmInvoiceCancellation = async () => {
    if (!selectedTable || selectedPaymentLineItems.length === 0 || checkoutMutationRef.current) return;

    checkoutMutationRef.current = true;
    setCheckoutMutation("cancellation");
    const result = actions.recordInvoiceCancellation(
      checkoutTableIds,
      selectedPaymentLineItems,
      "Rechnungsstorno"
    );

    if (!result.ok) {
      checkoutMutationRef.current = false;
      setCheckoutMutation("idle");
      setServiceFeedback({
        tone: "alert",
        title: "Storno nicht gespeichert",
        detail: result.message ?? "Bitte die Auswahl prüfen."
      });
      return;
    }

    try {
      const confirmation = await result.confirmation;
      if (!confirmation?.ok) {
        setServiceFeedback({
          tone: "alert",
          title: "Storno nicht bestätigt",
          detail: confirmation?.message ?? "Die Serverbestätigung fehlt."
        });
        return;
      }
      setServiceFeedback({
        tone: "success",
        title: "Storno bestätigt",
        detail: result.message ?? "Das Storno wurde vom Server bestätigt."
      });
      setSelectedPaymentQuantities({});
      setInvoiceCancellationConfirm(null);
      setReceiptPreview(null);
    } finally {
      checkoutMutationRef.current = false;
      setCheckoutMutation("idle");
    }
  };

  const handleClosePaidOrder = async () => {
    if (!selectedTable || checkoutMutationRef.current) return;

    checkoutMutationRef.current = true;
    setCheckoutMutation("close");
    const result = actions.closePaidOrder(selectedTable.id);
    if (!result.ok) {
      checkoutMutationRef.current = false;
      setCheckoutMutation("idle");
      setServiceFeedback({
        tone: "alert",
        title: "Noch nicht geschlossen",
        detail: result.message ?? "Der offene Betrag muss zuerst 0,00 € sein."
      });
      return;
    }

    try {
      const confirmation = await result.confirmation;
      if (!confirmation?.ok) {
        setServiceFeedback({
          tone: "alert",
          title: "Abschluss nicht bestätigt",
          detail: confirmation?.message ?? "Die Serverbestätigung fehlt."
        });
        return;
      }

      const archivedCurrentTable = result.archivedTableIds?.includes(selectedTable.id) === true;
      setServiceFeedback({
        tone: "success",
        title: archivedCurrentTable ? "Abholtisch archiviert" : "Tisch geschlossen",
        detail:
          result.message ??
          (archivedCurrentTable
            ? "Der Abholtisch wurde abgeschlossen und aus der Serviceansicht entfernt."
            : "Der Abschluss wurde vom Server bestätigt.")
      });
      setSelectedPaymentQuantities({});
      setReceiptPreview(null);

      if (archivedCurrentTable) setSelectedTableId(null);
      closeOrderWizard();
    } finally {
      checkoutMutationRef.current = false;
      setCheckoutMutation("idle");
    }
  };

  const requestClosePaidOrder = () => {
    if (!selectedTable || checkoutSessions.length === 0 || checkoutMutationRef.current) return;

    if (checkoutOpenTotal > 0) {
      setServiceFeedback({
        tone: "alert",
        title: "Zuerst Zahlung erfassen",
        detail: `Der offene Rest beträgt ${euro(checkoutOpenTotal)}. Erst bei 0,00 € kann der Tisch geschlossen werden.`
      });
      return;
    }

    setIsCloseOrderConfirmOpen(true);
  };

  const cancelClosePaidOrder = () => {
    setIsCloseOrderConfirmOpen(false);
  };

  const confirmClosePaidOrder = () => {
    setIsCloseOrderConfirmOpen(false);
    void handleClosePaidOrder();
  };

  const closeOrderWizard = () => {
    flushPendingSentItemNotes();
    setIsOrderWizardOpen(false);
    setIsCloseOrderConfirmOpen(false);
    setInvoiceCancellationConfirm(null);
    setCheckoutMode("full");
    setCheckoutMutation("idle");
    setCashReceivedInput("");
    setSelectedPaymentQuantities({});
    setActiveCategoryDialog(null);
    setShowOrderAddOptions(false);
    setWaitPlannerOpen(false);
    setCurrentStep("table");
  };

  const goBack = () => {
    if (currentStep === "table") {
      closeOrderWizard();
      return;
    }

    if (currentStep === "checkout") {
      if (isWaiterView) {
        setCurrentStep("overview");
        return;
      }

      setIsOrderWizardOpen(false);
      setCurrentStep("table");
      return;
    }

    if (currentStep === "overview") {
      closeOrderWizard();
      return;
    }

    const currentIndex = orderStepSequence.indexOf(currentStep);
    if (currentIndex > 0) {
      const previousStep = orderStepSequence[currentIndex - 1];
      if (previousStep) setCurrentStep(previousStep);
      return;
    }

    setIsOrderWizardOpen(false);
    closeOrderWizard();
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

    if (currentStep === "checkout") return;
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
  const canGoNext =
    currentStep === "table"
      ? Boolean(selectedTable)
      : true;
  const nextButtonLabel = "Weiter";
  const sendCourseActionLabel =
    activeCourse === "drinks"
      ? sentEditableItems.length > 0
        ? "Neue Getränke an Bar senden"
        : "Getränke an Bar senden"
      : sentEditableItems.length > 0
        ? "Nachbestellung an Küche senden"
        : "Alles an Küche senden";

  const openPickupNameDialog = () => {
    setPickupNameDraft("");
    setIsPickupNameDialogOpen(true);
  };

  const handleCreatePickupTable = async (pickupName: string) => {
    const normalizedPickupName = pickupName.trim();
    const result = actions.createPickupTable({
      customerName: normalizedPickupName,
      locationName: "Abholung"
    });

    if (!result.ok || !result.tableId || !result.tableName || !result.pickupNumber) {
      setServiceFeedback({
        tone: "alert",
        title: "Abholbon nicht erstellt",
        detail: result.message ?? "Der Abholtisch konnte nicht angelegt werden."
      });
      return;
    }

    const confirmation = await result.confirmation;
    if (confirmation && !confirmation.ok) {
      setServiceFeedback({
        tone: "alert",
        title: "Abholbon nicht gespeichert",
        detail: confirmation.message
      });
      return;
    }

    setSelectedTableId(result.tableId);
    setIsPickupNameDialogOpen(false);
    setSelectedSeatId(usesSeatMode ? result.seatId ?? "" : "");
    setReceiptPreview(null);
    setSelectedPaymentQuantities({});
    setCheckoutMode("full");
    setCashReceivedInput("");
    setIsLinkTablesOpen(false);
    openOrderWizard("overview");

    const printResult = await createPrintJob({
      type: "pickup-ticket",
      tableId: result.tableId,
      tableLabel: result.tableName,
      pickupNumber: result.pickupNumber,
      customerName: normalizedPickupName,
      locationName: "Abholung",
      createdAt: result.createdAt
    });

    setServiceFeedback({
      tone: printResult.ok ? "success" : "alert",
      title: printResult.ok
        ? `Abholbon erstellt · ${printJobFeedbackLabel(printResult.job, "Druck")}`
        : "Abholbon erstellt, Druck prüfen",
      detail: printResult.ok
        ? printJobFeedbackDetail(printResult.job, result.tableName)
        : printResult.message ??
          `${result.tableName} ist geöffnet, aber der Kurzbon konnte nicht gedruckt werden.`
    });
  };

  const clearPaymentSelection = () => {
    setSelectedPaymentQuantities({});
  };

  const handleArchivePickupTable = async (tableId: string) => {
    const table = state.tables.find((entry) => entry.id === tableId);
    if (!table || !isPickupTableEntry(table)) return;

    if (getSessionForTable(state.sessions, tableId)) {
      setServiceFeedback({
        tone: "alert",
        title: "Abholtisch noch offen",
        detail: "Bitte zuerst die offene Bestellung abschließen."
      });
      return;
    }

    if (!window.confirm(`${table.name} wirklich aus der aktiven Übersicht entfernen?`)) return;

    const result = actions.archivePickupTable(tableId);
    if (!result.ok) {
      setServiceFeedback({
        tone: "alert",
        title: "Abholtisch nicht entfernt",
        detail: result.message ?? "Der Abholtisch konnte nicht archiviert werden."
      });
      return;
    }

    const confirmation = await result.confirmation;
    if (confirmation && !confirmation.ok) {
      setServiceFeedback({
        tone: "alert",
        title: "Archivierung nicht bestätigt",
        detail: confirmation.message
      });
      return;
    }

    if (selectedTableId === tableId) {
      setSelectedTableId(null);
      closeOrderWizard();
    }

    setServiceFeedback({
      tone: "success",
      title: "Abholtisch entfernt",
      detail: `${table.name} wurde archiviert. Die Historie bleibt erhalten.`
    });
  };

  const handleSendAllPendingItems = async () => {
    if (!selectedTable || isSendPending) return;

    const result = actions.sendAllPendingItems(selectedTable.id);
    if (!result.ok) {
      setServiceFeedback({
        tone: "alert",
        title: "Noch nicht gesendet",
        detail: result.message ?? "Die offenen Positionen konnten nicht gesendet werden."
      });
      return;
    }

    setIsSendPending(true);
    const confirmation = await result.confirmation;
    setIsSendPending(false);

    if (confirmation && !confirmation.ok) {
      setServiceFeedback({
        tone: "alert",
        title: "Nicht gespeichert",
        detail: confirmation.message
      });
      return;
    }

    setServiceFeedback({
      tone: "success",
      title: "Bestellung gesendet",
      detail:
        result.message ??
        `${result.sentItemCount} ${result.sentItemCount === 1 ? "Position wurde" : "Positionen wurden"} an Bar und Küche verteilt.`
    });
  };

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

  const handleHandoverService = () => {
    const result = actions.handoverServiceTasks(handoverTargetUserId);
    setServiceFeedback({
      tone: result.ok ? "success" : "alert",
      title: result.ok ? "Schicht übergeben" : "Übergabe nicht möglich",
      detail: result.message ?? "Bitte eine Ziel-Bedienung auswählen."
    });

    if (result.ok) {
      setHandoverTargetUserId("");
    }
  };

  const handleReleaseService = () => {
    const result = actions.releaseServiceTasks();
    setServiceFeedback({
      tone: result.ok ? "success" : "alert",
      title: result.ok ? "Aufgaben freigegeben" : "Freigabe nicht möglich",
      detail: result.message ?? "Offene Aufgaben konnten nicht freigegeben werden."
    });
  };

  const handleUndoServiceHandover = () => {
    const result = actions.undoLastServiceHandover();
    setServiceFeedback({
      tone: result.ok ? "success" : "alert",
      title: result.ok ? "Schichtübergabe rückgängig" : "Rückgängig nicht möglich",
      detail: result.message ?? "Die letzte Schichtübergabe konnte nicht rückgängig gemacht werden."
    });
  };

  const handleAddServiceUser = () => {
    if (!selectedTable || !supportUserId) {
      setServiceFeedback({
        tone: "alert",
        title: "Keine Bedienung ausgewählt",
        detail: "Bitte zuerst einen Tisch und eine Bedienung auswählen."
      });
      return;
    }

    const result = actions.addServiceUserToTable(selectedTable.id, supportUserId);
    setServiceFeedback({
      tone: result.ok ? "success" : "alert",
      title: result.ok ? "Bedienung hinzugefügt" : "Hinzufügen nicht möglich",
      detail: result.message ?? "Die Bedienung konnte nicht hinzugefügt werden."
    });

    if (result.ok) {
      setSupportUserId("");
    }
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

  const handleOverviewPendingQuantityChange = (item: OrderItem, delta: number) => {
    if (!selectedTable || item.sentAt || isOrderItemCanceled(item) || isServiceBookedItem(item, state.products)) {
      return;
    }

    const nextQuantity = Math.max(1, item.quantity + delta);
    if (nextQuantity === item.quantity) return;

    actions.updateItem(selectedTable.id, item.id, { quantity: nextQuantity });
  };

  const handleOverviewPendingRemoval = (item: OrderItem) => {
    if (!selectedTable || item.sentAt || isOrderItemCanceled(item)) return;

    handleItemRemoval(item);
    setEditingOverviewLineId(null);
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

  const renderEditableItems = (
    items: OrderItem[],
    emptyMessage: string,
    options: RenderEditableItemsOptions = {}
  ) => {
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
      const canEditItem = !options.readOnly && canReviseSentItem(item);
      const isLocked = options.readOnly || !canEditItem;
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
              {options.readOnly ? (
                <strong>{item.quantity}</strong>
              ) : (
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
              )}
            </div>

            {!options.readOnly ? (
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
            ) : null}
          </div>

          {extraIngredientLabels.length > 0 ? (
            <div className="kiju-order-item-card__detail">
              <span>Extra Zutaten</span>
              <strong>{extraIngredientLabels.join(", ")}</strong>
            </div>
          ) : null}

          {options.readOnly ? (
            item.note ? (
              <div className="kiju-order-item-card__detail">
                <span>Notiz</span>
                <strong>{item.note}</strong>
              </div>
            ) : null
          ) : (
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
          )}
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

  const renderCategoryDialogReviewItems = () => {
    const emptyMessage = `Für ${selectedTargetLabel} wurde in ${courseLabels[activeCourse]} noch nichts erfasst.`;

    if (
      categoryDialogNewItems.length === 0 &&
      categoryDialogExistingUnsentItems.length === 0 &&
      categoryDialogSentItems.length === 0
    ) {
      return renderEditableItems([], emptyMessage);
    }

    return (
      <div className="kiju-order-editor__groups">
        {categoryDialogNewItems.length > 0 ? (
          <section className="kiju-order-editor__group">
            <div className="kiju-order-editor__group-title">
              <strong>Neu ausgewählt</strong>
              <span>{categoryDialogNewItems.length} Positionen</span>
            </div>
            {renderEditableItems(categoryDialogNewItems, emptyMessage)}
          </section>
        ) : null}

        {categoryDialogExistingUnsentItems.length > 0 ? (
          <section className="kiju-order-editor__group">
            <div className="kiju-order-editor__group-title">
              <strong>Noch nicht gesendet</strong>
              <span>{categoryDialogExistingUnsentItems.length} Positionen</span>
            </div>
            {renderEditableItems(categoryDialogExistingUnsentItems, emptyMessage)}
          </section>
        ) : null}

        {categoryDialogSentItems.length > 0 ? (
          <section className="kiju-order-editor__group">
            <div className="kiju-order-editor__group-title">
              <strong>Bereits gesendet</strong>
              <span>Verlauf</span>
            </div>
            {renderEditableItems(categoryDialogSentItems, emptyMessage, { readOnly: true })}
          </section>
        ) : null}
      </div>
    );
  };

  const renderCheckoutOpenEntries = () => {
    if (checkoutOpenGroups.length === 0) {
      return (
        <div className="kiju-inline-panel">
          <span>Alle Positionen sind bezahlt oder storniert.</span>
        </div>
      );
    }

    return checkoutMode === "full" ? (
      <div className="kiju-checkout-compact-list">
        {checkoutOpenGroups.map(({ table, entries, openTotal }) => (
          <section key={table.id} className="kiju-checkout-table-group">
            <div className="kiju-checkout-table-group__header">
              <div>
                <strong>{table.name}</strong>
                <small>{entries.length} offene Positionen</small>
              </div>
              <strong>{euro(openTotal)}</strong>
            </div>
            <div className="kiju-checkout-compact-lines">
              {entries.map(({ item, openQuantity, unitTotal }) => {
                const modifierLabels = resolveItemModifierLabels(item, state.products);
                return (
                  <article key={`${table.id}-${item.id}`} className="kiju-checkout-compact-line">
                    <div>
                      <strong>
                        {openQuantity} × {resolveProductName(state.products, item.productId)}
                      </strong>
                      <small>
                        {courseLabels[item.category]}
                        {modifierLabels.length > 0 || item.note
                          ? ` · ${[...modifierLabels, ...(item.note ? [`Hinweis: ${item.note}`] : [])].join(" · ")}`
                          : ""}
                      </small>
                    </div>
                    <strong>{euro(unitTotal * openQuantity)}</strong>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    ) : (
      <>
        <div className="kiju-checkout-selection-toolbar">
          <div>
            <strong>Teilzahlung oder Storno auswählen</strong>
            <span>
              {selectedPaymentQuantityTotal} von {checkoutOpenQuantityTotal} offenen Positionen ausgewählt
            </span>
            <small>Die Auswahl wird erst mit einer der Aktionen unten verändert.</small>
          </div>
          <button
            type="button"
            className="kiju-button kiju-button--secondary"
            onClick={areAllCheckoutPositionsSelected ? clearPaymentSelection : selectAllPaymentItems}
            disabled={checkoutMutation !== "idle"}
          >
            <CheckCircle2 size={18} />
            {areAllCheckoutPositionsSelected ? "Auswahl aufheben" : "Alle offenen auswählen"}
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
                        onChange={(event) => togglePaymentItem(item.id, event.target.checked, openQuantity)}
                        disabled={checkoutMutation !== "idle"}
                      />
                      <span>
                        <strong>{resolveProductName(state.products, item.productId)}</strong>
                        <small>
                          {table.name} · {courseLabels[item.category]} · offen {openQuantity}
                        </small>
                        {modifierLabels.length > 0 || item.note ? (
                          <small>
                            {[...modifierLabels, ...(item.note ? [`Hinweis: ${item.note}`] : [])].join(" · ")}
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
                      disabled={checkoutMutation !== "idle"}
                      onChange={(event) => setPaymentQuantity(item.id, Number(event.target.value), openQuantity)}
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

  const renderCheckoutPaymentControls = () => {
    const isMutationPending = checkoutMutation !== "idle";
    const checkoutStatus = isMutationPending
      ? "Speichert …"
      : checkoutOpenTotal === 0
        ? "Zahlung bestätigt – Tisch noch nicht geschlossen"
        : "Offen";

    return (
      <div className="kiju-checkout-controls">
        <div className="kiju-checkout-context">
          <strong>{selectedTable?.name ?? "Tisch"}</strong>
          <small>
            {checkoutSessions.length > 1
              ? `Verbundene Tische: ${checkoutSessions.map(({ table }) => table.name).join(", ")}`
              : "Einzeltisch"}
          </small>
        </div>
        <div className="kiju-checkout-status" role="status">
          <strong>{checkoutStatus}</strong>
          <small>
            {checkoutOpenTotal === 0
              ? "Der Abschluss bleibt eine eigene, bestätigte Aktion."
              : "Zahlung und Tischabschluss sind getrennt."
            }
          </small>
        </div>

        {paymentMethod === "cash" && checkoutOpenTotal > 0 ? (
          <div className="kiju-checkout-cash-grid">
            <label className="kiju-inline-field">
              <span>Gegeben</span>
              <input
                inputMode="decimal"
                type="text"
                value={cashReceivedInput}
                aria-label="Gegeben"
                disabled={isMutationPending}
                onChange={(event) => setCashReceivedInput(event.target.value)}
              />
            </label>
            <div className="kiju-checkout-cash-change">
              <span>Rückgeld</span>
              <strong>{euro(cashChangeCents)}</strong>
            </div>
          </div>
        ) : null}

        {paymentMethod === "cash" && checkoutOpenTotal > 0 && !cashPaymentValid ? (
          <p className="kiju-form-error">Der gegebene Betrag reicht nicht aus.</p>
        ) : null}

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
            <strong>{checkoutMode === "full" ? "Zahlung" : "Auswahl"}</strong>
            <span>{euro(activePaymentTotal)}</span>
            <small>
              {checkoutMode === "full"
                ? `${checkoutOpenQuantityTotal} offene Positionen`
                : `${selectedPaymentQuantityTotal}x in ${selectedPaymentLineItems.length} Einträgen`}
            </small>
          </div>
        </div>

        <div className="kiju-checkout-controls__actions">
          {checkoutMode === "full" ? (
            <div className="kiju-checkout-primary-actions">
              <button
                type="button"
                className="kiju-button kiju-button--primary"
                onClick={handleRecordFullPayment}
                disabled={
                  checkoutOpenTotal === 0 ||
                  fullPaymentLineItems.length === 0 ||
                  isMutationPending ||
                  !cashPaymentValid
                }
              >
                Zahlung erfassen ({euro(checkoutOpenTotal)})
              </button>
              <button
                type="button"
                className="kiju-button kiju-button--secondary"
                onClick={() => {
                  setCheckoutMode("partial");
                  setCashReceivedInput("");
                }}
                disabled={isMutationPending || checkoutOpenTotal === 0}
              >
                Teilzahlung / Storno
              </button>
            </div>
          ) : (
            <div className="kiju-checkout-partial-actions">
              <button
                type="button"
                className="kiju-button kiju-button--secondary"
                onClick={() => {
                  setCheckoutMode("full");
                  setCashReceivedInput("");
                }}
                disabled={isMutationPending}
              >
                Gesamtzahlung anzeigen
              </button>
              <button
                type="button"
                className="kiju-button kiju-button--primary"
                onClick={handleRecordPartialPayment}
                disabled={
                  selectedPaymentLineItems.length === 0 || isMutationPending || !cashPaymentValid
                }
              >
                Auswahl bezahlen ({euro(selectedPaymentTotal)})
              </button>
              <button
                type="button"
                className="kiju-button kiju-button--danger"
                onClick={handleRecordInvoiceCancellation}
                disabled={selectedPaymentLineItems.length === 0 || isMutationPending}
              >
                Auswahl stornieren ({euro(selectedPaymentTotal)})
              </button>
            </div>
          )}

          {checkoutOpenTotal === 0 ? (
            <div className="kiju-checkout-close-actions">
              <p>Bezahlt oder storniert. Der Tisch ist noch nicht geschlossen.</p>
              <button
                type="button"
                className="kiju-button kiju-button--danger"
                onClick={requestClosePaidOrder}
                disabled={isMutationPending}
              >
                Tisch schließen
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const renderReceiptPreviewPanel = (
    activeReceiptPreview: ReceiptPreviewState,
    isPinnedOverview: boolean
  ) => {
    const receiptPreviewDocument = buildReceiptPrintDocument(activeReceiptPreview.receipt);

    const receiptModeLabel =
      activeReceiptPreview.receiptMode === "full"
        ? "Gesamtbon"
        : activeReceiptPreview.receiptMode === "table"
          ? "Tisch-Bon"
          : "Teil-Bon";

    return (
      <section
        className={`kiju-receipt-preview-panel ${
          isPinnedOverview ? "is-overview" : "is-preview"
        }`}
        aria-label={isPinnedOverview ? "Bon-Übersicht" : "Bon-Vorschau"}
      >
        <div className="kiju-receipt-preview-panel__header">
          <div>
            <span className="kiju-eyebrow">
              {isPinnedOverview ? "Bon-Übersicht" : "Bon-Vorschau"}
            </span>
            <strong>{isPinnedOverview ? "Aktuelle Bon-Übersicht" : activeReceiptPreview.title}</strong>
            <small>
              {activeReceiptPreview.tableSummary} · {euro(activeReceiptPreview.receipt.gesamt)}
            </small>
          </div>
          <div className="kiju-receipt-preview-panel__meta">
            <StatusPill label={receiptModeLabel} tone="navy" />
            <StatusPill
              label={activeReceiptPreview.printMode === "reprint" ? "Reprint" : "Erstdruck"}
              tone="slate"
            />
          </div>
        </div>

        <ThermalReceiptPaper document={receiptPreviewDocument} />

        <div className="kiju-receipt-preview-panel__actions">
          {!isPinnedOverview ? (
            <button
              type="button"
              className="kiju-button kiju-button--secondary"
              onClick={() => setReceiptPreview(null)}
            >
              Zurück bearbeiten
            </button>
          ) : null}
          <button
            type="button"
            className="kiju-button kiju-button--primary"
            onClick={() => void handleReceiptPreviewPrint(activeReceiptPreview, !isPinnedOverview)}
          >
            Bon drucken
          </button>
        </div>
      </section>
    );
  };

  const renderPinnedReceiptOverviewPanel = () => {
    const pinnedReceiptOverview = buildReceiptPreviewState(
      checkoutTableIds.length > 1 ? "full" : "table",
      "receipt"
    );
    if (!pinnedReceiptOverview) return null;

    return renderReceiptPreviewPanel(pinnedReceiptOverview, true);
  };

  const renderReceiptDraftPreviewPanel = () =>
    receiptPreview ? renderReceiptPreviewPanel(receiptPreview, false) : null;

  const getCourseItemQuantity = (course: CourseKey) =>
    selectedSession?.items
      .filter((item) => item.category === course && !isOrderItemCanceled(item))
      .reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  const renderCourseCategoryGrid = () => (
    <div className="kiju-category-start">
      <div className="kiju-category-start__header">
        <span className="kiju-eyebrow">Bestellung</span>
        <strong>Kategorie wählen</strong>
      </div>
      <div className="kiju-course-choice-grid kiju-category-choice-grid" aria-label="Bestellkategorien">
        {orderStepSequence.map((course, index) => {
          const itemCount = getCourseItemQuantity(course);
          const ticketState = selectedSession ? resolveServiceCourseStatus(selectedSession, course) : null;

          return (
            <button
              key={course}
              type="button"
              className="kiju-course-choice kiju-category-choice"
              onClick={() => openCategoryDialog(course)}
            >
              <span className="kiju-category-choice__number">{index + 1}</span>
              <span className="kiju-category-choice__copy">
                <strong>{courseLabels[course]}</strong>
                <small>
                  {itemCount === 0
                    ? "Noch nichts erfasst"
                    : `${itemCount} ${itemCount === 1 ? "Position" : "Positionen"}`}
                </small>
              </span>
              <StatusPill
                label={ticketState ? formatCourseStatusLabel(ticketState, course) : "Bereit"}
                tone={
                  ticketState
                    ? getTicketStatusTone(ticketState.status, itemCount)
                    : "slate"
                }
              />
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderOrderOverview = () => (
    <div className="kiju-order-overview">
      <section className="kiju-order-overview__totals" aria-label="Bestellsumme">
        <div className="kiju-order-overview__totals-counts">
          <strong>{orderOverviewItemCount} Artikel gesamt</strong>
          <span>
            {orderOverviewSentQuantity} gesendet · {orderOverviewPendingQuantity} offen
          </span>
        </div>
        <strong className="kiju-order-overview__total-price">{euro(sessionTotal)}</strong>
        <StatusPill
          label={
            pendingOrderSendSummary.sentItemCount > 0
              ? `${pendingOrderSendSummary.sentItemCount} offen`
              : "Alles gesendet"
          }
          tone={pendingOrderSendSummary.sentItemCount > 0 ? "amber" : "green"}
        />
      </section>

      <section className="kiju-order-overview__items" aria-label="Bestellte Artikel">
        {orderOverviewLines.length === 0 ? (
          <div className="kiju-wizard-panel kiju-order-overview__empty">
            <strong>Noch keine Artikel erfasst</strong>
            <span>Tippe unten auf „Artikel hinzufügen“, um den ersten Artikel zu erfassen.</span>
          </div>
        ) : (
          orderOverviewLines.map((line, index) => {
            const lineId = `${line.productId}-${line.category}-${index}`;
            const pendingItem = line.pendingItemIds
              .map((itemId) => selectedSession?.items.find((item) => item.id === itemId))
              .find((item): item is OrderItem => Boolean(item));
            const representativeItem = line.itemIds
              .map((itemId) => selectedSession?.items.find((item) => item.id === itemId))
              .find((item): item is OrderItem => Boolean(item));
            const itemForDetails = pendingItem ?? representativeItem;
            const target = line.target;
            const targetLabel =
              target.type === "table"
                ? "Tisch"
                : selectedTable?.seats.find((seat) => seat.id === target.seatId)?.label ??
                  "Sitzplatz";
            const modifierLabels = itemForDetails
              ? resolveItemModifierLabels(itemForDetails, state.products)
              : [];
            const lineDetails = [
              target.type === "table" ? null : targetLabel,
              ...modifierLabels,
              line.note ? `Notiz: ${line.note}` : null
            ]
              .filter(Boolean)
              .join(" · ");
            const courseStatus = selectedSession
              ? resolveServiceCourseStatus(selectedSession, line.category)
              : null;
            const sentStatusLabel =
              courseStatus?.status === "not-recorded"
                ? line.category === "drinks"
                  ? "An Bar gesendet"
                  : "An Küche gesendet"
                : formatCourseStatusLabel(courseStatus, line.category);
            const statusLabel = line.canceled
              ? "Storniert"
              : line.serviceBooked
              ? "Service gebucht"
              : line.pendingQuantity > 0
                ? line.sentQuantity > 0
                  ? `${line.pendingQuantity} offen · ${formatCourseStatusLabel(courseStatus, line.category)}`
                  : `Noch nicht an ${line.pendingTarget === "bar" ? "Bar" : "Küche"} gesendet`
                : sentStatusLabel;
            const statusTone = line.canceled
              ? "is-canceled"
              : line.pendingQuantity > 0
              ? "is-pending"
              : line.serviceBooked
                ? "is-booked"
                : courseStatus?.status === "completed" || courseStatus?.status === "delivered"
                  ? "is-complete"
                  : "is-sent";
            const isEditing = editingOverviewLineId === lineId;
            const product = pendingItem ? getProductById(state.products, pendingItem.productId) : undefined;
            const supportsExtraIngredients = product?.supportsExtraIngredients === true;
            const extraIngredientLabels = pendingItem
              ? resolveExtraIngredientLabels(pendingItem, product, extraIngredientsCatalog)
              : [];

            return (
              <article
                key={lineId}
                className={`kiju-order-overview__item ${statusTone}`}
              >
                <div className="kiju-order-overview__item-row">
                  <div className="kiju-order-overview__item-main">
                    <strong>{line.quantity}× {resolveProductName(state.products, line.productId)}</strong>
                    <span className={`kiju-order-overview__item-status ${statusTone}`}>
                      {statusLabel}
                    </span>
                    {lineDetails ? <small>{lineDetails}</small> : null}
                  </div>
                  <div className="kiju-order-overview__item-actions">
                    <strong className="kiju-order-overview__item-price">{euro(line.totalCents)}</strong>
                    {pendingItem ? (
                      <button
                        type="button"
                        className="kiju-order-overview__item-edit"
                        onClick={() => setEditingOverviewLineId(isEditing ? null : lineId)}
                        aria-expanded={isEditing}
                      >
                        {isEditing ? "Fertig" : "Bearbeiten"}
                      </button>
                    ) : null}
                  </div>
                </div>

                {isEditing && pendingItem ? (
                  <div className="kiju-order-overview__item-editor">
                    <div className="kiju-order-overview__item-editor-actions">
                      <span>Menge</span>
                      <button
                        type="button"
                        className="kiju-button kiju-button--secondary"
                        onClick={() => handleOverviewPendingQuantityChange(pendingItem, -1)}
                        disabled={pendingItem.quantity <= 1}
                        aria-label="Menge verringern"
                      >
                        <Minus size={14} />
                      </button>
                      <strong>{pendingItem.quantity}</strong>
                      <button
                        type="button"
                        className="kiju-button kiju-button--secondary"
                        onClick={() => handleOverviewPendingQuantityChange(pendingItem, 1)}
                        aria-label="Menge erhöhen"
                      >
                        <Plus size={14} />
                      </button>
                      {supportsExtraIngredients ? (
                        <button
                          type="button"
                          className="kiju-button kiju-button--secondary"
                          onClick={() => handleOpenExtraIngredientsDialog(pendingItem)}
                        >
                          <Plus size={14} />
                          Extra
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="kiju-button kiju-button--danger"
                        onClick={() => handleOverviewPendingRemoval(pendingItem)}
                      >
                        <Trash2 size={14} />
                        Löschen
                      </button>
                    </div>
                    <label className="kiju-order-overview__item-note">
                      <span>Notiz</span>
                      <input
                        name={`overview-item-note-${pendingItem.id}`}
                        value={pendingItem.note ?? ""}
                        onChange={(event) => {
                          if (!selectedTable) return;
                          actions.updateItem(selectedTable.id, pendingItem.id, {
                            note: event.target.value
                          });
                        }}
                        placeholder="Zum Beispiel ohne Zwiebeln"
                      />
                    </label>
                    {extraIngredientLabels.length > 0 ? (
                      <small className="kiju-order-overview__item-extra">
                        Extra: {extraIngredientLabels.join(", ")}
                      </small>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </section>

      <section
        id="kiju-order-overview-add"
        className="kiju-order-overview__add"
        aria-label="Artikel hinzufügen"
      >
        {showOrderAddOptions ? renderCourseCategoryGrid() : null}
      </section>
    </div>
  );

  const renderCategoryGroupSelection = () => (
    <section className="kiju-wizard-panel kiju-category-group-stage">
      <div className="kiju-wizard-panel__header">
        <div>
          <span className="kiju-eyebrow">{courseLabels[activeCourse]}</span>
          <strong>Unterkategorie wählen</strong>
        </div>
        <StatusPill
          label={formatCourseStatusLabel(activeCourseTicketState, activeCourse)}
          tone={
            activeCourseTicketState
              ? getTicketStatusTone(activeCourseTicketState.status, activeCourseItemCount)
              : "slate"
          }
        />
      </div>
      <div className="kiju-category-group-grid" aria-label="Unterkategorien">
        {activeCourseGroups.map((group) => {
          const productCount = group.products.length;

          return (
            <button
              key={group.label}
              type="button"
              className="kiju-category-group-choice"
              onClick={() => openCategoryProductGroup(group.label)}
            >
              <span>{group.label}</span>
              <strong>
                {productCount === 0
                  ? "Keine Artikel"
                  : `${productCount} ${productCount === 1 ? "Artikel" : "Artikel"}`}
              </strong>
            </button>
          );
        })}
      </div>
    </section>
  );

  const renderActiveCourseProductSelection = () => {
    if (!selectedTable) return null;

    return (
      <section className="kiju-wizard-panel kiju-category-product-stage">
        <div className="kiju-wizard-panel__header">
          <div>
            <span className="kiju-eyebrow">{courseLabels[activeCourse]}</span>
            <strong>{selectedCourseGroup}</strong>
          </div>
          <StatusPill
            label={`${categoryDialogNewItems.length} neu ausgewählt`}
            tone={categoryDialogNewItems.length > 0 ? "green" : "slate"}
          />
        </div>
        <div className="kiju-product-grid">
          {categoryDialogProducts.length > 0 ? (
            categoryDialogProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                className={`kiju-product-card${addedProductFeedback?.productId === product.id ? " is-added" : ""}`}
                data-add-token={addedProductFeedback?.productId === product.id ? addedProductFeedback.token : undefined}
                onClick={() => handleProductAdd(product.id)}
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
    );
  };

  const renderCategoryReview = () => (
    <section className="kiju-wizard-panel kiju-order-editor kiju-category-review-stage">
      <div className="kiju-order-editor__header">
        <div>
          <span className="kiju-eyebrow">{selectedTargetLabel}</span>
          <strong>Abschluss ({editableItems.length})</strong>
        </div>
        <StatusPill label={syncStatusLabel} tone={syncStatusTone} />
      </div>
      <div className="kiju-order-editor__list">
        {renderCategoryDialogReviewItems()}
      </div>
    </section>
  );

  const renderCategoryDialogContent = () => {
    if (categoryDialogStage === "groups") return renderCategoryGroupSelection();
    if (categoryDialogStage === "products") return renderActiveCourseProductSelection();

    return renderCategoryReview();
  };

  const renderCategoryDialogFooter = () => {
    if (categoryDialogStage === "groups") {
      return (
        <button
          type="button"
          className="kiju-button kiju-button--secondary"
          onClick={closeCategoryDialog}
        >
          Zurück
        </button>
      );
    }

    if (categoryDialogStage === "products") {
      return (
        <div className="kiju-category-order-footer__actions">
          <button
            type="button"
            className="kiju-button kiju-button--secondary"
            onClick={() => setCategoryDialogStage("groups")}
          >
            Zurück
          </button>
          <button
            type="button"
            className="kiju-button kiju-button--primary"
            onClick={closeCategoryDialog}
          >
            Abschließen
          </button>
        </div>
      );
    }

    return (
      <div className="kiju-category-order-footer__actions">
        <button
          type="button"
          className="kiju-button kiju-button--secondary"
          onClick={() => setCategoryDialogStage("products")}
        >
          Zurück zur Auswahl
        </button>
        <button
          type="button"
          className="kiju-button kiju-button--primary"
          onClick={closeCategoryDialog}
        >
          Fertig
        </button>
      </div>
    );
  };

  const renderCourseWaitPanel = () =>
    waitPlannerOpen ? (
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
    ) : null;

  const renderActiveCategoryDialog = () => {
    if (!selectedTable || !activeCategoryDialog || currentStep !== activeCategoryDialog) return null;

    return (
      <section
        className="kiju-service-section kiju-order-wizard-overlay kiju-category-order-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kiju-category-dialog-title"
      >
        <div className="kiju-order-wizard-modal kiju-category-order-modal" tabIndex={-1}>
          <header className="kiju-category-order-header">
            <div>
              <span className="kiju-eyebrow">{selectedTable.name}</span>
              <h2 id="kiju-category-dialog-title">{courseLabels[activeCategoryDialog]}</h2>
              <p>
                {linkedTableGroup ? `Gemeinsame Abrechnung: ${linkedTableGroup.label}` : selectedTargetLabel}
                {" · "}
                {categoryDialogStage === "groups"
                  ? "Unterkategorie wählen"
                  : categoryDialogStage === "products"
                    ? selectedCourseGroup
                    : "Abschluss"}
              </p>
            </div>
            <button
              type="button"
              className="kiju-button kiju-button--secondary"
              onClick={openOrderOverviewForSelectedTable}
            >
              <X size={16} />
              Schließen
            </button>
          </header>

          <div className="kiju-category-order-body">
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

            {renderCategoryDialogContent()}

            {categoryDialogStage === "review" ? renderCourseWaitPanel() : null}

            {categoryDialogStage === "review" ? (
              <div className="kiju-step-actions kiju-wizard-service-actions kiju-category-order-actions">
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
            ) : null}
          </div>

          <div className="kiju-wizard-footer kiju-category-order-footer">
            {renderCategoryDialogFooter()}
          </div>
        </div>
      </section>
    );
  };

  return (
    <RouteGuard allowedRoles={["waiter", "bar", "admin"]}>
      <main className="kiju-page">
        <header className="kiju-topbar">
          <div>
            <span className="kiju-eyebrow">Kellner-Dashboard</span>
            <h1>Gastro KiJu</h1>
            <p>
              Tisch auswählen und Bestellung, Service und Abrechnung direkt im Arbeitsbereich bearbeiten.
            </p>
          </div>
          <div className="kiju-topbar-actions">
            <div className="kiju-operational-status" aria-live="polite">
              <StatusPill label={syncStatusLabel} tone={syncStatusTone} />
              <small>{formatSyncTime(serverConnection.lastSyncedAt)}</small>
            </div>
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
              handoverStatusLabel={
                selectedSession
                  ? selectedServiceNames.length > 0
                    ? selectedServiceNames.join(", ")
                    : "freigegeben"
                  : "kein Tisch"
              }
              handoverStatusTone={selectedSession ? "navy" : "slate"}
              handoverTargetUserId={handoverTargetUserId}
              handoverTargetUsers={handoverTargetUsers}
              onHandoverTargetUserChange={setHandoverTargetUserId}
              onHandoverService={handleHandoverService}
              onReleaseService={handleReleaseService}
              canUndoLastServiceHandover={canUndoServiceHandover}
              onUndoLastServiceHandover={handleUndoServiceHandover}
              canAddServiceUser={Boolean(selectedSession)}
              supportUserId={supportUserId}
              supportTargetUsers={supportTargetUsers}
              onSupportUserChange={setSupportUserId}
              onAddServiceUser={handleAddServiceUser}
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

        {!isWaiterView ? (
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

          {isWaiterView && currentStep === "table" && !isOrderWizardOpen ? (
          <section className="kiju-waiter-room-map" aria-label="Tischübersicht und Tischwahl">
            <header className="kiju-waiter-room-map__header">
              <div>
                <span className="kiju-eyebrow">Tischübersicht</span>
                <h2>Tisch auswählen</h2>
                <p>Freie und belegte Tische erkennst du sofort.</p>
              </div>
              <div className="kiju-waiter-room-map__legend" aria-label="Bereiche">
                <span className="kiju-waiter-room-map__legend-item kiju-waiter-room-map__legend-item--inside">
                  Innen
                </span>
                <span className="kiju-waiter-room-map__legend-item kiju-waiter-room-map__legend-item--outside">
                  Draußen
                </span>
              </div>
            </header>

            <div className="kiju-waiter-availability-summary" aria-label="Tischbelegung">
              <div className="kiju-waiter-availability-summary__item kiju-waiter-availability-summary__item--free">
                <strong>{freeTableCount}</strong>
                <span>Frei</span>
              </div>
              <div className="kiju-waiter-availability-summary__item kiju-waiter-availability-summary__item--occupied">
                <strong>{occupiedTableCount}</strong>
                <span>Belegt</span>
              </div>
              <div className="kiju-waiter-availability-summary__hint">
                <span>Belegt bedeutet: Es gibt eine aktive Bestellung.</span>
              </div>
            </div>

            <div className="kiju-waiter-table-status-grid" aria-label="Status aller Tische">
              {waiterMenuEntries.map((entry) => {
                const isPickup = isPickupTableEntry(entry.table);
                const isOccupied = entry.availability === "occupied";
                const entrySession = getSessionForTable(state.sessions, entry.table.id);
                const entryItemCount =
                  entrySession?.items
                    .filter((item) => !isOrderItemCanceled(item))
                    .reduce((sum, item) => sum + item.quantity, 0) ?? 0;
                const statusText = isOccupied
                  ? statusLabel[entry.status] ?? "Bestellung offen"
                  : entry.table.plannedOnly
                    ? "Geplant"
                    : "Bereit für neue Gäste";
                const availabilityText = entry.table.plannedOnly
                  ? "Geplant"
                  : availabilityLabel[entry.availability];
                const availabilityStatusTone = entry.table.plannedOnly
                  ? "slate"
                  : availabilityTone[entry.availability];

                return (
                  <article
                    key={`status-${entry.table.id}`}
                    className={`kiju-waiter-table-card kiju-waiter-table-card--${entry.availability}${
                      entry.table.plannedOnly ? " kiju-waiter-table-card--planned" : ""
                    }${
                      isPickup ? " kiju-waiter-table-card--pickup" : ""
                    }${entry.table.id === selectedTableId ? " is-selected" : ""}`}
                  >
                    <button
                      type="button"
                      className="kiju-waiter-table-card__select"
                      onClick={() => selectTable(entry.table.id)}
                      aria-label={`${entry.table.name}: ${availabilityLabel[entry.availability]} auswählen`}
                    >
                      <span className="kiju-waiter-table-card__number">
                        {getTableNumberLabel(entry.table)}
                      </span>
                      <span className="kiju-waiter-table-card__copy">
                        <strong>{entry.table.name}</strong>
                        <small>
                          {statusText} · {entryItemCount} Artikel · {euro(entry.total)}
                        </small>
                      </span>
                      <StatusPill
                        label={availabilityText}
                        tone={availabilityStatusTone}
                      />
                    </button>
                    {isPickup ? (
                      <div className="kiju-waiter-table-card__pickup-actions">
                        {isOccupied ? (
                          <small>Erst abschließen, dann entfernen.</small>
                        ) : null}
                        <button
                          type="button"
                          className="kiju-button kiju-button--danger"
                          onClick={() => void handleArchivePickupTable(entry.table.id)}
                          disabled={isOccupied}
                        >
                          Abholtisch entfernen
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>

          </section>
        ) : null}

          {isWaiterView && currentStep === "table" && !isOrderWizardOpen ? (
          <section className="kiju-waiter-table-toolbar" aria-label="Weitere Tischaktionen">
            <div className="kiju-step-actions">
                <button
                  type="button"
                  className="kiju-button kiju-button--primary"
                  onClick={openPickupNameDialog}
                >
                  <ShoppingBag size={18} />
                  Abholbon erstellen
                </button>
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
          </section>
        ) : null}

        <div className={`kiju-workspace ${isWaiterView ? "kiju-workspace--waiter" : ""}`}>
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
                          <StatusPill label="Barzahlung" tone="navy" />
                        </div>
                        {renderCheckoutPaymentControls()}
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
                            onClick={() => openReceiptCheck("full")}
                            disabled={!canPreviewFullReceipt}
                          >
                            Gesamtbon prüfen
                          </button>
                          <button
                            type="button"
                            className="kiju-button kiju-button--secondary"
                            onClick={() => openReceiptCheck("table")}
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

                      {renderPinnedReceiptOverviewPanel()}
                      {renderReceiptDraftPreviewPanel()}
                    </div>
                  </div>
                ) : currentStep === "overview" ? (
                  renderOrderOverview()
                ) : (
                  renderCourseCategoryGrid()
                )}

              </div>

              <div
                className={`kiju-wizard-footer kiju-wizard-footer--simple${
                  currentStep === "overview" ? " kiju-wizard-footer--overview" : ""
                }`}
              >
                <button
                  type="button"
                  className="kiju-button kiju-button--secondary"
                  onClick={currentStep === "checkout" ? goBack : closeOrderWizard}
                >
                  {currentStep === "checkout" ? "Zurück" : "Zurück zur Tischauswahl"}
                </button>
                <div className="kiju-wizard-footer__actions">
                  {currentStep === "overview" ? (
                    <>
                      <button
                        type="button"
                        className="kiju-button kiju-button--primary"
                        onClick={() => {
                          setShowOrderAddOptions(true);
                          window.requestAnimationFrame(() => {
                            document.getElementById("kiju-order-overview-add")?.scrollIntoView({
                              behavior: "smooth",
                              block: "start"
                            });
                          });
                        }}
                      >
                        <Plus size={18} />
                        Artikel hinzufügen
                      </button>
                      <button
                        type="button"
                        className="kiju-button kiju-button--secondary"
                        onClick={() => void handleSendAllPendingItems()}
                        disabled={pendingOrderSendSummary.sentItemCount === 0 || isSendPending}
                      >
                        <ChefHat size={18} />
                        {isSendPending ? "Wird gesendet …" : "Alles senden"}
                      </button>
                      <button
                        type="button"
                        className="kiju-button kiju-button--secondary"
                        onClick={() => setCurrentStep("checkout")}
                        disabled={checkoutSessions.length === 0}
                      >
                        <Receipt size={18} />
                        Abrechnen
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
          ) : null}

          {renderActiveCategoryDialog()}

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
                        Tischauswahl
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
                          {renderCheckoutPaymentControls()}
                        </SectionCard>

                        <SectionCard title="Gesamt-, Tisch- und Teilbon" eyebrow="Bons">
                          <button
                            className="kiju-button kiju-button--secondary"
                            onClick={() => openReceiptCheck("full")}
                            disabled={!canPreviewFullReceipt}
                          >
                            Gesamtbon prüfen
                          </button>
                          <button
                            className="kiju-button kiju-button--secondary"
                            onClick={() => openReceiptCheck("table")}
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

                        {renderPinnedReceiptOverviewPanel()}
                        {renderReceiptDraftPreviewPanel()}
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
                              type="button"
                              className={`kiju-product-card${
                                addedProductFeedback?.productId === product.id ? " is-added" : ""
                              }`}
                              data-add-token={
                                addedProductFeedback?.productId === product.id
                                  ? addedProductFeedback.token
                                  : undefined
                              }
                              onClick={() => handleProductAdd(product.id)}
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
                              ? getTicketStatusTone(activeCourseTicketState.status, activeCourseItemCount)
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
                  {currentStep !== "checkout" ? (
                    <button
                      type="button"
                      className="kiju-button kiju-button--primary"
                      onClick={goNext}
                      disabled={!canGoNext}
                    >
                      {nextButtonLabel}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </SectionCard>
          </section>
          ) : null}

          {!isWaiterView ? (
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
                            tone={getTicketStatusTone(entry.status, entry.itemCount)}
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

        {isCloseOrderConfirmOpen && selectedTable ? (
          <section
            className="kiju-service-section kiju-order-wizard-overlay kiju-close-order-confirm-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="kiju-close-order-confirm-title"
          >
            <div
              id="kiju-close-order-confirm-dialog"
              className="kiju-table-action-dialog kiju-close-order-confirm-dialog"
              tabIndex={-1}
            >
              <div>
                <span className="kiju-eyebrow">Letzte Prüfung</span>
                <h2 id="kiju-close-order-confirm-title">Tisch wirklich schließen?</h2>
                <p>
                  Der offene Betrag ist 0,00 €. Der Tisch wird aus dem laufenden Service genommen.
                  Die Zahlung bleibt unabhängig davon im Serverstand gespeichert.
                </p>
              </div>
              <div className="kiju-table-action-summary">
                <div>
                  <span>Tisch</span>
                  <strong>{selectedTable.name}</strong>
                </div>
                <div>
                  <span>Offener Rest</span>
                  <strong>{euro(checkoutOpenTotal)}</strong>
                </div>
              </div>
              {checkoutTableIds.length > 1 ? (
                <p className="kiju-close-order-confirm-dialog__linked">
                  Achtung: Dieser Abschluss betrifft {checkoutTableIds.length} gekoppelte Tische.
                </p>
              ) : null}
              <div className="kiju-close-order-confirm-dialog__actions">
                <button
                  type="button"
                  className="kiju-button kiju-button--secondary"
                  onClick={cancelClosePaidOrder}
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  className="kiju-button kiju-button--danger"
                  onClick={confirmClosePaidOrder}
                  disabled={checkoutMutation !== "idle" || checkoutOpenTotal > 0}
                >
                  Ja, Tisch schließen
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {invoiceCancellationConfirm ? (
          <section
            className="kiju-service-section kiju-order-wizard-overlay kiju-close-order-confirm-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="kiju-invoice-cancellation-confirm-title"
          >
            <div
              id="kiju-invoice-cancellation-confirm-dialog"
              className="kiju-table-action-dialog kiju-close-order-confirm-dialog"
              tabIndex={-1}
            >
              <div>
                <span className="kiju-eyebrow">Teilzahlung / Storno</span>
                <h2 id="kiju-invoice-cancellation-confirm-title">Auswahl wirklich stornieren?</h2>
                <p>
                  Das Storno wird erst nach der Serverbestätigung wirksam und reduziert den offenen
                  Betrag nicht durch eine Zahlung.
                </p>
              </div>
              <div className="kiju-table-action-summary">
                <div>
                  <span>Positionen</span>
                  <strong>{invoiceCancellationConfirm.quantity}</strong>
                </div>
                <div>
                  <span>Betrag</span>
                  <strong>{euro(invoiceCancellationConfirm.amountCents)}</strong>
                </div>
              </div>
              <div className="kiju-close-order-confirm-dialog__actions">
                <button
                  type="button"
                  className="kiju-button kiju-button--secondary"
                  onClick={() => setInvoiceCancellationConfirm(null)}
                  disabled={checkoutMutation !== "idle"}
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  className="kiju-button kiju-button--danger"
                  onClick={() => void confirmInvoiceCancellation()}
                  disabled={checkoutMutation !== "idle"}
                >
                  Ja, Auswahl stornieren
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {extraIngredientsItem && selectedTable ? (
          <section
            className="kiju-service-section kiju-order-wizard-overlay kiju-extra-ingredients-overlay"
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

        {isPickupNameDialogOpen ? (
          <section
            className="kiju-service-section kiju-order-wizard-overlay kiju-pickup-name-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="kiju-pickup-name-title"
          >
            <form
              className="kiju-pickup-name-dialog"
              onSubmit={(event) => {
                event.preventDefault();
                if (pickupNameDraft.trim()) void handleCreatePickupTable(pickupNameDraft);
              }}
            >
              <div>
                <span className="kiju-eyebrow">Abholung</span>
                <h2 id="kiju-pickup-name-title">Abholbon erstellen</h2>
                <p>Wie heißt die Person, die die Bestellung abholt?</p>
              </div>
              <label className="kiju-pickup-name-field" htmlFor="kiju-pickup-name">
                <span>Name der abholenden Person</span>
                <input
                  id="kiju-pickup-name"
                  name="pickup-name"
                  type="text"
                  value={pickupNameDraft}
                  maxLength={60}
                  autoComplete="name"
                  required
                  onChange={(event) => setPickupNameDraft(event.target.value)}
                />
              </label>
              <div className="kiju-pickup-name-dialog__actions">
                <button
                  type="button"
                  className="kiju-button kiju-button--secondary"
                  onClick={() => setIsPickupNameDialogOpen(false)}
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="kiju-button kiju-button--primary"
                  disabled={!pickupNameDraft.trim()}
                >
                  Abholbon erstellen
                </button>
              </div>
            </form>
          </section>
        ) : null}
      </main>
    </RouteGuard>
  );
};


