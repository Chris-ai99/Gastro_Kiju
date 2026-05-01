"use client";

import {
  EXTRA_INGREDIENTS_MODIFIER_GROUP_ID,
  calculatePaidItemQuantity,
  calculateGuestCount,
  calculateLineItemsTotal,
  calculateSessionBillableTotal,
  calculateSessionOpenTotal,
  calculateSessionTotal,
  courseLabels,
  createDefaultOperationalState as createSeedOperationalState,
  euro,
  getCheckoutTableIds,
  getLinkedTableGroupForTable,
  getOpenLineItems,
  getProductById,
  getSessionForTable,
  isOrderItemCanceled,
  normalizeOperationalState,
  type AppNotification,
  type AppState,
  type CourseKey,
  type CourseTicket,
  type DesignMode,
  type ExtraIngredient,
  type KitchenStatus,
  type KitchenTicketBatch,
  type KitchenUnitState,
  type KitchenUnitStatus,
  type OrderItem,
  type OrderTarget,
  type OrderSession,
  type PaymentLineItem,
  type PaymentMethod,
  type Product,
  type ProductCategory,
  type ProductionTarget,
  type Role,
  type ServiceOrderMode,
  type TableLayout,
  type UserAccount
} from "@kiju/domain";
import { kitchenRules } from "@kiju/config";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren
} from "react";

import { createPrintJob } from "./print-client";

const STORAGE_KEY = "kiju-app-state-v2";
const AUTH_KEY = "kiju-auth-session-v1";
const LEGACY_AUTH_KEY = "kiju-auth-v2";
const NOTIFICATION_READS_KEY = "kiju-notification-reads-v1";
const NOTIFICATION_DEVICE_KEY = "kiju-notification-device-v1";
const SHARED_SYNC_POLL_MS = 1000;
const SHARED_SYNC_REQUEST_TIMEOUT_MS = 2500;

type SharedSyncState = {
  status: "connecting" | "online" | "offline";
  lastSyncedAt?: string;
  usingSharedState: boolean;
};

type WorkspaceRole = Role;

type DemoActions = {
  login: (identifier: string, secret: string) => {
    ok: boolean;
    user?: UserAccount;
    message?: string;
  };
  startWorkspaceSession: (role: WorkspaceRole, name?: string) => {
    ok: boolean;
    user?: UserAccount;
    message?: string;
  };
  logout: () => void;
  addItem: (tableId: string, target: OrderTarget, productId: string) => void;
  updateItem: (
    tableId: string,
    itemId: string,
    patch: Partial<Pick<OrderSession["items"][number], "target" | "quantity" | "note">>
  ) => void;
  removeItem: (tableId: string, itemId: string) => void;
  skipCourse: (tableId: string, course: CourseKey) => void;
  setCourseWait: (
    tableId: string,
    course: CourseKey,
    minutes: number
  ) => { ok: boolean; message?: string };
  sendCourseToKitchen: (
    tableId: string,
    course: CourseKey
  ) => { ok: boolean; message?: string; ticketStatus?: CourseTicket["status"] | "ready" };
  cycleKitchenItemUnitStatus: (
    tableId: string,
    batchId: string,
    itemId: string,
    unitIndex: number
  ) => void;
  reopenKitchenBatch: (tableId: string, batchId: string) => void;
  releaseCourse: (tableId: string, course: CourseKey, batchId?: string) => void;
  markCourseCompleted: (tableId: string, course: CourseKey, batchId?: string) => void;
  printReceipt: (tableId: string, sessionIds?: string[]) => void;
  reprintReceipt: (tableId: string, sessionIdOrIds?: string | string[]) => void;
  closeOrder: (tableId: string, method: PaymentMethod) => void;
  closePaidOrder: (tableId: string) => { ok: boolean; message?: string };
  recordPartialPayment: (
    tableIds: string[],
    selectedLineItems: PaymentLineItem[],
    method: PaymentMethod,
    label?: string
  ) => { ok: boolean; message?: string };
  recordInvoiceCancellation: (
    tableIds: string[],
    selectedLineItems: PaymentLineItem[],
    label?: string
  ) => { ok: boolean; message?: string };
  createPartyGroup: (tableId: string, label: string) => { ok: boolean; message?: string };
  updatePartyGroup: (tableId: string, groupId: string, label: string) => { ok: boolean; message?: string };
  deletePartyGroup: (tableId: string, groupId: string) => { ok: boolean; message?: string };
  assignItemsToPartyGroup: (
    tableId: string,
    groupId: string,
    itemIds: string[]
  ) => { ok: boolean; message?: string };
  linkTables: (tableIds: string[], label?: string) => { ok: boolean; message?: string };
  unlinkTables: (groupId: string) => { ok: boolean; message?: string };
  createProduct: (input: {
    name: string;
    description: string;
    category: ProductCategory;
    drinkSubcategory?: string;
    priceCents: number;
    taxRate: number;
    productionTarget: ProductionTarget;
    supportsExtraIngredients?: boolean;
  }) => { ok: boolean; message?: string };
  updateProduct: (productId: string, patch: Partial<Product>) => void;
  createExtraIngredient: (input: {
    name: string;
    priceDeltaCents: number;
  }) => { ok: boolean; message?: string };
  updateExtraIngredient: (
    ingredientId: string,
    patch: Partial<Pick<ExtraIngredient, "name" | "priceDeltaCents" | "active">>
  ) => void;
  setItemExtraIngredients: (tableId: string, itemId: string, ingredientIds: string[]) => void;
  deleteProduct: (productId: string) => { ok: boolean; message?: string };
  deleteSession: (sessionId: string) => { ok: boolean; message?: string };
  createUser: (input: {
    name: string;
    username: string;
    role: Role;
    password: string;
    pin?: string;
  }) => { ok: boolean; message?: string };
  updateUser: (userId: string, patch: Partial<UserAccount>) => { ok: boolean; message?: string };
  deleteUser: (userId: string) => { ok: boolean; message?: string };
  createTable: (input: {
    name?: string;
    seatCount: number;
    active: boolean;
    note?: string;
  }) => { ok: boolean; message?: string };
  updateTable: (
    tableId: string,
    patch: Partial<Pick<TableLayout, "name" | "note" | "active" | "plannedOnly">>
  ) => void;
  setServiceOrderMode: (mode: ServiceOrderMode) => void;
  setDesignMode: (mode: DesignMode) => void;
  setSeatVisible: (tableId: string, seatId: string, visible: boolean) => void;
  toggleTableActive: (tableId: string) => void;
  resetDailyState: () => { ok: boolean; closedSessions: number; message?: string };
  undoDailyStateReset: () => { ok: boolean; message?: string };
  resetDemoState: () => void;
  removeTableAndServices: (tableId: string) => { ok: boolean; message?: string };
  markNotificationRead: (
    notificationId: string,
    scope?: "local" | "shared" | "shared-dismiss"
  ) => void;
  markNotificationsRead: (notificationIds: string[], scope?: "local") => void;
};

type DemoContextValue = {
  hydrated: boolean;
  state: AppState;
  currentUser?: UserAccount;
  unreadNotifications: AppNotification[];
  sharedSync: SharedSyncState;
  actions: DemoActions;
};

type SharedStateSnapshot = {
  version: number;
  updatedAt: string;
  state: AppState;
};

type LocalNotificationReadState = Record<string, string[]>;

const DemoContext = createContext<DemoContextValue | null>(null);

const serviceCourseOrder: CourseKey[] = ["drinks", "starter", "main", "dessert"];
const kitchenCourseOrder: CourseKey[] = ["starter", "main", "dessert"];
const tablePlacements = [
  { x: 63, y: 60, width: 15, height: 20 },
  { x: 78, y: 60, width: 15, height: 20 },
  { x: 58, y: 43, width: 18, height: 15 },
  { x: 46, y: 32, width: 16, height: 14 },
  { x: 33, y: 27, width: 14, height: 13 },
  { x: 18, y: 27, width: 14, height: 13 },
  { x: 45, y: 49, width: 16, height: 13 }
] as const;
const createSystemUsers = (): UserAccount[] => {
  const now = new Date().toISOString();

  return [
    {
      id: "user-admin",
      name: "System Admin",
      username: "Admin",
      role: "admin",
      password: "Admin1234",
      active: true,
      lastSeenAt: now
    },
    {
      id: "user-waiter-1",
      name: "Service",
      username: "Service",
      role: "waiter",
      password: "Service1234",
      pin: "1234",
      active: true,
      lastSeenAt: now
    },
    {
      id: "user-kitchen",
      name: "Küche",
      username: "Kueche",
      role: "kitchen",
      password: "Kitchen1234",
      pin: "2026",
      active: true,
      lastSeenAt: now
    },
    {
      id: "user-bar",
      name: "Bar",
      username: "Bar",
      role: "bar",
      password: "Bar1234",
      pin: "3030",
      active: true,
      lastSeenAt: now
    }
  ];
};

const createFreshOperationalState = (): AppState => normalizeAppState(createSeedOperationalState());
const createDefaultOperationalState = (): AppState => createSeedOperationalState();
const createClientId = (prefix: string) => {
  const nativeCrypto = globalThis.crypto;
  if (nativeCrypto && typeof nativeCrypto.randomUUID === "function") {
    return `${prefix}-${nativeCrypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

const normalizeLookupText = (value: string) => value.trim().toLocaleLowerCase("de-DE");

const createUsernameFromName = (value: string) => {
  const asciiValue = value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const compactValue = asciiValue.replace(/[^\p{Letter}\p{Number}]+/gu, "");
  return compactValue.slice(0, 24) || "service";
};

const createSeats = (tableId: string, seatCount: number) =>
  Array.from({ length: seatCount }, (_, index) => ({
    id: `${tableId}-seat-${index + 1}`,
    label: `P${index + 1}`,
    visible: true
  }));
const floorplanSeatOverrides: Partial<Record<TableLayout["id"], number>> = {
  "table-1": 5,
  "table-2": 5,
  "table-3": 5,
  "table-4": 5,
  "table-5": 4,
  "table-6": 5
};
const normalizeSeatList = (
  tableId: string,
  seatCount: number,
  existingSeats: TableLayout["seats"]
) =>
  Array.from({ length: seatCount }, (_, index) => {
    const seatId = `${tableId}-seat-${index + 1}`;
    const existingSeat = existingSeats.find((seat) => seat.id === seatId);

    return {
      id: seatId,
      label: existingSeat?.label ?? `P${index + 1}`,
      visible: existingSeat?.visible ?? true
    };
  });
const normalizeFloorplanTables = (appState: AppState) => {
  let hasChanges = false;
  const tables = appState.tables.map((table) => {
    const requiredSeatCount = floorplanSeatOverrides[table.id];
    const isMenuOnlySafetyTable = table.id === "table-7";

    const shouldNormalizeSeatCount =
      requiredSeatCount !== undefined &&
      (table.seatCount < requiredSeatCount || table.seats.length < requiredSeatCount);

    const shouldNormalizeSafetyTable =
      isMenuOnlySafetyTable &&
      (table.name !== "Sicherheitstisch 7" ||
        table.note !== "Nur über das Menü auswählbar" ||
        table.active ||
        !table.plannedOnly);

    if (!shouldNormalizeSeatCount && !shouldNormalizeSafetyTable) {
      return table;
    }

    hasChanges = true;
    return {
      ...table,
      name: isMenuOnlySafetyTable ? "Sicherheitstisch 7" : table.name,
      note: isMenuOnlySafetyTable ? "Nur über das Menü auswählbar" : table.note,
      active: isMenuOnlySafetyTable ? false : table.active,
      plannedOnly: isMenuOnlySafetyTable ? true : table.plannedOnly,
      seatCount: shouldNormalizeSeatCount && requiredSeatCount ? requiredSeatCount : table.seatCount,
      seats:
        shouldNormalizeSeatCount && requiredSeatCount
          ? normalizeSeatList(table.id, requiredSeatCount, table.seats)
          : table.seats
    };
  });

  return hasChanges ? { ...appState, tables } : appState;
};
const normalizeAppState = (appState: AppState) =>
  normalizeFloorplanTables(normalizeOperationalState(appState));
const normalizePublicBasePath = (value?: string) => {
  if (!value) return "";

  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";

  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
};
const getNextTableNumber = (tables: TableLayout[]) =>
  tables.reduce((maxNumber, table) => {
    const idMatch = table.id.match(/table-(\d+)/i);
    const nameMatch = table.name.match(/(\d+)/);
    const nextNumber = Number(idMatch?.[1] ?? nameMatch?.[1] ?? 0);
    return Math.max(maxNumber, nextNumber);
  }, 0) + 1;
const resolveTablePlacement = (index: number) => {
  const preset = tablePlacements[index];
  if (preset) {
    return preset;
  }

  const fallbackIndex = index - tablePlacements.length;
  const column = fallbackIndex % 3;
  const row = Math.floor(fallbackIndex / 3);

  return {
    x: 10 + column * 25,
    y: 82 + row * 24,
    width: 20,
    height: 20
  };
};
const createBaseTicket = (course: CourseKey): CourseTicket => ({
  course,
  status: "not-recorded",
  countdownMinutes: kitchenRules.releaseCountdownMinutes,
  manualRelease: false
});

const createBaseTickets = (): Record<CourseKey, CourseTicket> => ({
  drinks: createBaseTicket("drinks"),
  starter: createBaseTicket("starter"),
  main: createBaseTicket("main"),
  dessert: createBaseTicket("dessert")
});

const kitchenTicketStatusRank: Record<KitchenStatus, number> = {
  ready: 0,
  countdown: 1,
  blocked: 2,
  completed: 3,
  skipped: 4,
  "not-recorded": 5
};

const getKitchenBatchesForCourse = (session: OrderSession, course: CourseKey) =>
  session.kitchenTicketBatches.filter((batch) => batch.course === course);

const getBarBatchesForCourse = (session: OrderSession, course: CourseKey) =>
  session.barTicketBatches.filter((batch) => batch.course === course);

const sortKitchenBatchesByNewest = (batches: KitchenTicketBatch[]) =>
  [...batches].sort((left, right) => {
    if (right.sequence !== left.sequence) return right.sequence - left.sequence;
    return new Date(right.sentAt).getTime() - new Date(left.sentAt).getTime();
  });

const getKitchenUnitCount = (item: Pick<OrderItem, "quantity">) => Math.max(1, Math.floor(item.quantity));

const tracksKitchenUnitProgress = (item: Pick<OrderItem, "category" | "sentAt">) =>
  item.category !== "drinks" && Boolean(item.sentAt);

const normalizeKitchenUnitState = (unitState: KitchenUnitState | undefined): KitchenUnitState => {
  if (unitState?.status === "in-progress") {
    return {
      status: "in-progress",
      startedAt: unitState.startedAt
    };
  }

  if (unitState?.status === "completed") {
    return {
      status: "completed",
      startedAt: unitState.startedAt,
      completedAt: unitState.completedAt
    };
  }

  return { status: "pending" };
};

const createKitchenUnitStates = (count: number, status: KitchenUnitStatus): KitchenUnitState[] =>
  Array.from({ length: count }, () => ({ status }));

const resolveLatestKitchenCompletionAt = (
  unitStates: KitchenUnitState[],
  fallback?: string
) => {
  let latestValue = fallback;
  let latestTime = fallback ? Date.parse(fallback) : Number.NEGATIVE_INFINITY;

  unitStates.forEach((unitState) => {
    if (!unitState.completedAt) return;

    const completedTime = Date.parse(unitState.completedAt);
    if (!Number.isFinite(completedTime)) {
      latestValue ??= unitState.completedAt;
      return;
    }

    if (completedTime > latestTime) {
      latestTime = completedTime;
      latestValue = unitState.completedAt;
    }
  });

  return latestValue;
};

const getNormalizedKitchenUnitStates = (item: OrderItem): KitchenUnitState[] | undefined => {
  if (!tracksKitchenUnitProgress(item)) {
    return undefined;
  }

  const unitCount = getKitchenUnitCount(item);
  if (item.preparedAt) {
    return Array.from({ length: unitCount }, () => ({
      status: "completed" as const,
      completedAt: item.preparedAt
    }));
  }

  const existingStates = Array.isArray(item.kitchenUnitStates) ? item.kitchenUnitStates : [];
  if (existingStates.length === 0) {
    return createKitchenUnitStates(unitCount, "pending");
  }

  return Array.from({ length: unitCount }, (_, index) =>
    normalizeKitchenUnitState(existingStates[index])
  );
};

const syncKitchenItemProgress = (item: OrderItem) => {
  const unitStates = getNormalizedKitchenUnitStates(item);
  if (!unitStates) {
    delete item.kitchenUnitStates;
    return;
  }

  item.kitchenUnitStates = unitStates;
  if (unitStates.every((unitState) => unitState.status === "completed")) {
    item.preparedAt =
      resolveLatestKitchenCompletionAt(unitStates, item.preparedAt ?? item.sentAt) ??
      item.preparedAt ??
      item.sentAt;
    return;
  }

  delete item.preparedAt;
};

const getKitchenItemUnitStates = (item: OrderItem) => {
  syncKitchenItemProgress(item);
  return item.kitchenUnitStates;
};

const hasKitchenItemProgress = (item: OrderItem) =>
  getNormalizedKitchenUnitStates(item)?.some((unitState) => unitState.status !== "pending") ?? false;

const isKitchenItemCompleted = (item: OrderItem) => {
  if (isOrderItemCanceled(item)) return true;

  const unitStates = getNormalizedKitchenUnitStates(item);
  if (!unitStates || unitStates.length === 0) {
    return false;
  }

  return unitStates.every((unitState) => unitState.status === "completed");
};

const setKitchenItemCompleted = (item: OrderItem, completedAt: string) => {
  const unitStates = getNormalizedKitchenUnitStates(item);
  if (!unitStates) return;

  item.kitchenUnitStates = unitStates.map((unitState) => ({
    status: "completed" as const,
    startedAt: unitState.startedAt,
    completedAt: unitState.completedAt ?? completedAt
  }));
  item.preparedAt = resolveLatestKitchenCompletionAt(item.kitchenUnitStates, completedAt) ?? completedAt;
};

const cycleKitchenUnitState = (item: OrderItem, unitIndex: number, changedAt: string) => {
  if (isOrderItemCanceled(item)) {
    return null;
  }

  const unitStates = getKitchenItemUnitStates(item);
  if (!unitStates || !unitStates[unitIndex]) {
    return null;
  }

  const nextStates = [...unitStates];
  const currentState = nextStates[unitIndex];
  if (!currentState) {
    return null;
  }

  if (currentState.status === "pending") {
    nextStates[unitIndex] = {
      status: "in-progress",
      startedAt: changedAt
    };
  } else if (currentState.status === "in-progress") {
    nextStates[unitIndex] = {
      status: "completed",
      startedAt: currentState.startedAt ?? changedAt,
      completedAt: changedAt
    };
  } else {
    nextStates[unitIndex] = {
      status: "pending"
    };
  }

  item.kitchenUnitStates = nextStates;
  if (nextStates.every((unitState) => unitState.status === "completed")) {
    item.preparedAt = resolveLatestKitchenCompletionAt(nextStates, changedAt) ?? changedAt;
  } else {
    delete item.preparedAt;
  }

  return nextStates[unitIndex]?.status ?? null;
};

const getBatchItems = (session: OrderSession, batch: KitchenTicketBatch) => {
  const itemIds = new Set(batch.itemIds);
  return session.items.filter((item) => itemIds.has(item.id));
};

const isKitchenBatchCompletedByUnits = (session: OrderSession, batch: KitchenTicketBatch) => {
  const batchItems = getBatchItems(session, batch);
  return batchItems.length > 0 && batchItems.every((item) => isKitchenItemCompleted(item));
};

const syncCourseTicketFromKitchenBatches = (session: OrderSession, course: CourseKey) => {
  if (course === "drinks") return;

  const batches = getKitchenBatchesForCourse(session, course);
  if (batches.length === 0) {
    const hasItems = session.items.some((item) => item.category === course);
    if (!hasItems && !session.skippedCourses.includes(course)) {
      session.courseTickets[course] = createBaseTicket(course);
    }
    return;
  }

  const activeBatch = [...batches]
    .filter((batch) => batch.status !== "completed" && batch.status !== "skipped")
    .sort((left, right) => {
      const rankDelta = kitchenTicketStatusRank[left.status] - kitchenTicketStatusRank[right.status];
      if (rankDelta !== 0) return rankDelta;
      if (right.sequence !== left.sequence) return right.sequence - left.sequence;
      return new Date(right.sentAt).getTime() - new Date(left.sentAt).getTime();
    })[0];
  const latestBatch = activeBatch ?? sortKitchenBatchesByNewest(batches)[0];
  if (!latestBatch) return;

  session.courseTickets[course] = {
    course,
    status: latestBatch.status,
    sentAt: latestBatch.sentAt,
    releasedAt: latestBatch.releasedAt,
    readyAt: latestBatch.readyAt,
    completedAt: latestBatch.completedAt,
    manualRelease: latestBatch.manualRelease,
    countdownMinutes: latestBatch.countdownMinutes
  };
};

const syncDrinkTicketFromBarBatches = (session: OrderSession) => {
  const batches = getBarBatchesForCourse(session, "drinks");
  if (batches.length === 0) {
    const hasItems = session.items.some((item) => item.category === "drinks");
    if (!hasItems && !session.skippedCourses.includes("drinks")) {
      session.courseTickets.drinks = createBaseTicket("drinks");
    }
    return;
  }

  const activeBatch = [...batches]
    .filter((batch) => batch.status !== "completed" && batch.status !== "skipped")
    .sort((left, right) => {
      const rankDelta = kitchenTicketStatusRank[left.status] - kitchenTicketStatusRank[right.status];
      if (rankDelta !== 0) return rankDelta;
      if (right.sequence !== left.sequence) return right.sequence - left.sequence;
      return new Date(right.sentAt).getTime() - new Date(left.sentAt).getTime();
    })[0];
  const latestBatch = activeBatch ?? sortKitchenBatchesByNewest(batches)[0];
  if (!latestBatch) return;

  session.courseTickets.drinks = {
    course: "drinks",
    status: latestBatch.status,
    sentAt: latestBatch.sentAt,
    releasedAt: latestBatch.releasedAt,
    readyAt: latestBatch.readyAt,
    completedAt: latestBatch.completedAt,
    manualRelease: false,
    countdownMinutes: latestBatch.countdownMinutes
  };
};

const createKitchenTicketBatch = (
  session: OrderSession,
  tableId: string,
  course: CourseKey,
  items: OrderSession["items"],
  sentAt: string,
  status: KitchenStatus
): KitchenTicketBatch => {
  const sequence = getKitchenBatchesForCourse(session, course).length + 1;
  const ticket = session.courseTickets[course];

  return {
    id: createClientId(`kitchen-ticket-${tableId}-${course}`),
    course,
    itemIds: items.map((item) => item.id),
    status,
    sentAt,
    releasedAt: sentAt,
    readyAt: undefined,
    completedAt: undefined,
    manualRelease: false,
    countdownMinutes: ticket.countdownMinutes || kitchenRules.releaseCountdownMinutes,
    sequence
  };
};

const createBarTicketBatch = (
  session: OrderSession,
  tableId: string,
  items: OrderSession["items"],
  sentAt: string
): KitchenTicketBatch => ({
  id: createClientId(`bar-ticket-${tableId}-drinks`),
  course: "drinks",
  itemIds: items.map((item) => item.id),
  status: "ready",
  sentAt,
  releasedAt: sentAt,
  readyAt: sentAt,
  completedAt: undefined,
  manualRelease: false,
  countdownMinutes: 0,
  sequence: getBarBatchesForCourse(session, "drinks").length + 1
});

const tableOrderTarget: OrderTarget = { type: "table" };

const resolveOrderTargetForTable = (
  table: TableLayout | undefined,
  target: OrderTarget
): OrderTarget => {
  if (!table || target.type === "table") {
    return tableOrderTarget;
  }

  const seat = table.seats.find((entry) => entry.id === target.seatId);
  if (!seat || seat.visible === false) {
    return tableOrderTarget;
  }

  return { type: "seat", seatId: target.seatId };
};

const createSession = (tableId: string, waiterId: string): OrderSession => ({
  id: createClientId(`session-${tableId}`),
  tableId,
  waiterId,
  status: "serving",
  items: [],
  skippedCourses: [],
  courseTickets: createBaseTickets(),
  kitchenTicketBatches: [],
  barTicketBatches: [],
  payments: [],
  cancellations: [],
  partyGroups: [],
  receipt: {}
});

const withNotification = (
  state: AppState,
  notification: Omit<AppNotification, "id" | "createdAt" | "read">,
  actorUserId?: string | null
) => {
  const sessionForNotification = notification.tableId
    ? getSessionForTable(state.sessions, notification.tableId) ??
      state.sessions.find((session) => session.tableId === notification.tableId)
    : undefined;
  const resolvedActorUserId =
    notification.createdByUserId ??
    actorUserId ??
    notification.acceptedByUserId ??
    sessionForNotification?.waiterId;
  const actorUser = resolvedActorUserId
    ? state.users.find((user) => user.id === resolvedActorUserId)
    : undefined;
  const createdByUserId = actorUser?.id ?? resolvedActorUserId;
  const createdByName = notification.createdByName ?? notification.acceptedByName ?? actorUser?.name;

  state.notifications.unshift({
    id: createClientId("notification"),
    createdAt: new Date().toISOString(),
    read: false,
    ...notification,
    ...(createdByUserId ? { createdByUserId } : {}),
    ...(createdByName ? { createdByName } : {})
  });
};

const emitOperatorFeedback = () => {
  if (typeof window === "undefined") return;

  if ("vibrate" in navigator) {
    navigator.vibrate?.(18);
  }

  if (typeof window.AudioContext === "undefined") return;

  const audioContext = new window.AudioContext();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.value = 880;
  gain.gain.value = 0.03;
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.12);
};

const getClosedSessionAmount = (session: OrderSession, products: Product[]) => {
  const paymentTotal = session.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  return paymentTotal > 0 ? paymentTotal : calculateSessionBillableTotal(session, products);
};

const normalizePaymentSelection = (session: OrderSession, selectedLineItems: PaymentLineItem[]) => {
  const itemById = new Map(session.items.map((item) => [item.id, item]));
  const selectedByItemId = new Map<string, number>();

  selectedLineItems.forEach((lineItem) => {
    const item = itemById.get(lineItem.itemId);
    if (!item) return;

    const openEntry = getOpenLineItems(session).find((entry) => entry.item.id === item.id);
    const openQuantity = openEntry?.openQuantity ?? 0;
    const nextQuantity = Math.min(openQuantity, Math.max(0, Math.floor(lineItem.quantity)));
    if (nextQuantity <= 0) return;

    selectedByItemId.set(item.id, (selectedByItemId.get(item.id) ?? 0) + nextQuantity);
  });

  return [...selectedByItemId.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));
};

const resolveOrderModifierLabels = (
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

const getItemExtraIngredientIds = (item: Pick<OrderItem, "modifiers">) =>
  item.modifiers.find((selection) => selection.groupId === EXTRA_INGREDIENTS_MODIFIER_GROUP_ID)
    ?.optionIds ?? [];

const replaceItemModifierSelection = (
  modifiers: OrderItem["modifiers"],
  groupId: string,
  optionIds: string[]
) => {
  const nextOptionIds = [...new Set(optionIds.map((optionId) => optionId.trim()).filter(Boolean))];
  const nextModifiers = modifiers.filter((selection) => selection.groupId !== groupId);

  if (nextOptionIds.length === 0) {
    return nextModifiers;
  }

  nextModifiers.push({
    groupId,
    optionIds: nextOptionIds
  });

  return nextModifiers;
};

const areStringListsEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const summarizeServiceItems = (
  items: OrderSession["items"],
  products: Product[],
  table?: TableLayout
) => {
  const seatLabels = new Map(table?.seats.map((seat) => [seat.id, seat.label]) ?? []);
  const groupedItems = new Map<
    string,
    {
      quantity: number;
      productName: string;
      note?: string;
      modifierLabels: string[];
      targetLabel?: string;
    }
  >();

  items.forEach((item) => {
    const productName = resolveProductName(products, item.productId);
    const targetLabel =
      item.target.type === "seat" ? seatLabels.get(item.target.seatId) ?? "Sitzplatz" : undefined;
    const modifierLabels = resolveOrderModifierLabels(item, products);
    const key = [
      item.productId,
      item.note ?? "",
      modifierLabels.join("|"),
      targetLabel ?? "table"
    ].join("|");
    const current = groupedItems.get(key);

    if (current) {
      current.quantity += item.quantity;
      return;
    }

    groupedItems.set(key, {
      quantity: item.quantity,
      productName,
      note: item.note,
      modifierLabels,
      targetLabel
    });
  });

  const labels = [...groupedItems.values()].map((item) => {
    const modifierSuffix =
      item.modifierLabels.length > 0 ? ` · ${item.modifierLabels.join(" · ")}` : "";
    const noteSuffix = item.note ? ` (${item.note})` : "";
    const drinkLabel = `${item.quantity}x ${item.productName}${modifierSuffix}${noteSuffix}`;
    return item.targetLabel ? `${item.targetLabel}: ${drinkLabel}` : drinkLabel;
  });

  if (labels.length <= 4) {
    return labels.join(", ");
  }

  return `${labels.slice(0, 4).join(", ")} und ${labels.length - 4} weitere Positionen`;
};

const resolveServiceDeliveryTask = (notification: AppNotification, state: AppState) => {
  const tableName =
    state.tables.find((table) => table.id === notification.tableId)?.name ??
    notification.tableId?.replace("table-", "Tisch ") ??
    "den Tisch";
  const tablePrefix = `${tableName}: `;
  const taskText = notification.body.startsWith(tablePrefix)
    ? notification.body.slice(tablePrefix.length)
    : notification.body;
  const itemText = taskText.endsWith(".") ? taskText.slice(0, -1) : taskText;

  return {
    tableName,
    itemText
  };
};

const resolveNotificationCourse = (
  notification: AppNotification,
  sourceNotification?: AppNotification
): CourseKey | null => {
  if (notification.course) return notification.course;
  if (sourceNotification?.course) return sourceNotification.course;

  if (notification.kind === "service-drinks" || sourceNotification?.kind === "service-drinks") {
    return "drinks";
  }

  const titleText = `${sourceNotification?.title ?? ""} ${notification.title}`.trim();
  return serviceCourseOrder.find((course) => titleText.includes(courseLabels[course])) ?? null;
};

const markServiceDeliveryCompleted = (notification: AppNotification, state: AppState) => {
  const sourceNotification = notification.sourceNotificationId
    ? state.notifications.find((entry) => entry.id === notification.sourceNotificationId)
    : undefined;
  const tableId = notification.tableId ?? sourceNotification?.tableId;
  const course = resolveNotificationCourse(notification, sourceNotification);

  if (!tableId || !course) {
    return null;
  }

  const session = getSessionForTable(state.sessions, tableId);
  if (!session) {
    return null;
  }

  const deliveredAt = new Date().toISOString();
  const itemIds = new Set(
    notification.itemIds?.length ? notification.itemIds : (sourceNotification?.itemIds ?? [])
  );
  const itemsToMark = session.items.filter((item) => {
    if (item.category !== course || item.servedAt) {
      return false;
    }

    if (itemIds.size > 0) {
      return itemIds.has(item.id);
    }

    return course === "drinks" ? Boolean(item.sentAt) : Boolean(item.preparedAt);
  });

  itemsToMark.forEach((item) => {
    item.servedAt = deliveredAt;
  });

  return {
    course,
    deliveredCount: itemsToMark.reduce((sum, item) => sum + item.quantity, 0)
  };
};

const summarizeCourseItems = (items: OrderSession["items"], products: Product[]) => {
  const groupedItems = new Map<
    string,
    {
      quantity: number;
      productName: string;
      note?: string;
      modifierLabels: string[];
    }
  >();

  items.forEach((item) => {
    const modifierLabels = resolveOrderModifierLabels(item, products);
    const key = [item.productId, item.note ?? "", modifierLabels.join("|")].join("|");
    const current = groupedItems.get(key);

    if (current) {
      current.quantity += item.quantity;
      return;
    }

    groupedItems.set(key, {
      quantity: item.quantity,
      productName: resolveProductName(products, item.productId),
      note: item.note,
      modifierLabels
    });
  });

  const labels = [...groupedItems.values()].map((item) => {
    const modifierSuffix =
      item.modifierLabels.length > 0 ? ` · ${item.modifierLabels.join(" · ")}` : "";
    const noteSuffix = item.note ? ` (${item.note})` : "";
    return `${item.quantity}x ${item.productName}${modifierSuffix}${noteSuffix}`;
  });

  if (labels.length <= 4) {
    return labels.join(", ");
  }

  return `${labels.slice(0, 4).join(", ")} und ${labels.length - 4} weitere Positionen`;
};

const resolveItemTargetLabel = (item: OrderItem, table?: TableLayout) => {
  const target = item.target;
  if (target.type === "table") {
    return "Tisch";
  }

  return table?.seats.find((seat) => seat.id === target.seatId)?.label ?? "Sitzplatz";
};

const legacyFormatItemCorrectionSummary = (
  item: Pick<OrderItem, "productId" | "quantity" | "note" | "target" | "modifiers">,
  products: Product[],
  table?: TableLayout
) => {
  const parts = [`${item.quantity}x ${resolveProductName(products, item.productId)}`];
  const modifierLabels = resolveOrderModifierLabels(item, products);
  if (modifierLabels.length > 0) {
    parts.push(modifierLabels.join(" · "));
  }
  if (item.note?.trim()) {
    parts.push(`(${item.note.trim()})`);
  }

  parts.push(`· ${resolveItemTargetLabel(item as OrderItem, table)}`);
  return parts.join(" ");
};

const formatItemCorrectionSummary = (
  item: Pick<OrderItem, "productId" | "quantity" | "note" | "target" | "modifiers">,
  products: Product[],
  table?: TableLayout
) => {
  const parts = [`${item.quantity}x ${resolveProductName(products, item.productId)}`];
  const modifierLabels = resolveOrderModifierLabels(item, products);
  if (modifierLabels.length > 0) {
    parts.push(modifierLabels.join(" · "));
  }
  if (item.note?.trim()) {
    parts.push(`(${item.note.trim()})`);
  }

  parts.push(`· ${resolveItemTargetLabel(item as OrderItem, table)}`);
  return parts.join(" ");
};

const canReviseSentItem = (session: OrderSession, item: OrderItem, actorRole?: Role) => {
  if (isOrderItemCanceled(item)) return false;

  if (actorRole === "admin") {
    return true;
  }

  if (!item.sentAt) return false;
  if (item.servedAt) return false;
  if (item.category !== "drinks" && hasKitchenItemProgress(item)) return false;

  return calculatePaidItemQuantity(session, item.id) === 0;
};

const syncOpenDrinkNotifications = (
  state: AppState,
  session: OrderSession,
  tableId: string,
  table?: TableLayout
) => {
  const activeDrinkItems = session.items.filter(
    (item) =>
      item.category === "drinks" &&
      item.sentAt &&
      !item.servedAt &&
      !isOrderItemCanceled(item)
  );
  const activeDrinkItemIds = new Set(activeDrinkItems.map((item) => item.id));
  const tableName = table?.name ?? tableId.replace("table-", "Tisch ");

  state.notifications.forEach((notification) => {
    if (
      notification.tableId !== tableId ||
      (notification.kind !== "service-drinks" && notification.kind !== "service-drinks-accepted")
    ) {
      return;
    }

    const notificationItemIds = notification.itemIds ?? [];
    const remainingItemIds = notificationItemIds.filter((itemId) => activeDrinkItemIds.has(itemId));
    if (remainingItemIds.length === 0) {
      notification.read = true;
      return;
    }

    notification.itemIds = remainingItemIds;
    const remainingItems = activeDrinkItems.filter((item) => remainingItemIds.includes(item.id));
    notification.body = `${tableName}: ${summarizeServiceItems(remainingItems, state.products, table)}.`;
  });
};

const notifySentItemCorrection = (
  state: AppState,
  tableId: string,
  nextItem: OrderItem | null,
  previousItem: Pick<
    OrderItem,
    "category" | "productId" | "quantity" | "note" | "target" | "modifiers"
  >,
  action: "updated" | "removed",
  actorUserId?: string | null
) => {
  const table = state.tables.find((entry) => entry.id === tableId);
  const tableName = table?.name ?? tableId.replace("table-", "Tisch ");
  const course = previousItem.category;
  const previousLabel = formatItemCorrectionSummary(previousItem, state.products, table);
  const nextLabel = nextItem ? formatItemCorrectionSummary(nextItem, state.products, table) : null;
  const targetRoles =
    course === "drinks"
      ? (["bar", "waiter"] as const)
      : (["kitchen", "waiter"] as const);

  withNotification(state, {
    title:
      action === "removed"
        ? `${courseLabels[course]} storniert`
        : `${courseLabels[course]} korrigiert`,
    body:
      action === "removed"
        ? `${tableName}: ${previousLabel} wurde storniert.`
        : `${tableName}: ${previousLabel} wurde geändert zu ${nextLabel}.`,
    tone: action === "removed" ? "alert" : "info",
    tableId,
    targetRoles: [...targetRoles]
  }, actorUserId);

  if (course === "drinks") {
    const session = getSessionForTable(state.sessions, tableId);
    if (session) {
      syncOpenDrinkNotifications(state, session, tableId, table);
    }
  }
};

const normalizeSessionAfterItemRemoval = (session: OrderSession) => {
  const itemIds = new Set(session.items.map((item) => item.id));
  session.kitchenTicketBatches = session.kitchenTicketBatches
    .map((batch) => ({
      ...batch,
      itemIds: batch.itemIds.filter((itemId) => itemIds.has(itemId))
    }))
    .filter((batch) => batch.itemIds.length > 0);
  session.barTicketBatches = session.barTicketBatches
    .map((batch) => ({
      ...batch,
      itemIds: batch.itemIds.filter((itemId) => itemIds.has(itemId))
    }))
    .filter((batch) => batch.itemIds.length > 0);

  for (const course of serviceCourseOrder) {
    const hasItems = session.items.some((item) => item.category === course);
    if (!hasItems && !session.skippedCourses.includes(course)) {
      session.courseTickets[course] = createBaseTicket(course);
      continue;
    }

    if (course === "drinks") {
      syncDrinkTicketFromBarBatches(session);
      continue;
    }

    syncCourseTicketFromKitchenBatches(session, course);
  }
};

const completeCourseOrBatch = (
  next: AppState,
  session: OrderSession,
  tableId: string,
  course: CourseKey,
  completedAt: string,
  batch?: KitchenTicketBatch
) => {
  const ticket = session.courseTickets[course];
  const table = next.tables.find((entry) => entry.id === tableId);
  const tableName = table?.name ?? tableId.replace("table-", "Tisch ");
  const courseItems = batch ? getBatchItems(session, batch) : session.items.filter((item) => item.category === course);

  if (course === "drinks") {
    courseItems.forEach((item) => {
      item.preparedAt = completedAt;
    });
  } else {
    courseItems.forEach((item) => {
      setKitchenItemCompleted(item, completedAt);
    });
  }

  if (batch) {
    batch.status = "completed";
    batch.completedAt = completedAt;
  } else {
    ticket.status = "completed";
    ticket.completedAt = completedAt;
  }

  if (course === "drinks") {
    syncDrinkTicketFromBarBatches(session);
  } else {
    syncCourseTicketFromKitchenBatches(session, course);
  }

  if (course !== "drinks" && (course === "dessert" || course === "main")) {
    session.status = "ready-to-bill";
  }

  if (course === "drinks") {
    withNotification(next, {
      kind: "service-drinks",
      course,
      itemIds: courseItems.map((item) => item.id),
      title: "Getränke an den Tisch",
      body: `${tableName}: ${summarizeServiceItems(courseItems, next.products, table)}.`,
      tone: "info",
      tableId
    });
    return;
  }

  withNotification(next, {
    kind: "service-course-ready",
    course,
    itemIds: courseItems.map((item) => item.id),
    title: `${courseLabels[course]} fertig`,
    body: `${summarizeCourseItems(courseItems, next.products)} für ${tableName} ist fertig.`,
    tone: "success",
    tableId
  });
};

const removeKitchenReadyNotifications = (
  state: AppState,
  tableId: string,
  course: CourseKey,
  itemIds: string[]
) => {
  const itemIdSet = new Set(itemIds);
  const removableIds = new Set<string>();

  state.notifications.forEach((notification) => {
    if (notification.tableId !== tableId) return;
    if (
      notification.kind !== "service-course-ready" &&
      notification.kind !== "service-course-ready-accepted"
    ) {
      return;
    }
    if (notification.course && notification.course !== course) return;

    const hasMatchingItems =
      !notification.itemIds?.length || notification.itemIds.some((itemId) => itemIdSet.has(itemId));
    if (hasMatchingItems) {
      removableIds.add(notification.id);
    }
  });

  if (removableIds.size === 0) {
    return;
  }

  state.notifications = state.notifications.filter(
    (notification) =>
      !removableIds.has(notification.id) &&
      (!notification.sourceNotificationId || !removableIds.has(notification.sourceNotificationId))
  );
};

const reopenCompletedKitchenBatch = (
  next: AppState,
  session: OrderSession,
  tableId: string,
  batch: KitchenTicketBatch
) => {
  const batchItems = getBatchItems(session, batch);
  if (batchItems.length === 0) return false;
  if (batchItems.some((item) => item.servedAt)) return false;

  batch.status = "ready";
  batch.completedAt = undefined;
  batch.readyAt = new Date().toISOString();

  batchItems.forEach((item) => {
    const unitCount = getKitchenUnitCount(item);
    item.kitchenUnitStates = createKitchenUnitStates(unitCount, "pending");
    delete item.preparedAt;
  });

  removeKitchenReadyNotifications(next, tableId, batch.course, batch.itemIds);
  session.status = "waiting";
  syncCourseTicketFromKitchenBatches(session, batch.course);
  return true;
};

const commitStorage = (state: AppState) => {
  if (typeof window === "undefined") return;

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const commitAuthStorage = (currentUserId: string | null) => {
  if (typeof window === "undefined") return;

  if (currentUserId) {
    sessionStorage.setItem(AUTH_KEY, JSON.stringify({ currentUserId }));
  } else {
    sessionStorage.removeItem(AUTH_KEY);
  }

  localStorage.removeItem(LEGACY_AUTH_KEY);
};

const readStoredState = () => {
  if (typeof window === "undefined") return null;

  const rawState = localStorage.getItem(STORAGE_KEY);
  if (!rawState) return null;

  try {
    return JSON.parse(rawState) as AppState;
  } catch {
    return null;
  }
};

const readStoredAuth = () => {
  if (typeof window === "undefined") return null;

  const rawAuth = sessionStorage.getItem(AUTH_KEY);
  if (!rawAuth) return null;

  try {
    return JSON.parse(rawAuth) as { currentUserId: string | null };
  } catch {
    return null;
  }
};

const resolveSharedStateUrl = () => {
  const configuredBaseUrl = process.env["NEXT_PUBLIC_KIJU_API_BASE_URL"]?.trim();
  if (configuredBaseUrl) {
    return `${configuredBaseUrl.replace(/\/+$/, "")}/state`;
  }

  if (typeof window === "undefined") return null;

  const deployedBasePath = normalizePublicBasePath(process.env["NEXT_PUBLIC_BASE_PATH"]);
  if (deployedBasePath) {
    return `${window.location.origin}/api/kiju/state`;
  }

  return `${window.location.origin}/api/state`;
};

const requestSharedSnapshot = async (input: string, init?: RequestInit) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), SHARED_SYNC_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(input, {
      cache: "no-store",
      ...init,
      signal: controller.signal
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as SharedStateSnapshot;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const getNotificationReaderKey = () => {
  if (typeof window === "undefined") return "device-server";

  const existingKey =
    window.localStorage.getItem(NOTIFICATION_DEVICE_KEY) ??
    window.sessionStorage.getItem(NOTIFICATION_DEVICE_KEY);
  if (existingKey) {
    window.localStorage.setItem(NOTIFICATION_DEVICE_KEY, existingKey);
    window.sessionStorage.setItem(NOTIFICATION_DEVICE_KEY, existingKey);
    return existingKey;
  }

  const nextKey =
    typeof window.crypto?.randomUUID === "function"
      ? `device-${window.crypto.randomUUID()}`
      : `device-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

  window.localStorage.setItem(NOTIFICATION_DEVICE_KEY, nextKey);
  window.sessionStorage.setItem(NOTIFICATION_DEVICE_KEY, nextKey);
  return nextKey;
};

const readStoredNotificationReads = () => {
  if (typeof window === "undefined") return {};

  const rawValue = localStorage.getItem(NOTIFICATION_READS_KEY);
  if (!rawValue) return {};

  try {
    const parsed = JSON.parse(rawValue) as LocalNotificationReadState;
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
};

const storeNotificationReads = (reads: LocalNotificationReadState) => {
  if (typeof window === "undefined") return;

  localStorage.setItem(NOTIFICATION_READS_KEY, JSON.stringify(reads));
};

const isNotificationExpired = (notification: AppNotification, now = Date.now()) => {
  if (!notification.expiresAt) return false;

  const expiresAt = Date.parse(notification.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= now;
};

const pruneNotificationReads = (
  reads: LocalNotificationReadState,
  notifications: AppNotification[]
) => {
  const openNotificationIds = new Set(
    notifications
      .filter((notification) => !notification.read && !isNotificationExpired(notification))
      .map((notification) => notification.id)
  );
  let hasChanges = false;
  const nextEntries = Object.entries(reads).flatMap(([readerKey, notificationIds]) => {
    const nextIds = notificationIds.filter((notificationId) => openNotificationIds.has(notificationId));
    if (nextIds.length !== notificationIds.length) {
      hasChanges = true;
    }

    return nextIds.length > 0 ? ([[readerKey, nextIds]] as const) : [];
  });

  if (!hasChanges && nextEntries.length === Object.keys(reads).length) {
    return reads;
  }

  return Object.fromEntries(nextEntries);
};

const fetchSharedSnapshot = async () => {
  const sharedStateUrl = resolveSharedStateUrl();
  if (!sharedStateUrl) return null;

  return requestSharedSnapshot(sharedStateUrl);
};

const replaceSharedSnapshot = async (state: AppState) => {
  const sharedStateUrl = resolveSharedStateUrl();
  if (!sharedStateUrl) return null;

  return requestSharedSnapshot(sharedStateUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(state)
    });
};

export const DemoAppProvider = ({ children }: PropsWithChildren) => {
  const [state, setState] = useState<AppState>(() => createFreshOperationalState());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [localNotificationReads, setLocalNotificationReads] = useState<LocalNotificationReadState>(() =>
    readStoredNotificationReads()
  );
  const [notificationClock, setNotificationClock] = useState(() => Date.now());
  const [hydrated, setHydrated] = useState(false);
  const [sharedSync, setSharedSync] = useState<SharedSyncState>({
    status: "connecting",
    usingSharedState: false
  });
  const channelRef = useRef<BroadcastChannel | null>(null);
  const sharedSyncEnabledRef = useRef(false);
  const sharedVersionRef = useRef<number | null>(null);
  const stateRef = useRef(state);
  const currentUserIdRef = useRef(currentUserId);
  const localWriteRevisionRef = useRef(0);
  const dailyResetUndoRef = useRef<AppState | null>(null);
  const hasActiveExpiringNotification = state.notifications.some(
    (notification) =>
      !notification.read &&
      Boolean(notification.expiresAt) &&
      !isNotificationExpired(notification, notificationClock)
  );

  const broadcast = useCallback((nextState: AppState) => {
    channelRef.current?.postMessage({
      state: nextState
    });
  }, []);

  const commit = useCallback(
    (nextState: AppState, nextUserId: string | null = currentUserId) => {
      const normalizedState = normalizeAppState(nextState);
      localWriteRevisionRef.current += 1;
      stateRef.current = normalizedState;
      currentUserIdRef.current = nextUserId;

      setState(normalizedState);
      setCurrentUserId(nextUserId);
      commitStorage(normalizedState);
      commitAuthStorage(nextUserId);
      broadcast(normalizedState);

      void replaceSharedSnapshot(normalizedState).then((snapshot) => {
        if (!snapshot) {
          setSharedSync((currentSync) => ({
            status: "offline",
            usingSharedState: currentSync.usingSharedState,
            lastSyncedAt: currentSync.lastSyncedAt
          }));
          return;
        }

        sharedSyncEnabledRef.current = true;
        sharedVersionRef.current = snapshot.version;
        setSharedSync({
          status: "online",
          usingSharedState: true,
          lastSyncedAt: snapshot.updatedAt
        });
      });
    },
    [broadcast, currentUserId]
  );

  useEffect(() => {
    if (!hydrated || sharedSync.status === "connecting") return;

    setLocalNotificationReads((currentReads) => {
      const nextReads = pruneNotificationReads(currentReads, state.notifications);
      if (nextReads === currentReads) {
        return currentReads;
      }

      storeNotificationReads(nextReads);
      return nextReads;
    });
  }, [hydrated, sharedSync.status, state.notifications]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasActiveExpiringNotification) return;

    const timer = window.setInterval(() => {
      setNotificationClock(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [hasActiveExpiringNotification]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedState = readStoredState();
    const storedAuth = readStoredAuth();
    const storedNotificationReads = readStoredNotificationReads();

    if (storedState) {
      const normalizedStoredState = normalizeAppState(storedState);
      stateRef.current = normalizedStoredState;
      setState(normalizedStoredState);
    }

    if (storedAuth) {
      currentUserIdRef.current = storedAuth.currentUserId;
      setCurrentUserId(storedAuth.currentUserId);
    }

    setLocalNotificationReads(storedNotificationReads);

    if ("BroadcastChannel" in window) {
      channelRef.current = new BroadcastChannel("kiju-app-sync-v2");
      channelRef.current.onmessage = (event) => {
        const payload = event.data as { state: AppState };
        const normalizedBroadcastState = normalizeAppState(payload.state);
        stateRef.current = normalizedBroadcastState;
        setState(normalizedBroadcastState);
      };
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue) {
        try {
          const normalizedStoredState = normalizeAppState(JSON.parse(event.newValue) as AppState);
          stateRef.current = normalizedStoredState;
          setState(normalizedStoredState);
        } catch {
          // Ignore malformed local cache entries.
        }
      }

      if (event.key === NOTIFICATION_READS_KEY) {
        setLocalNotificationReads(readStoredNotificationReads());
      }
    };

    window.addEventListener("storage", handleStorage);
    let isActive = true;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    const bootWriteRevision = localWriteRevisionRef.current;
    setHydrated(true);

    const hydrateSharedState = async () => {
      const snapshot = await fetchSharedSnapshot();

      if (snapshot && isActive) {
        sharedSyncEnabledRef.current = true;
        sharedVersionRef.current = snapshot.version;
        const normalizedSnapshotState = normalizeAppState(snapshot.state);
        const hasLocalWritesSinceBoot = localWriteRevisionRef.current !== bootWriteRevision;

        if (!hasLocalWritesSinceBoot) {
          stateRef.current = normalizedSnapshotState;
          setState(normalizedSnapshotState);
          commitStorage(normalizedSnapshotState);
        }

        setSharedSync({
          status: "online",
          usingSharedState: true,
          lastSyncedAt: snapshot.updatedAt
        });

        if (!hasLocalWritesSinceBoot && JSON.stringify(normalizedSnapshotState) !== JSON.stringify(snapshot.state)) {
          void replaceSharedSnapshot(normalizedSnapshotState).then((normalizedSnapshot) => {
            if (!normalizedSnapshot || !isActive) return;
            sharedVersionRef.current = normalizedSnapshot.version;
            setSharedSync({
              status: "online",
              usingSharedState: true,
              lastSyncedAt: normalizedSnapshot.updatedAt
            });
          });
        }

        if (hasLocalWritesSinceBoot) {
          void replaceSharedSnapshot(stateRef.current).then((latestSnapshot) => {
            if (!latestSnapshot || !isActive) return;
            sharedVersionRef.current = latestSnapshot.version;
            setSharedSync({
              status: "online",
              usingSharedState: true,
              lastSyncedAt: latestSnapshot.updatedAt
            });
          });
        }

        pollTimer = setInterval(async () => {
          const latestSnapshot = await fetchSharedSnapshot();
          if (!latestSnapshot || !isActive) return;
          if (
            sharedVersionRef.current !== null &&
            latestSnapshot.version <= sharedVersionRef.current
          ) {
            return;
          }

          sharedVersionRef.current = latestSnapshot.version;
          const normalizedSnapshotState = normalizeAppState(latestSnapshot.state);
          stateRef.current = normalizedSnapshotState;
          setState(normalizedSnapshotState);
          commitStorage(normalizedSnapshotState);
          setSharedSync({
            status: "online",
            usingSharedState: true,
            lastSyncedAt: latestSnapshot.updatedAt
          });
        }, SHARED_SYNC_POLL_MS);
      }

      if (!snapshot && isActive) {
        setSharedSync({
          status: "offline",
          usingSharedState: false
        });
      }
    };

    void hydrateSharedState();

    return () => {
      isActive = false;
      if (pollTimer) {
        clearInterval(pollTimer);
      }
      window.removeEventListener("storage", handleStorage);
      channelRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    const normalizedState = normalizeAppState(state);
    if (JSON.stringify(normalizedState) === JSON.stringify(state)) return;

    commit(normalizedState, currentUserId);
  }, [commit, currentUserId, hydrated, state]);

  const login = useCallback(
    (identifier: string, secret: string) => {
      const normalizedIdentifier = identifier.trim().toLowerCase();
      const normalizedSecret = secret.trim();
      const activeUsers = state.users.filter((candidate) => candidate.active);
      const pinOnlyMatches =
        normalizedIdentifier.length === 0
          ? activeUsers.filter((candidate) => candidate.pin === normalizedSecret)
          : [];
      const user = pinOnlyMatches.length === 1 ? pinOnlyMatches[0] : activeUsers.find((candidate) => {
        const identifierMatches =
          candidate.username.toLowerCase() === normalizedIdentifier ||
          candidate.name.toLowerCase() === normalizedIdentifier;
        const secretMatches = candidate.password === normalizedSecret || candidate.pin === normalizedSecret;

        return identifierMatches && secretMatches;
      });

      if (!user) {
        if (pinOnlyMatches.length > 1) {
          return {
            ok: false,
            message: "Diese PIN ist mehrfach vergeben. Bitte zusätzlich den Namen eingeben."
          };
        }

        return {
          ok: false,
          message: "Login nicht gefunden. Bitte PIN prüfen oder Name und Passwort eingeben."
        };
      }

      commit(state, user.id);
      return { ok: true, user };
    },
    [commit, state]
  );

  const startWorkspaceSession = useCallback(
    (role: WorkspaceRole, name?: string) => {
      const next = structuredClone(state);

      if (role === "waiter") {
        const normalizedName = name?.trim() ?? "";
        if (!normalizedName) {
          return {
            ok: false,
            message: "Bitte gib deinen Namen für den Service ein."
          };
        }

        const lookupName = normalizeLookupText(normalizedName);
        const activeWaiters = next.users.filter((user) => user.role === "waiter" && user.active);
        const matchingUsers = activeWaiters.filter((user) => {
          const normalizedUserName = normalizeLookupText(user.name);
          const normalizedUsername = normalizeLookupText(user.username);
          return normalizedUserName === lookupName || normalizedUsername === lookupName;
        });

        const usernameMatch = matchingUsers.find(
          (user) => normalizeLookupText(user.username) === lookupName
        );
        const exactNameMatches = matchingUsers.filter(
          (user) => normalizeLookupText(user.name) === lookupName
        );

        if (!usernameMatch && exactNameMatches.length > 1) {
          return {
            ok: false,
            message:
              "Der Name ist mehrfach vorhanden. Bitte im Admin einen eindeutigen Service-Namen anlegen."
          };
        }

        const matchedUser = usernameMatch ?? exactNameMatches[0];
        if (matchedUser) {
          matchedUser.lastSeenAt = new Date().toISOString();
          commit(next, matchedUser.id);
          return { ok: true, user: matchedUser };
        }

        const baseUsername = createUsernameFromName(normalizedName);
        const existingUsernames = new Set(
          next.users.map((user) => normalizeLookupText(user.username))
        );
        let username = baseUsername;
        let suffix = 2;

        while (existingUsernames.has(normalizeLookupText(username))) {
          username = `${baseUsername}${suffix}`;
          suffix += 1;
        }

        const user: UserAccount = {
          id: createClientId("user"),
          name: normalizedName,
          username,
          role: "waiter",
          password: "",
          active: true,
          lastSeenAt: new Date().toISOString()
        };
        next.users.unshift(user);
        commit(next, user.id);
        return { ok: true, user };
      }

      const user = next.users.find((candidate) => candidate.role === role && candidate.active);
      if (!user) {
        return {
          ok: false,
          message:
            role === "kitchen"
              ? "Es ist aktuell kein aktives Küchenkonto vorhanden."
              : role === "bar"
                ? "Es ist aktuell kein aktives Barkonto vorhanden."
                : "Es ist aktuell kein aktives Admin-Konto vorhanden."
        };
      }

      user.lastSeenAt = new Date().toISOString();
      commit(next, user.id);
      return { ok: true, user };
    },
    [commit, state]
  );

  const logout = useCallback(() => {
    commit(state, null);
  }, [commit, state]);

  const addItem = useCallback(
    (tableId: string, target: OrderTarget, productId: string) => {
      const next = structuredClone(state);
      const fallbackWaiterId = state.users.find((user) => user.role === "waiter")?.id;
      const waiterId = currentUserId ?? fallbackWaiterId;
      if (!waiterId) return;

      const table = next.tables.find((entry) => entry.id === tableId);
      if (!table) return;

      let session = next.sessions.find(
        (entry) => entry.tableId === tableId && entry.status !== "closed"
      );

      if (!session) {
        session = createSession(tableId, waiterId);
        next.sessions.unshift(session);
      }

      const product = next.products.find((entry) => entry.id === productId);
      if (!product) return;

      session.status = "serving";
      session.items.push({
        id: createClientId("item"),
        target: resolveOrderTargetForTable(table, target),
        productId,
        category: product.category,
        quantity: 1,
        createdAt: new Date().toISOString(),
        modifiers: []
      });

      commit(next);
    },
    [commit, currentUserId, state]
  );

  const updateItem = useCallback(
    (
      tableId: string,
      itemId: string,
      patch: Partial<Pick<OrderSession["items"][number], "target" | "quantity" | "note">>
    ) => {
      const actorRole = state.users.find((user) => user.id === currentUserId)?.role;
      const next = structuredClone(state);
      const table = next.tables.find((entry) => entry.id === tableId);
      const session = getSessionForTable(next.sessions, tableId);
      if (!table || !session || session.status === "closed") return;

      const item = session.items.find((entry) => entry.id === itemId);
      if (!item) return;
      const previousItem = item.sentAt
        ? {
            category: item.category,
            productId: item.productId,
            quantity: item.quantity,
            note: item.note,
            target: structuredClone(item.target),
            modifiers: structuredClone(item.modifiers)
          }
        : null;
      if (item.sentAt && !canReviseSentItem(session, item, actorRole)) return;

      if (patch.target !== undefined) {
        item.target = resolveOrderTargetForTable(table, patch.target);
      }

      if (patch.quantity !== undefined) {
        item.quantity = Math.max(1, Math.min(20, patch.quantity));
      }

      if (patch.note !== undefined) {
        const note = patch.note.trim();
        item.note = note ? note : undefined;
      }

      const changed =
        !previousItem ||
        previousItem.quantity !== item.quantity ||
        previousItem.note !== item.note ||
        JSON.stringify(previousItem.target) !== JSON.stringify(item.target);
      if (!changed) {
        return;
      }

      if (previousItem) {
        notifySentItemCorrection(next, tableId, item, previousItem, "updated", currentUserId);
      }

      commit(next);
    },
    [commit, currentUserId, state]
  );

  const setItemExtraIngredients = useCallback(
    (tableId: string, itemId: string, ingredientIds: string[]) => {
      const actorRole = state.users.find((user) => user.id === currentUserId)?.role;
      const next = structuredClone(state);
      const session = getSessionForTable(next.sessions, tableId);
      if (!session || session.status === "closed") return;

      const item = session.items.find((entry) => entry.id === itemId);
      if (!item) return;
      if (item.sentAt && !canReviseSentItem(session, item, actorRole)) return;

      const product = getProductById(next.products, item.productId);
      const availableIngredientIds = new Set(
        product?.modifierGroups
          .find((group) => group.id === EXTRA_INGREDIENTS_MODIFIER_GROUP_ID)
          ?.options.map((option) => option.id) ?? []
      );
      const nextIngredientIds = [...new Set(ingredientIds.map((ingredientId) => ingredientId.trim()))]
        .filter((ingredientId) => ingredientId.length > 0)
        .filter((ingredientId) => availableIngredientIds.has(ingredientId));
      const currentIngredientIds = getItemExtraIngredientIds(item);

      if (areStringListsEqual(currentIngredientIds, nextIngredientIds)) {
        return;
      }

      const previousItem = item.sentAt
        ? {
            category: item.category,
            productId: item.productId,
            quantity: item.quantity,
            note: item.note,
            target: structuredClone(item.target),
            modifiers: structuredClone(item.modifiers)
          }
        : null;

      item.modifiers = replaceItemModifierSelection(
        item.modifiers,
        EXTRA_INGREDIENTS_MODIFIER_GROUP_ID,
        nextIngredientIds
      );

      if (previousItem) {
        notifySentItemCorrection(next, tableId, item, previousItem, "updated", currentUserId);
      }

      commit(next);
    },
    [commit, currentUserId, state]
  );

  const removeItem = useCallback(
    (tableId: string, itemId: string) => {
      const actorRole = state.users.find((user) => user.id === currentUserId)?.role;
      const next = structuredClone(state);
      const session = getSessionForTable(next.sessions, tableId);
      if (!session || session.status === "closed") return;

      const item = session.items.find((entry) => entry.id === itemId);
      if (!item) return;
      if (item.sentAt && !canReviseSentItem(session, item, actorRole)) return;
      const previousItem = {
        category: item.category,
        productId: item.productId,
        quantity: item.quantity,
        note: item.note,
        target: structuredClone(item.target),
        modifiers: structuredClone(item.modifiers)
      };

      if (item.sentAt) {
        const canceledAt = new Date().toISOString();
        item.canceledAt = canceledAt;
        if (currentUserId) {
          item.canceledByUserId = currentUserId;
        } else {
          delete item.canceledByUserId;
        }
        item.preparedAt = canceledAt;
        notifySentItemCorrection(next, tableId, null, previousItem, "removed", currentUserId);
      } else {
        session.items = session.items.filter((entry) => entry.id !== itemId);
        normalizeSessionAfterItemRemoval(session);
      }

      if (!item.sentAt && session.items.length === 0) {
        next.sessions = next.sessions.filter((entry) => entry.id !== session.id);
      }

      commit(next);
    },
    [commit, currentUserId, state]
  );

  const skipCourse = useCallback(
    (tableId: string, course: CourseKey) => {
      const next = structuredClone(state);
      const session = getSessionForTable(next.sessions, tableId);
      if (!session) {
        return {
          ok: false,
          message: "Für diesen Tisch gibt es noch keine laufende Bestellung."
        };
      }

      if (!session.skippedCourses.includes(course)) {
        session.skippedCourses.push(course);
      }

      session.courseTickets[course].status = "skipped";
      session.courseTickets[course].completedAt = new Date().toISOString();

      commit(next);
    },
    [commit, state]
  );

  const setCourseWait = useCallback(
    (tableId: string, course: CourseKey, minutes: number) => {
      if (course === "drinks") {
        return {
          ok: false,
          message: "Getränke gehen direkt an die Bar und können dort nicht auf Wartezeit gesetzt werden."
        };
      }

      const next = structuredClone(state);
      const session = getSessionForTable(next.sessions, tableId);
      if (!session) {
        return {
          ok: false,
          message: "Für diesen Tisch gibt es noch keine laufende Bestellung."
        };
      }

      const pendingCourseItems = session.items.filter(
        (item) => item.category === course && !item.sentAt
      );
      if (pendingCourseItems.length === 0) {
        return {
          ok: false,
          message: `Für ${courseLabels[course]} gibt es keine neuen Positionen.`
        };
      }

      const normalizedMinutes = Math.min(180, Math.max(1, Math.round(minutes)));
      const ticket = session.courseTickets[course];
      const now = new Date().toISOString();

      ticket.status = "countdown";
      ticket.countdownMinutes = normalizedMinutes;
      ticket.completedAt = undefined;
      ticket.readyAt = undefined;
      ticket.manualRelease = false;
      if (ticket.sentAt) {
        ticket.releasedAt = now;
      } else {
        ticket.releasedAt = undefined;
      }

      session.status = "waiting";

      commit(next);
      return {
        ok: true,
        message: `${courseLabels[course]} wartet ${normalizedMinutes} Minuten.`
      };
    },
    [commit, state]
  );

  const sendCourseToKitchen = useCallback(
    (tableId: string, course: CourseKey) => {
      const next = structuredClone(state);
      const session = getSessionForTable(next.sessions, tableId);
      if (!session) {
        return {
          ok: false,
          message: "Für diesen Tisch gibt es noch keine laufende Bestellung."
        };
      }

      const kitchenCourseItems = kitchenCourseOrder
        .map((kitchenCourse) => ({
          course: kitchenCourse,
          items: session.items.filter(
            (item) =>
              item.category === kitchenCourse && !item.sentAt && !isOrderItemCanceled(item)
          )
        }))
        .filter(({ items }) => items.length > 0);

      const sentAt = new Date().toISOString();
      const table = next.tables.find((entry) => entry.id === tableId);
      const tableName = table?.name ?? tableId.replace("table-", "Tisch ");
      const kitchenPrintRequests: Parameters<typeof createPrintJob>[0][] = [];
      const pendingDrinkItems = session.items.filter(
        (item) => item.category === "drinks" && !item.sentAt && !isOrderItemCanceled(item)
      );

      if (course === "drinks" && pendingDrinkItems.length === 0) {
        return {
          ok: false,
          message: `Für ${courseLabels[course]} gibt es keine neuen Positionen.`
        };
      }

      if (course !== "drinks" && kitchenCourseItems.length === 0) {
        return {
          ok: false,
          message: "Für diesen Tisch gibt es keine neuen Speisen für die Küche."
        };
      }

      const sendPendingDrinksToBar = () => {
        if (pendingDrinkItems.length === 0) return false;

        const drinkBatch = createBarTicketBatch(session, tableId, pendingDrinkItems, sentAt);
        session.barTicketBatches.push(drinkBatch);

        pendingDrinkItems.forEach((item) => {
          item.sentAt = sentAt;
        });
        session.skippedCourses = session.skippedCourses.filter((entry) => entry !== "drinks");
        syncDrinkTicketFromBarBatches(session);

        return true;
      };

      if (course === "drinks") {
        sendPendingDrinksToBar();
        session.status = "waiting";
        emitOperatorFeedback();
        commit(next);
        return {
          ok: true,
          message: "Neue Getränke wurden an die Bar gesendet.",
          ticketStatus: session.courseTickets.drinks.status
        };
      }

      const drinksWereSent = sendPendingDrinksToBar();
      const sentKitchenCourseLabels: string[] = [];
      const waitingKitchenCourseLabels: string[] = [];

      kitchenCourseItems.forEach(({ course: kitchenCourse, items }) => {
        const kitchenTicket = session.courseTickets[kitchenCourse];
        const shouldWait = kitchenTicket.status === "countdown";
        const batchStatus: KitchenStatus = shouldWait ? "countdown" : "ready";
        const batch = createKitchenTicketBatch(
          session,
          tableId,
          kitchenCourse,
          items,
          sentAt,
          batchStatus
        );
        session.kitchenTicketBatches.push(batch);

        items.forEach((item) => {
          item.sentAt = sentAt;
          syncKitchenItemProgress(item);
        });
        session.skippedCourses = session.skippedCourses.filter((entry) => entry !== kitchenCourse);

        syncCourseTicketFromKitchenBatches(session, kitchenCourse);

        const batchLabel =
          batch.sequence > 1
            ? `${courseLabels[kitchenCourse]} · Nachbestellung ${batch.sequence}`
            : courseLabels[kitchenCourse];
        sentKitchenCourseLabels.push(batchLabel);
        if (shouldWait) {
          waitingKitchenCourseLabels.push(batchLabel);
        }
        if (table) {
          kitchenPrintRequests.push({
            type: "kitchen-ticket",
            session: structuredClone(session),
            table: structuredClone(table),
            products: structuredClone(next.products),
            batch: structuredClone(batch)
          });
        }

        withNotification(next, {
          title: shouldWait
            ? `${batchLabel} wartet`
            : `${batchLabel} gesendet`,
          body: shouldWait
            ? `${tableName}: ${batchLabel} wartet ${batch.countdownMinutes} Minuten, bevor die Küche startet.`
            : `${tableName} wartet auf ${batchLabel.toLowerCase()}.`,
          tone: "info",
          tableId
        }, currentUserId);
      });

      session.status = "waiting";
      emitOperatorFeedback();
      commit(next);
      if (kitchenPrintRequests.length > 0) {
        void Promise.all(kitchenPrintRequests.map((request) => createPrintJob(request)));
      }
      return {
        ok: true,
        message:
          `${sentKitchenCourseLabels.join(", ")} ${
            sentKitchenCourseLabels.length === 1 ? "wurde" : "wurden"
          } an die Küche gesendet.` +
          (waitingKitchenCourseLabels.length > 0
            ? ` ${waitingKitchenCourseLabels.join(", ")} ${
                waitingKitchenCourseLabels.length === 1 ? "läuft" : "laufen"
              } dort erst nach der Wartezeit frei.`
            : " Alle offenen Speisen sind direkt frei.") +
          (drinksWereSent ? " Offene Getränke wurden gleichzeitig an die Bar gesendet." : ""),
        ticketStatus: waitingKitchenCourseLabels.length > 0 ? ("countdown" as const) : ("ready" as const)
      };
    },
    [commit, currentUserId, state]
  );

  const cycleKitchenItemUnitStatus = useCallback(
    (tableId: string, batchId: string, itemId: string, unitIndex: number) => {
      const next = structuredClone(state);
      const session = getSessionForTable(next.sessions, tableId);
      if (!session) return;

      const batch = session.kitchenTicketBatches.find((entry) => entry.id === batchId);
      if (!batch || batch.status !== "ready") return;

      const item = getBatchItems(session, batch).find((entry) => entry.id === itemId);
      if (!item) return;

      const changedAt = new Date().toISOString();
      const nextStatus = cycleKitchenUnitState(item, unitIndex, changedAt);
      if (!nextStatus) return;

      if (isKitchenBatchCompletedByUnits(session, batch)) {
        completeCourseOrBatch(next, session, tableId, batch.course, changedAt, batch);
      } else {
        syncCourseTicketFromKitchenBatches(session, batch.course);
      }

      emitOperatorFeedback();
      commit(next);
    },
    [commit, state]
  );

  const reopenKitchenBatch = useCallback(
    (tableId: string, batchId: string) => {
      const next = structuredClone(state);
      const session = getSessionForTable(next.sessions, tableId);
      if (!session) return;

      const batch = session.kitchenTicketBatches.find((entry) => entry.id === batchId);
      if (!batch || batch.status !== "completed") return;

      const reopened = reopenCompletedKitchenBatch(next, session, tableId, batch);
      if (!reopened) return;

      emitOperatorFeedback();
      commit(next);
    },
    [commit, state]
  );

  const releaseCourse = useCallback(
    (tableId: string, course: CourseKey, batchId?: string) => {
      if (course === "drinks") {
        return;
      }

      const next = structuredClone(state);
      const session = getSessionForTable(next.sessions, tableId);
      if (!session) return;

      const batch = batchId
        ? session.kitchenTicketBatches.find((entry) => entry.id === batchId)
        : sortKitchenBatchesByNewest(
            getKitchenBatchesForCourse(session, course).filter(
              (entry) => entry.status === "countdown"
            )
          )[0];

      if (batch) {
        if (batch.course !== course || batch.status !== "countdown") return;

        batch.status = "ready";
        batch.manualRelease = true;
        batch.readyAt = new Date().toISOString();
        syncCourseTicketFromKitchenBatches(session, course);
        emitOperatorFeedback();
        commit(next);
        return;
      }

      const ticket = session.courseTickets[course];
      if (!ticket.sentAt || ticket.status === "completed" || ticket.status === "skipped") {
        return;
      }

      ticket.status = "ready";
      ticket.manualRelease = true;
      ticket.readyAt = new Date().toISOString();
      emitOperatorFeedback();
      commit(next);
    },
    [commit, state]
  );

  const markCourseCompleted = useCallback(
    (tableId: string, course: CourseKey, batchId?: string) => {
      const next = structuredClone(state);
      const session = getSessionForTable(next.sessions, tableId);
      if (!session) return;

      const completedAt = new Date().toISOString();
      const ticket = session.courseTickets[course];
      const batchPool =
        course === "drinks" ? session.barTicketBatches : session.kitchenTicketBatches;
      const batch = batchId
        ? batchPool.find((entry) => entry.id === batchId)
        : sortKitchenBatchesByNewest(
            (course === "drinks"
              ? getBarBatchesForCourse(session, course)
              : getKitchenBatchesForCourse(session, course)
            ).filter((entry) => entry.status === "ready")
          )[0];

      if (batch && (batch.course !== course || batch.status !== "ready")) {
        return;
      }

      if (!batch && (course === "drinks" || ticket.status !== "ready")) {
        return;
      }

      completeCourseOrBatch(next, session, tableId, course, completedAt, batch);
      emitOperatorFeedback();
      commit(next);
    },
    [commit, state]
  );

  const printReceipt = useCallback(
    (tableId: string, sessionIds?: string[]) => {
      const next = structuredClone(state);
      const sessions =
        sessionIds && sessionIds.length > 0
          ? next.sessions.filter((entry) => sessionIds.includes(entry.id))
          : getCheckoutTableIds(next, tableId)
              .map((checkoutTableId) => getSessionForTable(next.sessions, checkoutTableId))
              .filter((session): session is OrderSession => Boolean(session));
      if (sessions.length === 0) return;

      const printedAt = new Date().toISOString();

      sessions.forEach((session) => {
        session.receipt.printedAt = printedAt;
        session.status = "ready-to-bill";
      });

      withNotification(next, {
        kind: "admin-receipt-alarm",
        title: "Rechnung gedruckt",
        body: `${tableId.replace("table-", "Tisch ")} hat gerade eine Rechnung gedruckt. Bitte Abrechnung prüfen.`,
        tone: "alert",
        tableId,
        targetRoles: ["admin"]
      }, currentUserId);
      emitOperatorFeedback();
      commit(next);
    },
    [commit, currentUserId, state]
  );

  const reprintReceipt = useCallback(
    (tableId: string, sessionIdOrIds?: string | string[]) => {
      const next = structuredClone(state);
      const sessions = Array.isArray(sessionIdOrIds)
        ? next.sessions.filter((entry) => sessionIdOrIds.includes(entry.id))
        : sessionIdOrIds
          ? next.sessions.filter((entry) => entry.id === sessionIdOrIds)
          : getCheckoutTableIds(next, tableId)
              .map((checkoutTableId) => getSessionForTable(next.sessions, checkoutTableId))
              .filter((session): session is OrderSession => Boolean(session));
      const targetSessions =
        sessions.length > 0
          ? sessions
          : [
              [...next.sessions]
                .filter((entry) => entry.tableId === tableId)
                .sort((left, right) => {
                  const leftClosedAt = Date.parse(
                    left.receipt.closedAt ?? left.receipt.reprintedAt ?? left.receipt.printedAt ?? "0"
                  );
                  const rightClosedAt = Date.parse(
                    right.receipt.closedAt ?? right.receipt.reprintedAt ?? right.receipt.printedAt ?? "0"
                  );
                  return rightClosedAt - leftClosedAt;
                })[0]
            ].filter((session): session is OrderSession => Boolean(session));
      if (targetSessions.length === 0) return;

      const reprintedAt = new Date().toISOString();
      targetSessions.forEach((session) => {
        session.receipt.printedAt ??= reprintedAt;
        session.receipt.reprintedAt = reprintedAt;
      });

      withNotification(next, {
        kind: "admin-receipt-alarm",
        title: "Rechnung erneut gedruckt",
        body: `${tableId.replace("table-", "Tisch ")} hat gerade einen Rechnungs-Reprint gedruckt. Bitte Abrechnung prüfen.`,
        tone: "alert",
        tableId,
        targetRoles: ["admin"]
      }, currentUserId);
      emitOperatorFeedback();
      commit(next);
    },
    [commit, currentUserId, state]
  );

  const closeOrder = useCallback(
    (tableId: string, method: PaymentMethod) => {
      const next = structuredClone(state);
      const session = getSessionForTable(next.sessions, tableId);
      if (!session || !session.receipt.printedAt) return;

      const openLineItems = getOpenLineItems(session).map(({ item, openQuantity }) => ({
        itemId: item.id,
        quantity: openQuantity
      }));
      const total = calculateLineItemsTotal(session, next.products, openLineItems);
      const guests = calculateGuestCount(session);

      session.status = "closed";
      session.receipt.closedAt = new Date().toISOString();
      if (total > 0) {
        session.payments.push({
          id: createClientId("payment"),
          label: "Hauptzahlung",
          amountCents: total,
          method,
          lineItems: openLineItems,
          tableIds: [tableId]
        });
      }

      next.dailyStats.servedTables += 1;
      next.dailyStats.servedGuests += guests;
      next.dailyStats.revenueCents += total;
      next.dailyStats.closedOrderIds.push(session.id);

      withNotification(next, {
        title: "Bestellung geschlossen",
        body: `${tableId.replace("table-", "Tisch ")} wurde abgeschlossen.`,
        tone: "success",
        tableId
      }, currentUserId);
      emitOperatorFeedback();
      commit(next);
    },
    [commit, currentUserId, state]
  );

  const recordPartialPayment = useCallback(
    (
      tableIds: string[],
      selectedLineItems: PaymentLineItem[],
      method: PaymentMethod,
      label = "Teilzahlung"
    ) => {
      const uniqueTableIds = [...new Set(tableIds)];
      const next = structuredClone(state);
      const sessions = uniqueTableIds
        .map((tableId) => getSessionForTable(next.sessions, tableId))
        .filter((session): session is OrderSession => Boolean(session));

      if (sessions.length === 0) {
        return { ok: false, message: "Keine offene Bestellung für diese Auswahl gefunden." };
      }

      let bookedAmount = 0;
      const paidAt = new Date().toISOString();

      sessions.forEach((session) => {
        const sessionLineItems = normalizePaymentSelection(
          session,
          selectedLineItems.filter((lineItem) =>
            session.items.some((item) => item.id === lineItem.itemId)
          )
        );
        if (sessionLineItems.length === 0) return;

        const amountCents = calculateLineItemsTotal(session, next.products, sessionLineItems);
        if (amountCents <= 0) return;

        session.receipt.printedAt ??= paidAt;
        session.status = calculateSessionOpenTotal(session, next.products) - amountCents <= 0
          ? "ready-to-bill"
          : "serving";
        session.payments.push({
          id: createClientId("payment"),
          label: label.trim() || "Teilzahlung",
          amountCents,
          method,
          lineItems: sessionLineItems,
          tableIds: uniqueTableIds
        });
        bookedAmount += amountCents;
      });

      if (bookedAmount <= 0) {
        return { ok: false, message: "Bitte mindestens eine offene Position auswählen." };
      }

      withNotification(next, {
        title: "Teilzahlung verbucht",
        body: `${euro(bookedAmount)} wurden als ${label.trim() || "Teilzahlung"} gespeichert.`,
        tone: "success",
        tableId: uniqueTableIds[0]
      }, currentUserId);
      emitOperatorFeedback();
      commit(next);
      return { ok: true };
    },
    [commit, currentUserId, state]
  );

  const recordInvoiceCancellation = useCallback(
    (tableIds: string[], selectedLineItems: PaymentLineItem[], label = "Rechnungsstorno") => {
      const uniqueTableIds = [...new Set(tableIds)];
      const next = structuredClone(state);
      const sessions = uniqueTableIds
        .map((tableId) => getSessionForTable(next.sessions, tableId))
        .filter((session): session is OrderSession => Boolean(session));

      if (sessions.length === 0) {
        return { ok: false, message: "Keine offene Bestellung für diese Auswahl gefunden." };
      }

      let canceledAmount = 0;
      const canceledAt = new Date().toISOString();

      sessions.forEach((session) => {
        const sessionLineItems = normalizePaymentSelection(
          session,
          selectedLineItems.filter((lineItem) =>
            session.items.some((item) => item.id === lineItem.itemId)
          )
        );
        if (sessionLineItems.length === 0) return;

        const amountCents = calculateLineItemsTotal(session, next.products, sessionLineItems);
        if (amountCents <= 0) return;

        session.receipt.printedAt ??= canceledAt;
        session.cancellations.push({
          id: createClientId("cancellation"),
          label: label.trim() || "Rechnungsstorno",
          createdAt: canceledAt,
          createdByUserId: currentUserId ?? undefined,
          lineItems: sessionLineItems
        });
        session.status =
          calculateSessionOpenTotal(session, next.products) <= 0 ? "ready-to-bill" : "serving";
        canceledAmount += amountCents;
      });

      if (canceledAmount <= 0) {
        return { ok: false, message: "Bitte mindestens eine offene Position auswählen." };
      }

      withNotification(next, {
        title: "Rechnungsstorno gespeichert",
        body: `${euro(canceledAmount)} wurden als ${label.trim() || "Rechnungsstorno"} markiert.`,
        tone: "alert",
        tableId: uniqueTableIds[0]
      }, currentUserId);
      emitOperatorFeedback();
      commit(next);
      return { ok: true };
    },
    [commit, currentUserId, state]
  );

  const closePaidOrder = useCallback(
    (tableId: string) => {
      const next = structuredClone(state);
      const checkoutTableIds = getCheckoutTableIds(next, tableId);
      const sessions = checkoutTableIds
        .map((checkoutTableId) => getSessionForTable(next.sessions, checkoutTableId))
        .filter((session): session is OrderSession => Boolean(session));

      if (sessions.length === 0) {
        return { ok: false, message: "Keine offene Bestellung gefunden." };
      }

      const openTotal = sessions.reduce(
        (sum, session) => sum + calculateSessionOpenTotal(session, next.products),
        0
      );
      if (openTotal > 0) {
        return { ok: false, message: "Es sind noch Positionen offen." };
      }

      const closedAt = new Date().toISOString();
      sessions.forEach((session) => {
        if (session.status === "closed") return;
        session.status = "closed";
        session.receipt.printedAt ??= closedAt;
        session.receipt.closedAt = closedAt;
        next.dailyStats.servedTables += 1;
        next.dailyStats.servedGuests += calculateGuestCount(session);
        next.dailyStats.revenueCents += session.payments.reduce(
          (sum, payment) => sum + payment.amountCents,
          0
        );
        next.dailyStats.closedOrderIds.push(session.id);
      });

      const linkedGroup = getLinkedTableGroupForTable(next, tableId);
      if (linkedGroup) {
        linkedGroup.active = false;
      }

      withNotification(next, {
        title: "Bestellung geschlossen",
        body: `${checkoutTableIds.length > 1 ? "Gekoppelte Tische" : tableId.replace("table-", "Tisch ")} wurden abgeschlossen.`,
        tone: "success",
        tableId
      }, currentUserId);
      emitOperatorFeedback();
      commit(next);
      return { ok: true };
    },
    [commit, currentUserId, state]
  );

  const createPartyGroup = useCallback(
    (tableId: string, label: string) => {
      const next = structuredClone(state);
      const session = getSessionForTable(next.sessions, tableId);
      const normalizedLabel = label.trim();
      if (!session || !normalizedLabel) {
        return { ok: false, message: "Bitte zuerst eine Bestellung und einen Gruppennamen anlegen." };
      }

      const now = new Date().toISOString();
      session.partyGroups.push({
        id: createClientId("party"),
        label: normalizedLabel,
        itemIds: [],
        createdAt: now,
        updatedAt: now
      });
      commit(next);
      return { ok: true };
    },
    [commit, state]
  );

  const updatePartyGroup = useCallback(
    (tableId: string, groupId: string, label: string) => {
      const next = structuredClone(state);
      const session = getSessionForTable(next.sessions, tableId);
      const group = session?.partyGroups.find((entry) => entry.id === groupId);
      const normalizedLabel = label.trim();
      if (!session || !group || !normalizedLabel) {
        return { ok: false, message: "Gruppe konnte nicht aktualisiert werden." };
      }

      group.label = normalizedLabel;
      group.updatedAt = new Date().toISOString();
      commit(next);
      return { ok: true };
    },
    [commit, state]
  );

  const deletePartyGroup = useCallback(
    (tableId: string, groupId: string) => {
      const next = structuredClone(state);
      const session = getSessionForTable(next.sessions, tableId);
      if (!session) {
        return { ok: false, message: "Gruppe konnte nicht gelöscht werden." };
      }

      session.partyGroups = session.partyGroups.filter((group) => group.id !== groupId);
      commit(next);
      return { ok: true };
    },
    [commit, state]
  );

  const assignItemsToPartyGroup = useCallback(
    (tableId: string, groupId: string, itemIds: string[]) => {
      const next = structuredClone(state);
      const session = getSessionForTable(next.sessions, tableId);
      const group = session?.partyGroups.find((entry) => entry.id === groupId);
      if (!session || !group) {
        return { ok: false, message: "Gruppe konnte nicht gefunden werden." };
      }

      const validItemIds = new Set(session.items.map((item) => item.id));
      group.itemIds = [...new Set(itemIds.filter((itemId) => validItemIds.has(itemId)))];
      group.updatedAt = new Date().toISOString();
      commit(next);
      return { ok: true };
    },
    [commit, state]
  );

  const linkTables = useCallback(
    (tableIds: string[], label?: string) => {
      const uniqueTableIds = [...new Set(tableIds)].filter((tableId) =>
        state.tables.some((table) => table.id === tableId)
      );
      if (uniqueTableIds.length < 2) {
        return { ok: false, message: "Bitte mindestens zwei Tische auswählen." };
      }

      const next = structuredClone(state);
      next.linkedTableGroups = next.linkedTableGroups.map((group) =>
        group.tableIds.some((tableId) => uniqueTableIds.includes(tableId))
          ? { ...group, active: false }
          : group
      );
      next.linkedTableGroups.push({
        id: createClientId("linked-table"),
        label: label?.trim() || "Gemeinsame Abrechnung",
        tableIds: uniqueTableIds,
        active: true,
        createdAt: new Date().toISOString()
      });
      commit(next);
      return { ok: true };
    },
    [commit, state]
  );

  const unlinkTables = useCallback(
    (groupId: string) => {
      const next = structuredClone(state);
      const group = next.linkedTableGroups.find((entry) => entry.id === groupId);
      if (!group) {
        return { ok: false, message: "Tischkopplung wurde nicht gefunden." };
      }

      group.active = false;
      commit(next);
      return { ok: true };
    },
    [commit, state]
  );

  const createProduct = useCallback(
    (input: {
      name: string;
      description: string;
      category: ProductCategory;
      drinkSubcategory?: string;
      priceCents: number;
      taxRate: number;
      productionTarget: ProductionTarget;
      supportsExtraIngredients?: boolean;
    }) => {
      const name = input.name.trim();
      if (!name) {
        return { ok: false, message: "Bitte einen Produktnamen eingeben." };
      }
      const drinkSubcategory =
        input.category === "drinks" ? (input.drinkSubcategory ?? "").trim() : undefined;

      const next = structuredClone(state);
      next.products.unshift({
        id: createClientId("product"),
        name,
        description: input.description.trim() || "Neu angelegtes Produkt.",
        category: input.category,
        drinkSubcategory,
        priceCents: Math.max(0, input.priceCents),
        taxRate: input.taxRate,
        allergens: [],
        showInKitchen: input.productionTarget === "kitchen",
        productionTarget: input.productionTarget,
        modifierGroups: [],
        ...(input.supportsExtraIngredients ? { supportsExtraIngredients: true } : {})
      });

      withNotification(next, {
        title: "Produkt angelegt",
        body: `${name} wurde in den Stammdaten ergänzt.`,
        tone: "success"
      }, currentUserId);
      emitOperatorFeedback();
      commit(next);
      return { ok: true };
    },
    [commit, currentUserId, state]
  );

  const createExtraIngredient = useCallback(
    (input: { name: string; priceDeltaCents: number }) => {
      const name = input.name.trim();
      if (!name) {
        return { ok: false, message: "Bitte einen Zutatennamen eingeben." };
      }

      const next = structuredClone(state);
      next.extraIngredients ??= [];
      next.extraIngredients.push({
        id: createClientId("ingredient"),
        name,
        priceDeltaCents: Math.max(0, Math.round(input.priceDeltaCents)),
        active: true
      });
      commit(next);
      return { ok: true };
    },
    [commit, state]
  );

  const updateExtraIngredient = useCallback(
    (
      ingredientId: string,
      patch: Partial<Pick<ExtraIngredient, "name" | "priceDeltaCents" | "active">>
    ) => {
      const next = structuredClone(state);
      const ingredient = next.extraIngredients?.find((entry) => entry.id === ingredientId);
      if (!ingredient) return;

      if (patch.name !== undefined) {
        ingredient.name = patch.name;
      }
      if (patch.priceDeltaCents !== undefined) {
        ingredient.priceDeltaCents = Math.max(0, Math.round(patch.priceDeltaCents));
      }
      if (patch.active !== undefined) {
        ingredient.active = patch.active;
      }

      commit(next);
    },
    [commit, state]
  );

  const updateProduct = useCallback(
    (productId: string, patch: Partial<Product>) => {
      const next = structuredClone(state);
      const product = next.products.find((entry) => entry.id === productId);
      if (!product) return;

      const normalizedPatch = { ...patch };
      if (typeof normalizedPatch.drinkSubcategory === "string") {
        normalizedPatch.drinkSubcategory = normalizedPatch.drinkSubcategory.trim();
      }

      Object.assign(product, normalizedPatch);
      if (product.category !== "drinks") {
        delete product.drinkSubcategory;
      }
      if (patch.productionTarget !== undefined && patch.showInKitchen === undefined) {
        product.showInKitchen = patch.productionTarget === "kitchen";
      }
      commit(next);
    },
    [commit, state]
  );

  const deleteProduct = useCallback(
    (productId: string) => {
      const product = state.products.find((entry) => entry.id === productId);
      if (!product) {
        return { ok: false, message: "Produkt wurde nicht gefunden." };
      }

      const usedInClosedSession = state.sessions.some(
        (session) =>
          session.status === "closed" && session.items.some((item) => item.productId === productId)
      );
      if (usedInClosedSession) {
        return {
          ok: false,
          message:
            "Produkt ist bereits in abgeschlossenen Bestellungen enthalten und kann hier nicht gelöscht werden."
        };
      }

      const next = structuredClone(state);
      next.products = next.products.filter((entry) => entry.id !== productId);
      next.deletedProductIds = [...new Set([...(next.deletedProductIds ?? []), productId])];
      next.sessions = next.sessions.flatMap((session) => {
        session.items = session.items.filter((item) => item.productId !== productId);
        normalizeSessionAfterItemRemoval(session);

        if (session.status !== "closed" && session.items.length === 0) {
          return [];
        }

        return [session];
      });

      withNotification(next, {
        title: "Produkt gelöscht",
        body: `${product.name} wurde aus den Stammdaten entfernt.`,
        tone: "alert"
      }, currentUserId);
      emitOperatorFeedback();
      commit(next);
      return { ok: true };
    },
    [commit, currentUserId, state]
  );

  const deleteProductHard = useCallback(
    (productId: string) => {
      const product = state.products.find((entry) => entry.id === productId);
      if (!product) {
        return { ok: false, message: "Produkt wurde nicht gefunden." };
      }

      const next = structuredClone(state);
      let removedRevenueCents = 0;
      let removedGuests = 0;
      let removedClosedSessions = 0;
      const removedClosedSessionIds: string[] = [];

      next.products = next.products.filter((entry) => entry.id !== productId);
      next.deletedProductIds = [...new Set([...(next.deletedProductIds ?? []), productId])];
      next.sessions = next.sessions.flatMap((session) => {
        const containsProduct = session.items.some((item) => item.productId === productId);
        if (!containsProduct) {
          return [session];
        }

        const previousGuestCount = calculateGuestCount(session);
        const previousClosedAmount =
          session.status === "closed" ? getClosedSessionAmount(session, next.products) : 0;

        session.items = session.items.filter((item) => item.productId !== productId);
        normalizeSessionAfterItemRemoval(session);

        if (session.status === "closed") {
          const nextClosedAmount = getClosedSessionAmount(session, next.products);
          removedRevenueCents += previousClosedAmount - nextClosedAmount;
        }

        if (session.status !== "closed" && session.items.length === 0) {
          return [];
        }

        if (session.status === "closed" && session.items.length === 0) {
          removedGuests += previousGuestCount;
          removedClosedSessions += 1;
          removedClosedSessionIds.push(session.id);
          return [];
        }

        return [session];
      });
      next.dailyStats.revenueCents = Math.max(0, next.dailyStats.revenueCents - removedRevenueCents);
      next.dailyStats.servedGuests = Math.max(0, next.dailyStats.servedGuests - removedGuests);
      next.dailyStats.servedTables = Math.max(
        0,
        next.dailyStats.servedTables - removedClosedSessions
      );
      next.dailyStats.closedOrderIds = next.dailyStats.closedOrderIds.filter(
        (orderId) => !removedClosedSessionIds.includes(orderId)
      );

      withNotification(next, {
        title: "Produkt gelöscht",
        body: `${product.name} wurde aus den Stammdaten entfernt.`,
        tone: "alert"
      }, currentUserId);
      emitOperatorFeedback();
      commit(next);
      return { ok: true };
    },
    [commit, currentUserId, state]
  );

  const deleteSession = useCallback(
    (sessionId: string) => {
      const session = state.sessions.find((entry) => entry.id === sessionId);
      if (!session) {
        return { ok: false, message: "Bestellung wurde nicht gefunden." };
      }

      const next = structuredClone(state);
      const nextSession = next.sessions.find((entry) => entry.id === sessionId);
      if (!nextSession) {
        return { ok: false, message: "Bestellung wurde nicht gefunden." };
      }

      if (nextSession.status === "closed") {
        next.dailyStats.revenueCents = Math.max(
          0,
          next.dailyStats.revenueCents - getClosedSessionAmount(nextSession, next.products)
        );
        next.dailyStats.servedGuests = Math.max(
          0,
          next.dailyStats.servedGuests - calculateGuestCount(nextSession)
        );
        next.dailyStats.servedTables = Math.max(0, next.dailyStats.servedTables - 1);
        next.dailyStats.closedOrderIds = next.dailyStats.closedOrderIds.filter(
          (orderId) => orderId !== nextSession.id
        );
      }

      next.sessions = next.sessions.filter((entry) => entry.id !== sessionId);

      const tableName =
        next.tables.find((table) => table.id === nextSession.tableId)?.name ??
        nextSession.tableId.replace("table-", "Tisch ");

      withNotification(next, {
        title: "Bestellung gelöscht",
        body: `${tableName} wurde vollständig aus dem Betrieb entfernt.`,
        tone: "alert",
        tableId: nextSession.tableId
      }, currentUserId);
      emitOperatorFeedback();
      commit(next);
      return { ok: true };
    },
    [commit, currentUserId, state]
  );

  const createUser = useCallback(
    (input: { name: string; username: string; role: Role; password: string; pin?: string }) => {
      const name = input.name.trim();
      const username = input.username.trim();
      const password = input.password.trim();

      if (!name || !username || !password) {
        return { ok: false, message: "Name, Benutzername und Passwort sind Pflichtfelder." };
      }

      if (state.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
        return { ok: false, message: "Benutzername ist bereits vergeben." };
      }

      const next = structuredClone(state);
      next.users.unshift({
        id: createClientId("user"),
        name,
        username,
        role: input.role,
        password,
        pin: input.pin?.trim() || undefined,
        active: true,
        lastSeenAt: new Date().toISOString()
      });

      withNotification(next, {
        title: "Mitarbeiter angelegt",
        body: `${name} ist jetzt als ${input.role} hinterlegt.`,
        tone: "success"
      }, currentUserId);
      emitOperatorFeedback();
      commit(next);
      return { ok: true };
    },
    [commit, currentUserId, state]
  );

  const updateUser = useCallback(
    (userId: string, patch: Partial<UserAccount>) => {
      const next = structuredClone(state);
      const user = next.users.find((entry) => entry.id === userId);
      if (!user) {
        return { ok: false, message: "Benutzer wurde nicht gefunden." };
      }

      const nextName = patch.name !== undefined ? patch.name.trim() : user.name;
      const nextUsername = patch.username !== undefined ? patch.username.trim() : user.username;
      const nextPassword = patch.password !== undefined ? patch.password.trim() : user.password;
      const nextRole = patch.role ?? user.role;
      const nextActive = patch.active ?? user.active;

      if (!nextName || !nextUsername || !nextPassword) {
        return {
          ok: false,
          message: "Name, Benutzername und Passwort müssen ausgefüllt bleiben."
        };
      }

      if (
        next.users.some(
          (entry) =>
            entry.id !== userId && entry.username.toLowerCase() === nextUsername.toLowerCase()
        )
      ) {
        return { ok: false, message: "Benutzername ist bereits vergeben." };
      }

      const remainingAdminAccounts = next.users.filter(
        (entry) => entry.id !== userId && entry.role === "admin"
      ).length;
      const remainingActiveAdminAccounts = next.users.filter(
        (entry) => entry.id !== userId && entry.role === "admin" && entry.active
      ).length;

      if (user.role === "admin" && nextRole !== "admin" && remainingAdminAccounts === 0) {
        return { ok: false, message: "Mindestens ein Admin-Konto muss erhalten bleiben." };
      }

      if (user.role === "admin" && (!nextActive || nextRole !== "admin") && remainingActiveAdminAccounts === 0) {
        return {
          ok: false,
          message: "Mindestens ein aktives Admin-Konto muss erhalten bleiben."
        };
      }

      if (userId === currentUserId && patch.active === false) {
        return {
          ok: false,
          message: "Das aktuell angemeldete Konto kann nicht deaktiviert werden."
        };
      }

      Object.assign(user, patch, {
        name: nextName,
        username: nextUsername,
        password: nextPassword,
        pin: patch.pin !== undefined ? patch.pin?.trim() || undefined : user.pin
      });
      commit(next);
      return { ok: true };
    },
    [commit, currentUserId, state]
  );

  const deleteUser = useCallback(
    (userId: string) => {
      const user = state.users.find((entry) => entry.id === userId);
      if (!user) {
        return { ok: false, message: "Benutzer wurde nicht gefunden." };
      }

      if (currentUserId === userId) {
        return { ok: false, message: "Das aktuell angemeldete Konto kann nicht gelöscht werden." };
      }

      if (user.role === "admin" && state.users.filter((entry) => entry.role === "admin").length <= 1) {
        return { ok: false, message: "Mindestens ein Admin-Konto muss erhalten bleiben." };
      }

      const next = structuredClone(state);
      const fallbackUserId =
        next.users.find(
          (entry) =>
            entry.id === currentUserId &&
            entry.id !== userId &&
            (entry.role === "admin" || entry.role === "waiter")
        )?.id ??
        next.users.find(
          (entry) => entry.id !== userId && (entry.role === "admin" || entry.role === "waiter")
        )?.id;

      if (!fallbackUserId && next.sessions.some((session) => session.waiterId === userId)) {
        return {
          ok: false,
          message: "Benutzer kann nicht gelöscht werden, solange offene Zuordnungen bestehen."
        };
      }

      next.users = next.users.filter((entry) => entry.id !== userId);
      next.deletedUserIds = [...new Set([...(next.deletedUserIds ?? []), userId])];
      if (fallbackUserId) {
        next.sessions.forEach((session) => {
          if (session.waiterId === userId) {
            session.waiterId = fallbackUserId;
          }
        });
      }

      withNotification(next, {
        title: "Benutzer gelöscht",
        body: `${user.name} wurde aus der Verwaltung entfernt.`,
        tone: "alert"
      }, currentUserId);
      emitOperatorFeedback();
      commit(next);
      return { ok: true };
    },
    [commit, currentUserId, state]
  );

  const createTable = useCallback(
    (input: { name?: string; seatCount: number; active: boolean; note?: string }) => {
      const next = structuredClone(state);
      const seatCount = Math.max(1, Math.min(12, input.seatCount));
      const nextNumber = getNextTableNumber(next.tables);
      const tableId = `table-${nextNumber}`;
      const tableName = input.name?.trim() || `Tisch ${nextNumber}`;
      next.deletedTableIds = (next.deletedTableIds ?? []).filter((deletedId) => deletedId !== tableId);

      next.tables.push({
        id: tableId,
        name: tableName,
        seatCount,
        active: input.active,
        plannedOnly: !input.active,
        note: input.note?.trim() || undefined,
        seats: createSeats(tableId, seatCount),
        ...resolveTablePlacement(next.tables.length)
      });

      withNotification(next, {
        title: "Tisch angelegt",
        body: `${tableName} wurde zur Raumansicht hinzugefügt.`,
        tone: "success"
      }, currentUserId);
      emitOperatorFeedback();
      commit(next);
      return { ok: true };
    },
    [commit, currentUserId, state]
  );

  const updateTable = useCallback(
    (
      tableId: string,
      patch: Partial<Pick<TableLayout, "name" | "note" | "active" | "plannedOnly">>
    ) => {
      const next = structuredClone(state);
      const table = next.tables.find((entry) => entry.id === tableId);
      if (!table) return;

      Object.assign(table, patch);
      if (patch.active !== undefined && patch.plannedOnly === undefined) {
        table.plannedOnly = !patch.active;
      }

      commit(next);
    },
    [commit, state]
  );

  const setServiceOrderMode = useCallback(
    (mode: ServiceOrderMode) => {
      const next = structuredClone(state);
      next.serviceOrderMode = mode;
      commit(next);
    },
    [commit, state]
  );

  const setDesignMode = useCallback(
    (mode: DesignMode) => {
      const next = structuredClone(state);
      next.designMode = mode;
      commit(next);
    },
    [commit, state]
  );

  const setSeatVisible = useCallback(
    (tableId: string, seatId: string, visible: boolean) => {
      const next = structuredClone(state);
      const table = next.tables.find((entry) => entry.id === tableId);
      const seat = table?.seats.find((entry) => entry.id === seatId);
      if (!table || !seat) return;

      seat.visible = visible;

      if (!visible) {
        next.sessions
          .filter((session) => session.tableId === tableId && session.status !== "closed")
          .forEach((session) => {
            session.items.forEach((item) => {
              if (item.target.type === "seat" && item.target.seatId === seatId) {
                item.target = tableOrderTarget;
              }
            });
          });
      }

      commit(next);
    },
    [commit, state]
  );

  const toggleTableActive = useCallback(
    (tableId: string) => {
      const next = structuredClone(state);
      const table = next.tables.find((entry) => entry.id === tableId);
      if (!table) return;

      table.active = !table.active;
      table.plannedOnly = !table.active;
      commit(next);
    },
    [commit, state]
  );

  const resetDailyState = useCallback(() => {
    const next = structuredClone(state);
    const resetAt = new Date().toISOString();
    const sessionsToClose = next.sessions.filter((session) => session.status !== "closed");

    dailyResetUndoRef.current = structuredClone(state);

    sessionsToClose.forEach((session) => {
      session.status = "closed";
      session.receipt.closedAt = resetAt;
      session.courseTickets = Object.fromEntries(
        Object.entries(session.courseTickets).map(([course, ticket]) => [
          course,
          {
            ...ticket,
            status:
              ticket.status === "not-recorded" || ticket.status === "skipped"
                ? ticket.status
                : "completed",
            completedAt:
              ticket.status === "not-recorded" || ticket.status === "skipped"
                ? ticket.completedAt
                : ticket.completedAt ?? resetAt
          }
        ])
      ) as OrderSession["courseTickets"];
      session.kitchenTicketBatches.forEach((batch) => {
        if (batch.status !== "completed") {
          batch.status = "completed";
          batch.completedAt = batch.completedAt ?? resetAt;
        }
      });
      session.barTicketBatches.forEach((batch) => {
        if (batch.status !== "completed") {
          batch.status = "completed";
          batch.completedAt = batch.completedAt ?? resetAt;
        }
      });
    });

    next.dailyStats = {
      date: resetAt.slice(0, 10),
      revenueCents: 0,
      servedTables: 0,
      servedGuests: 0,
      closedOrderIds: []
    };

    commit(next);

    return {
      ok: true,
      closedSessions: sessionsToClose.length
    };
  }, [commit, state]);

  const undoDailyStateReset = useCallback(() => {
    const snapshot = dailyResetUndoRef.current;
    if (!snapshot) {
      return { ok: false, message: "Es gibt keinen Tagesreset, der rückgängig gemacht werden kann." };
    }

    dailyResetUndoRef.current = null;
    const nextUserId = snapshot.users.some((user) => user.id === currentUserId) ? currentUserId : null;
    commit(structuredClone(snapshot), nextUserId);
    return { ok: true };
  }, [commit, currentUserId]);

  const resetDemoState = useCallback(() => {
    const next = createDefaultOperationalState();
    const nextUserId = next.users.some((user) => user.id === currentUserId) ? currentUserId : null;
    commit(next, nextUserId);
  }, [commit, currentUserId]);

  const removeTableAndServices = useCallback(
    (tableId: string) => {
      const next = structuredClone(state);
      const table = next.tables.find((entry) => entry.id === tableId);
      if (!table) {
        return { ok: false, message: "Tisch konnte nicht gefunden werden." };
      }

      const relatedSessions = next.sessions.filter((session) => session.tableId === tableId);
      const closedSessions = relatedSessions.filter((session) => session.status === "closed");
      const revenueReduction = closedSessions.reduce(
        (sum, session) => sum + getClosedSessionAmount(session, next.products),
        0
      );
      const guestReduction = closedSessions.reduce(
        (sum, session) => sum + calculateGuestCount(session),
        0
      );

      next.tables = next.tables.filter((entry) => entry.id !== tableId);
      next.sessions = next.sessions.filter((session) => session.tableId !== tableId);
      next.notifications = next.notifications.filter((notification) => notification.tableId !== tableId);
      next.deletedTableIds = [...new Set([...(next.deletedTableIds ?? []), tableId])];
      next.dailyStats.servedTables = Math.max(0, next.dailyStats.servedTables - closedSessions.length);
      next.dailyStats.servedGuests = Math.max(0, next.dailyStats.servedGuests - guestReduction);
      next.dailyStats.revenueCents = Math.max(0, next.dailyStats.revenueCents - revenueReduction);
      next.dailyStats.closedOrderIds = next.dailyStats.closedOrderIds.filter(
        (orderId) => !closedSessions.some((session) => session.id === orderId)
      );

      withNotification(next, {
        title: "Tisch entfernt",
        body: `${table.name} und alle zugehörigen Leistungen wurden gelöscht.`,
        tone: "alert"
      }, currentUserId);
      emitOperatorFeedback();

      const nextUserId = next.users.some((user) => user.id === currentUserId) ? currentUserId : null;
      commit(next, nextUserId);
      return { ok: true };
    },
    [commit, currentUserId, state]
  );

  const markNotificationRead = useCallback(
    (notificationId: string, scope: "local" | "shared" | "shared-dismiss" = "local") => {
      if (scope === "shared" || scope === "shared-dismiss") {
        const next = structuredClone(state);
        const notification = next.notifications.find((entry) => entry.id === notificationId);
        if (!notification || notification.read) return;

        notification.read = true;

        if (
          scope === "shared" &&
          (notification.kind === "service-drinks-accepted" ||
            notification.kind === "service-course-ready-accepted")
        ) {
          markServiceDeliveryCompleted(notification, next);
          emitOperatorFeedback();
        }

        if (
          scope === "shared" &&
          (notification.kind === "service-drinks" || notification.kind === "service-course-ready")
        ) {
          const acceptedByUser = next.users.find((user) => user.id === currentUserId);
          const acceptedByName = acceptedByUser?.name ?? "Service";
          const { tableName, itemText } = resolveServiceDeliveryTask(notification, next);
          const isDrinkTask = notification.kind === "service-drinks";
          const course = resolveNotificationCourse(notification);

          withNotification(next, {
            kind: isDrinkTask ? "service-drinks-accepted" : "service-course-ready-accepted",
            course: course ?? undefined,
            itemIds: notification.itemIds,
            title: isDrinkTask ? "Getränke ausliefern" : "Speisen ausliefern",
            body: isDrinkTask
              ? `Bringe die Getränke ${itemText} zu ${tableName}.`
              : `Hole den fertigen Küchenbon ab und bringe ihn zu ${tableName}: ${itemText}.`,
            tone: "success",
            tableId: notification.tableId,
            acceptedByUserId: acceptedByUser?.id,
            acceptedByName,
            sourceNotificationId: notification.id
          }, currentUserId);
          emitOperatorFeedback();
        }

        commit(next);
        return;
      }

      const notification = state.notifications.find((entry) => entry.id === notificationId);
      if (!notification || notification.read) return;

      const readerKey = getNotificationReaderKey();
      const currentReads = localNotificationReads[readerKey] ?? [];
      if (currentReads.includes(notificationId)) {
        return;
      }

      const nextReads = {
        ...localNotificationReads,
        [readerKey]: [...currentReads, notificationId]
      };
      storeNotificationReads(nextReads);
      setLocalNotificationReads(nextReads);
    },
    [commit, currentUserId, localNotificationReads, state]
  );

  const markNotificationsRead = useCallback(
    (notificationIds: string[], scope: "local" = "local") => {
      if (scope !== "local") return;

      const uniqueNotificationIds = [...new Set(notificationIds)].filter((notificationId) =>
        state.notifications.some((notification) => notification.id === notificationId && !notification.read)
      );
      if (uniqueNotificationIds.length === 0) return;

      const readerKey = getNotificationReaderKey();
      const currentReads = localNotificationReads[readerKey] ?? [];
      const currentReadSet = new Set(currentReads);
      const nextIds = uniqueNotificationIds.filter((notificationId) => !currentReadSet.has(notificationId));
      if (nextIds.length === 0) return;

      const nextReads = {
        ...localNotificationReads,
        [readerKey]: [...currentReads, ...nextIds]
      };
      storeNotificationReads(nextReads);
      setLocalNotificationReads(nextReads);
    },
    [localNotificationReads, state.notifications]
  );

  const currentUser = state.users.find((user) => user.id === currentUserId);
  const readerKey = getNotificationReaderKey();
  const hiddenNotificationIds = new Set(localNotificationReads[readerKey] ?? []);
  const unreadNotifications = state.notifications.filter(
    (notification) =>
      !notification.read &&
      !hiddenNotificationIds.has(notification.id) &&
      !isNotificationExpired(notification, notificationClock) &&
      (!notification.targetRoles?.length ||
        (currentUser ? notification.targetRoles.includes(currentUser.role) : false)) &&
      ((notification.kind !== "service-drinks-accepted" &&
        notification.kind !== "service-course-ready-accepted") ||
        !notification.acceptedByUserId ||
        notification.acceptedByUserId === currentUserId)
  );

  const value = useMemo<DemoContextValue>(
    () => ({
      hydrated,
      state,
      currentUser,
      unreadNotifications,
      sharedSync,
      actions: {
        login,
        startWorkspaceSession,
        logout,
        addItem,
        updateItem,
        setItemExtraIngredients,
        removeItem,
        skipCourse,
        setCourseWait,
        sendCourseToKitchen,
        cycleKitchenItemUnitStatus,
        reopenKitchenBatch,
        releaseCourse,
        markCourseCompleted,
        printReceipt,
        reprintReceipt,
        closeOrder,
        closePaidOrder,
        recordPartialPayment,
        recordInvoiceCancellation,
        createPartyGroup,
        updatePartyGroup,
        deletePartyGroup,
        assignItemsToPartyGroup,
        linkTables,
        unlinkTables,
        createProduct,
        createExtraIngredient,
        updateExtraIngredient,
        updateProduct,
        deleteProduct: deleteProductHard,
        deleteSession,
        createUser,
        updateUser,
        deleteUser,
        createTable,
        updateTable,
        setServiceOrderMode,
        setDesignMode,
        setSeatVisible,
        toggleTableActive,
        resetDailyState,
        undoDailyStateReset,
        resetDemoState,
        removeTableAndServices,
        markNotificationRead,
        markNotificationsRead
      }
    }),
    [
      addItem,
      assignItemsToPartyGroup,
      closeOrder,
      closePaidOrder,
      createExtraIngredient,
      createPartyGroup,
      createProduct,
      createTable,
      createUser,
      cycleKitchenItemUnitStatus,
      reopenKitchenBatch,
      deletePartyGroup,
      currentUser,
      deleteProductHard,
      deleteSession,
      deleteUser,
      hydrated,
      login,
      startWorkspaceSession,
      logout,
      markCourseCompleted,
      markNotificationRead,
      markNotificationsRead,
      printReceipt,
      releaseCourse,
      reopenKitchenBatch,
      removeItem,
      reprintReceipt,
      recordPartialPayment,
      recordInvoiceCancellation,
      resetDailyState,
      resetDemoState,
      removeTableAndServices,
      sendCourseToKitchen,
      setItemExtraIngredients,
      setCourseWait,
      setDesignMode,
      setSeatVisible,
      setServiceOrderMode,
      sharedSync,
      skipCourse,
      state,
      toggleTableActive,
      undoDailyStateReset,
      unlinkTables,
      unreadNotifications,
      updateExtraIngredient,
      updatePartyGroup,
      updateTable,
      updateItem,
      updateProduct,
      updateUser
    ]
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
};

export const useDemoApp = () => {
  const context = useContext(DemoContext);
  if (!context) {
    throw new Error("useDemoApp must be used inside DemoAppProvider");
  }

  return context;
};

export const resolveCourseStatus = (session: OrderSession | undefined, course: CourseKey) => {
  const unsentItems = session?.items.filter((item) => item.category === course && !item.sentAt) ?? [];
  if (unsentItems.length > 0) {
    return {
      status: "not-recorded" as const,
      minutesLeft: 0
    };
  }

  if (session && course === "drinks") {
    const batches = getBarBatchesForCourse(session, course);
    if (batches.length > 0) {
      const activeBatch = [...batches]
        .filter((batch) => batch.status !== "completed" && batch.status !== "skipped")
        .sort((left, right) => {
          const rankDelta = kitchenTicketStatusRank[left.status] - kitchenTicketStatusRank[right.status];
          if (rankDelta !== 0) return rankDelta;
          if (right.sequence !== left.sequence) return right.sequence - left.sequence;
          return new Date(right.sentAt).getTime() - new Date(left.sentAt).getTime();
        })[0];
      const latestBatch = activeBatch ?? sortKitchenBatchesByNewest(batches)[0];

      return {
        status: latestBatch?.status ?? ("not-recorded" as const),
        minutesLeft: 0
      };
    }
  }

  if (session && course !== "drinks") {
    const batches = getKitchenBatchesForCourse(session, course);
    if (batches.length > 0) {
      const activeBatch = [...batches]
        .filter((batch) => batch.status !== "completed" && batch.status !== "skipped")
        .sort((left, right) => {
          const rankDelta = kitchenTicketStatusRank[left.status] - kitchenTicketStatusRank[right.status];
          if (rankDelta !== 0) return rankDelta;
          if (right.sequence !== left.sequence) return right.sequence - left.sequence;
          return new Date(right.sentAt).getTime() - new Date(left.sentAt).getTime();
        })[0];
      const latestBatch = activeBatch ?? sortKitchenBatchesByNewest(batches)[0];

      if (latestBatch?.status !== "countdown") {
        return {
          status: latestBatch?.status ?? ("not-recorded" as const),
          minutesLeft: 0
        };
      }

      const waitMinutes = Math.max(1, latestBatch.countdownMinutes || 1);
      const waitStartedAt = latestBatch.releasedAt ?? latestBatch.sentAt;
      const startTime = new Date(waitStartedAt).getTime();
      if (!Number.isFinite(startTime)) {
        return {
          status: "countdown" as const,
          minutesLeft: waitMinutes
        };
      }

      const deadline = startTime + waitMinutes * 60 * 1000;
      return {
        status: "countdown" as const,
        minutesLeft: Math.max(0, Math.ceil((deadline - Date.now()) / 60000))
      };
    }
  }

  const ticket = session?.courseTickets[course];
  if (!ticket) {
    return {
      status: "not-recorded" as const,
      minutesLeft: 0
    };
  }

  if (ticket.status !== "blocked" && ticket.status !== "countdown") {
    return {
      status: ticket.status,
      minutesLeft: 0
    };
  }

  if (ticket.status === "blocked") {
    return {
      status: "blocked" as const,
      minutesLeft: 0
    };
  }

  const waitMinutes = Math.max(1, ticket.countdownMinutes || 1);
  const waitStartedAt = ticket.releasedAt ?? ticket.sentAt;
  if (!waitStartedAt) {
    return {
      status: "countdown" as const,
      minutesLeft: waitMinutes
    };
  }

  const startTime = new Date(waitStartedAt).getTime();
  if (!Number.isFinite(startTime)) {
    return {
      status: "countdown" as const,
      minutesLeft: waitMinutes
    };
  }

  const deadline = startTime + waitMinutes * 60 * 1000;
  const minutesLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 60000));

  return {
    status: "countdown" as const,
    minutesLeft
  };
};

export const resolveProductName = (products: Product[], productId: string) =>
  getProductById(products, productId)?.name ?? "Unbekannt";

export const getOrderableProducts = (products: Product[], course: CourseKey) =>
  products.filter((product) => product.category === course);

export const getServiceStepIndex = (course: CourseKey | "review") =>
  course === "review" ? serviceCourseOrder.length : serviceCourseOrder.indexOf(course);

export { calculateSessionTotal, courseLabels, getSessionForTable };
