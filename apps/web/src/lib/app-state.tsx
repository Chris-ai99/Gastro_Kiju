"use client";

import {
  calculateGuestCount,
  calculateSessionTotal,
  courseLabels,
  createDefaultOperationalState as createSeedOperationalState,
  getProductById,
  getSessionForTable,
  normalizeOperationalState,
  type AppNotification,
  type AppState,
  type CourseKey,
  type CourseTicket,
  type OrderSession,
  type PaymentMethod,
  type Product,
  type ProductCategory,
  type ProductionTarget,
  type Role,
  type SessionStatus,
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

const STORAGE_KEY = "kiju-app-state-v2";
const AUTH_KEY = "kiju-auth-v2";
const SHARED_SYNC_POLL_MS = 1000;
const DEFAULT_API_PORT = process.env["NEXT_PUBLIC_KIJU_API_PORT"] ?? "4000";

type SharedSyncState = {
  status: "connecting" | "online" | "offline";
  lastSyncedAt?: string;
  usingSharedState: boolean;
};

type DemoActions = {
  login: (identifier: string, secret: string) => {
    ok: boolean;
    user?: UserAccount;
    message?: string;
  };
  logout: () => void;
  addItem: (tableId: string, seatId: string, productId: string) => void;
  updateItem: (
    tableId: string,
    itemId: string,
    patch: Partial<Pick<OrderSession["items"][number], "seatId" | "quantity" | "note">>
  ) => void;
  removeItem: (tableId: string, itemId: string) => void;
  skipCourse: (tableId: string, course: CourseKey) => void;
  sendCourseToKitchen: (
    tableId: string,
    course: CourseKey
  ) => { ok: boolean; message?: string; ticketStatus?: CourseTicket["status"] | "ready" };
  releaseCourse: (tableId: string, course: CourseKey) => void;
  markCourseCompleted: (tableId: string, course: CourseKey) => void;
  setSessionStatus: (tableId: string, status: SessionStatus, holdReason?: string) => void;
  printReceipt: (tableId: string) => void;
  reprintReceipt: (tableId: string) => void;
  closeOrder: (tableId: string, method: PaymentMethod) => void;
  createProduct: (input: {
    name: string;
    description: string;
    category: ProductCategory;
    priceCents: number;
    taxRate: number;
    productionTarget: ProductionTarget;
  }) => { ok: boolean; message?: string };
  updateProduct: (productId: string, patch: Partial<Product>) => void;
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
  toggleTableActive: (tableId: string) => void;
  resetDemoState: () => void;
  removeTableAndServices: (tableId: string) => void;
  markNotificationRead: (notificationId: string) => void;
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

const DemoContext = createContext<DemoContextValue | null>(null);

const serviceCourseOrder: CourseKey[] = ["drinks", "starter", "main", "dessert"];
const kitchenSequence: CourseKey[] = ["starter", "main", "dessert"];
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
const createSeats = (tableId: string, seatCount: number) =>
  Array.from({ length: seatCount }, (_, index) => ({
    id: `${tableId}-seat-${index + 1}`,
    label: `P${index + 1}`
  }));
const floorplanSeatOverrides: Partial<Record<TableLayout["id"], number>> = {
  "table-1": 5,
  "table-2": 5,
  "table-3": 5,
  "table-4": 5,
  "table-5": 4,
  "table-6": 5
};
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
          ? createSeats(table.id, requiredSeatCount)
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

const createSession = (tableId: string, waiterId: string): OrderSession => ({
  id: createClientId(`session-${tableId}`),
  tableId,
  waiterId,
  status: "serving",
  items: [],
  skippedCourses: [],
  courseTickets: createBaseTickets(),
  payments: [],
  receipt: {}
});

const getPreviousKitchenCourse = (course: CourseKey) => {
  const index = kitchenSequence.indexOf(course);
  if (index <= 0) return undefined;
  return kitchenSequence[index - 1];
};

const getNextKitchenCourse = (course: CourseKey) => {
  const index = kitchenSequence.indexOf(course);
  if (index < 0 || index === kitchenSequence.length - 1) return undefined;
  return kitchenSequence[index + 1];
};

const isCourseResolved = (session: OrderSession, course: CourseKey) => {
  const status = session.courseTickets[course].status;
  return status === "completed" || status === "skipped" || status === "not-recorded";
};

const withNotification = (
  state: AppState,
  notification: Omit<AppNotification, "id" | "createdAt" | "read">
) => {
  state.notifications.unshift({
    id: createClientId("notification"),
    createdAt: new Date().toISOString(),
    read: false,
    ...notification
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
  return paymentTotal > 0 ? paymentTotal : calculateSessionTotal(session, products);
};
const normalizeSessionAfterItemRemoval = (session: OrderSession) => {
  for (const course of serviceCourseOrder) {
    const hasItems = session.items.some((item) => item.category === course);
    if (!hasItems && !session.skippedCourses.includes(course)) {
      session.courseTickets[course] = createBaseTicket(course);
    }
  }
};

const commitStorage = (state: AppState, currentUserId: string | null) => {
  if (typeof window === "undefined") return;

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  localStorage.setItem(AUTH_KEY, JSON.stringify({ currentUserId }));
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

  const rawAuth = localStorage.getItem(AUTH_KEY);
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

  return `${window.location.protocol}//${window.location.hostname}:${DEFAULT_API_PORT}/api/state`;
};

const fetchSharedSnapshot = async () => {
  const sharedStateUrl = resolveSharedStateUrl();
  if (!sharedStateUrl) return null;

  try {
    const response = await fetch(sharedStateUrl, {
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as SharedStateSnapshot;
  } catch {
    return null;
  }
};

const replaceSharedSnapshot = async (state: AppState) => {
  const sharedStateUrl = resolveSharedStateUrl();
  if (!sharedStateUrl) return null;

  try {
    const response = await fetch(sharedStateUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(state)
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as SharedStateSnapshot;
  } catch {
    return null;
  }
};

export const DemoAppProvider = ({ children }: PropsWithChildren) => {
  const [state, setState] = useState<AppState>(() => createFreshOperationalState());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [sharedSync, setSharedSync] = useState<SharedSyncState>({
    status: "connecting",
    usingSharedState: false
  });
  const channelRef = useRef<BroadcastChannel | null>(null);
  const sharedSyncEnabledRef = useRef(false);
  const sharedVersionRef = useRef<number | null>(null);

  const broadcast = useCallback((nextState: AppState, nextUserId: string | null) => {
    channelRef.current?.postMessage({
      state: nextState,
      currentUserId: nextUserId
    });
  }, []);

  const commit = useCallback(
    (nextState: AppState, nextUserId: string | null = currentUserId) => {
      const normalizedState = normalizeAppState(nextState);

      setState(normalizedState);
      setCurrentUserId(nextUserId);
      commitStorage(normalizedState, nextUserId);
      broadcast(normalizedState, nextUserId);

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
    if (typeof window === "undefined") return;

    const storedState = readStoredState();
    const storedAuth = readStoredAuth();

    if (storedState) {
      setState(normalizeAppState(storedState));
    }

    if (storedAuth) {
      setCurrentUserId(storedAuth.currentUserId);
    }

    if ("BroadcastChannel" in window) {
      channelRef.current = new BroadcastChannel("kiju-app-sync-v2");
      channelRef.current.onmessage = (event) => {
        const payload = event.data as { state: AppState; currentUserId: string | null };
        setState(normalizeAppState(payload.state));
        setCurrentUserId(payload.currentUserId);
      };
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue) {
        try {
          setState(normalizeAppState(JSON.parse(event.newValue) as AppState));
        } catch {
          // Ignore malformed local cache entries.
        }
      }

      if (event.key === AUTH_KEY && event.newValue) {
        try {
          const parsedAuth = JSON.parse(event.newValue) as { currentUserId: string | null };
          setCurrentUserId(parsedAuth.currentUserId);
        } catch {
          // Ignore malformed local auth cache entries.
        }
      }
    };

    window.addEventListener("storage", handleStorage);
    let isActive = true;
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    const hydrateSharedState = async () => {
      const snapshot = await fetchSharedSnapshot();

      if (snapshot && isActive) {
        sharedSyncEnabledRef.current = true;
        sharedVersionRef.current = snapshot.version;
        const normalizedSnapshotState = normalizeAppState(snapshot.state);
        setState(normalizedSnapshotState);
        commitStorage(normalizedSnapshotState, storedAuth?.currentUserId ?? null);
        setSharedSync({
          status: "online",
          usingSharedState: true,
          lastSyncedAt: snapshot.updatedAt
        });

        if (JSON.stringify(normalizedSnapshotState) !== JSON.stringify(snapshot.state)) {
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

        pollTimer = setInterval(async () => {
          const latestSnapshot = await fetchSharedSnapshot();
          if (!latestSnapshot || !isActive) return;
          if (sharedVersionRef.current === latestSnapshot.version) return;

          sharedVersionRef.current = latestSnapshot.version;
          const normalizedSnapshotState = normalizeAppState(latestSnapshot.state);
          setState(normalizedSnapshotState);
          commitStorage(normalizedSnapshotState, storedAuth?.currentUserId ?? null);
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

      if (isActive) {
        setHydrated(true);
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
      const user = state.users.find((candidate) => {
        const identifierMatches =
          candidate.username.toLowerCase() === identifier.toLowerCase() ||
          candidate.name.toLowerCase() === identifier.toLowerCase();
        const secretMatches = candidate.password === secret || candidate.pin === secret;

        return candidate.active && identifierMatches && secretMatches;
      });

      if (!user) {
        return {
          ok: false,
          message: "Login nicht gefunden. Bitte Benutzername und Passwort oder PIN prüfen."
        };
      }

      commit(state, user.id);
      return { ok: true, user };
    },
    [commit, state]
  );

  const logout = useCallback(() => {
    commit(state, null);
  }, [commit, state]);

  const addItem = useCallback(
    (tableId: string, seatId: string, productId: string) => {
      const next = structuredClone(state);
      const fallbackWaiterId = state.users.find((user) => user.role === "waiter")?.id;
      const waiterId = currentUserId ?? fallbackWaiterId;
      if (!waiterId) return;

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
        seatId,
        productId,
        category: product.category,
        quantity: 1,
        modifiers: []
      });

      if (session.courseTickets[product.category].status === "not-recorded") {
        session.courseTickets[product.category].status = "blocked";
      }

      commit(next);
    },
    [commit, currentUserId, state]
  );

  const updateItem = useCallback(
    (
      tableId: string,
      itemId: string,
      patch: Partial<Pick<OrderSession["items"][number], "seatId" | "quantity" | "note">>
    ) => {
      const next = structuredClone(state);
      const session = getSessionForTable(next.sessions, tableId);
      if (!session || session.status === "closed") return;

      const item = session.items.find((entry) => entry.id === itemId);
      if (!item) return;

      if (patch.seatId !== undefined) {
        item.seatId = patch.seatId;
      }

      if (patch.quantity !== undefined) {
        item.quantity = Math.max(1, Math.min(20, patch.quantity));
      }

      if (patch.note !== undefined) {
        const note = patch.note.trim();
        item.note = note ? note : undefined;
      }

      commit(next);
    },
    [commit, state]
  );

  const removeItem = useCallback(
    (tableId: string, itemId: string) => {
      const next = structuredClone(state);
      const session = getSessionForTable(next.sessions, tableId);
      if (!session || session.status === "closed") return;

      session.items = session.items.filter((entry) => entry.id !== itemId);
      normalizeSessionAfterItemRemoval(session);

      if (session.items.length === 0) {
        next.sessions = next.sessions.filter((entry) => entry.id !== session.id);
      }

      commit(next);
    },
    [commit, state]
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

      const nextCourse = getNextKitchenCourse(course);
      if (nextCourse && session.courseTickets[nextCourse].status === "blocked") {
        session.courseTickets[nextCourse].status = "countdown";
        session.courseTickets[nextCourse].releasedAt = new Date().toISOString();
      }

      commit(next);
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

      const courseItems = session.items.filter((item) => item.category === course);
      if (courseItems.length === 0 && !session.skippedCourses.includes(course)) {
        return {
          ok: false,
          message: `Für ${courseLabels[course]} wurden noch keine Positionen erfasst.`
        };
      }

      const ticket = session.courseTickets[course];
      ticket.sentAt = new Date().toISOString();
      const tableName =
        next.tables.find((table) => table.id === tableId)?.name ?? tableId.replace("table-", "Tisch ");

      if (course === "drinks") {
        ticket.status = "completed";
        ticket.completedAt = new Date().toISOString();
        session.status = "waiting";
        withNotification(next, {
          title: "Getränke im Service",
          body: `${tableName} wurde im Service vermerkt.`,
          tone: "info",
          tableId
        });
        emitOperatorFeedback();
        commit(next);
        return {
          ok: true,
          message: "Getränke wurden gespeichert und direkt im Service verbucht.",
          ticketStatus: ticket.status
        };
      }

      const previousCourse = getPreviousKitchenCourse(course);
      if (!previousCourse || isCourseResolved(session, previousCourse)) {
        ticket.status = "countdown";
        ticket.releasedAt = new Date().toISOString();
      } else {
        ticket.status = "blocked";
      }

      session.status = "waiting";
      withNotification(next, {
        title: `${courseLabels[course]} gesendet`,
        body: `${tableName} wartet auf die ${courseLabels[course].toLowerCase()}.`,
        tone: "info",
        tableId
      });
      emitOperatorFeedback();
      commit(next);
      return {
        ok: true,
        message:
          ticket.status === "blocked"
            ? `${courseLabels[course]} wurde an die Küche gesendet und wartet auf die Freigabe nach dem vorherigen Gang.`
            : `${courseLabels[course]} wurde an die Küche gesendet und läuft jetzt in der Küchenwarteschlange.`,
        ticketStatus: ticket.status
      };
    },
    [commit, state]
  );

  const releaseCourse = useCallback(
    (tableId: string, course: CourseKey) => {
      const next = structuredClone(state);
      const session = getSessionForTable(next.sessions, tableId);
      if (!session) return;

      const ticket = session.courseTickets[course];
      ticket.status = "countdown";
      ticket.manualRelease = true;
      ticket.releasedAt = new Date().toISOString();

      withNotification(next, {
        title: `${courseLabels[course]} freigegeben`,
        body: `${tableId.replace("table-", "Tisch ")} wurde für die Küche freigegeben.`,
        tone: "alert",
        tableId
      });
      emitOperatorFeedback();
      commit(next);
    },
    [commit, state]
  );

  const markCourseCompleted = useCallback(
    (tableId: string, course: CourseKey) => {
      const next = structuredClone(state);
      const session = getSessionForTable(next.sessions, tableId);
      if (!session) return;

      session.courseTickets[course].status = "completed";
      session.courseTickets[course].completedAt = new Date().toISOString();

      session.items
        .filter((item) => item.category === course)
        .forEach((item) => {
          item.preparedAt = new Date().toISOString();
        });

      const nextCourse = getNextKitchenCourse(course);
      if (nextCourse && session.courseTickets[nextCourse].status === "blocked") {
        session.courseTickets[nextCourse].status = "countdown";
        session.courseTickets[nextCourse].releasedAt = new Date().toISOString();
      }

      if (course === "dessert" || course === "main") {
        session.status = "ready-to-bill";
      }

      withNotification(next, {
        title: `${courseLabels[course]} fertig`,
        body: `${tableId.replace("table-", "Tisch ")} kann jetzt serviert werden.`,
        tone: "success",
        tableId
      });
      emitOperatorFeedback();
      commit(next);
    },
    [commit, state]
  );

  const setSessionStatus = useCallback(
    (tableId: string, status: SessionStatus, holdReason?: string) => {
      const next = structuredClone(state);
      const session = getSessionForTable(next.sessions, tableId);
      if (!session) return;

      session.status = status;
      session.holdReason = holdReason;
      commit(next);
    },
    [commit, state]
  );

  const printReceipt = useCallback(
    (tableId: string) => {
      const next = structuredClone(state);
      const session = getSessionForTable(next.sessions, tableId);
      if (!session) return;

      session.receipt.printedAt = new Date().toISOString();
      session.status = "ready-to-bill";
      withNotification(next, {
        title: "Rechnung gedruckt",
        body: `${tableId.replace("table-", "Tisch ")} hat jetzt einen Erstbeleg.`,
        tone: "success",
        tableId
      });
      emitOperatorFeedback();
      commit(next);
    },
    [commit, state]
  );

  const reprintReceipt = useCallback(
    (tableId: string) => {
      const next = structuredClone(state);
      const session = getSessionForTable(next.sessions, tableId);
      if (!session) return;

      session.receipt.printedAt ??= new Date().toISOString();
      session.receipt.reprintedAt = new Date().toISOString();
      withNotification(next, {
        title: "Rechnung erneut gedruckt",
        body: `${tableId.replace("table-", "Tisch ")} hat einen Reprint.`,
        tone: "info",
        tableId
      });
      emitOperatorFeedback();
      commit(next);
    },
    [commit, state]
  );

  const closeOrder = useCallback(
    (tableId: string, method: PaymentMethod) => {
      const next = structuredClone(state);
      const session = getSessionForTable(next.sessions, tableId);
      if (!session || !session.receipt.printedAt) return;

      const total = calculateSessionTotal(session, next.products);
      const guests = calculateGuestCount(session);

      session.status = "closed";
      session.receipt.closedAt = new Date().toISOString();
      session.payments = [
        {
          id: createClientId("payment"),
          label: "Hauptzahlung",
          amountCents: total,
          method
        }
      ];

      next.dailyStats.servedTables += 1;
      next.dailyStats.servedGuests += guests;
      next.dailyStats.revenueCents += total;
      next.dailyStats.closedOrderIds.push(session.id);

      withNotification(next, {
        title: "Bestellung geschlossen",
        body: `${tableId.replace("table-", "Tisch ")} wurde abgeschlossen.`,
        tone: "success",
        tableId
      });
      emitOperatorFeedback();
      commit(next);
    },
    [commit, state]
  );

  const createProduct = useCallback(
    (input: {
      name: string;
      description: string;
      category: ProductCategory;
      priceCents: number;
      taxRate: number;
      productionTarget: ProductionTarget;
    }) => {
      const name = input.name.trim();
      if (!name) {
        return { ok: false, message: "Bitte einen Produktnamen eingeben." };
      }

      const next = structuredClone(state);
      next.products.unshift({
        id: createClientId("product"),
        name,
        description: input.description.trim() || "Neu angelegtes Produkt.",
        category: input.category,
        priceCents: Math.max(0, input.priceCents),
        taxRate: input.taxRate,
        allergens: [],
        showInKitchen: input.productionTarget === "kitchen",
        productionTarget: input.productionTarget,
        modifierGroups: []
      });

      withNotification(next, {
        title: "Produkt angelegt",
        body: `${name} wurde in den Stammdaten ergänzt.`,
        tone: "success"
      });
      emitOperatorFeedback();
      commit(next);
      return { ok: true };
    },
    [commit, state]
  );

  const updateProduct = useCallback(
    (productId: string, patch: Partial<Product>) => {
      const next = structuredClone(state);
      const product = next.products.find((entry) => entry.id === productId);
      if (!product) return;

      Object.assign(product, patch);
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
      });
      emitOperatorFeedback();
      commit(next);
      return { ok: true };
    },
    [commit, state]
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
      });
      emitOperatorFeedback();
      commit(next);
      return { ok: true };
    },
    [commit, state]
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
      });
      emitOperatorFeedback();
      commit(next);
      return { ok: true };
    },
    [commit, state]
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
      });
      emitOperatorFeedback();
      commit(next);
      return { ok: true };
    },
    [commit, state]
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
        currentUserId ??
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
      });
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
      });
      emitOperatorFeedback();
      commit(next);
      return { ok: true };
    },
    [commit, state]
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

  const resetDemoState = useCallback(() => {
    const next = createDefaultOperationalState();
    const nextUserId = next.users.some((user) => user.id === currentUserId) ? currentUserId : null;
    commit(next, nextUserId);
  }, [commit, currentUserId]);

  const removeTableAndServices = useCallback(
    (tableId: string) => {
      const next = structuredClone(state);
      const table = next.tables.find((entry) => entry.id === tableId);
      if (!table) return;

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
      });
      emitOperatorFeedback();

      const nextUserId = next.users.some((user) => user.id === currentUserId) ? currentUserId : null;
      commit(next, nextUserId);
    },
    [commit, currentUserId, state]
  );

  const markNotificationRead = useCallback(
    (notificationId: string) => {
      const next = structuredClone(state);
      const notification = next.notifications.find((entry) => entry.id === notificationId);
      if (!notification) return;

      notification.read = true;
      commit(next);
    },
    [commit, state]
  );

  const currentUser = state.users.find((user) => user.id === currentUserId);
  const unreadNotifications = state.notifications.filter((notification) => !notification.read);

  const value = useMemo<DemoContextValue>(
    () => ({
      hydrated,
      state,
      currentUser,
      unreadNotifications,
      sharedSync,
      actions: {
        login,
        logout,
        addItem,
        updateItem,
        removeItem,
        skipCourse,
        sendCourseToKitchen,
        releaseCourse,
        markCourseCompleted,
        setSessionStatus,
        printReceipt,
        reprintReceipt,
        closeOrder,
        createProduct,
        updateProduct,
        deleteProduct: deleteProductHard,
        deleteSession,
        createUser,
        updateUser,
        deleteUser,
        createTable,
        updateTable,
        toggleTableActive,
        resetDemoState,
        removeTableAndServices,
        markNotificationRead
      }
    }),
    [
      addItem,
      closeOrder,
      createProduct,
      createTable,
      createUser,
      currentUser,
      deleteProductHard,
      deleteSession,
      deleteUser,
      hydrated,
      login,
      logout,
      markCourseCompleted,
      markNotificationRead,
      printReceipt,
      releaseCourse,
      removeItem,
      reprintReceipt,
      resetDemoState,
      removeTableAndServices,
      sendCourseToKitchen,
      setSessionStatus,
      sharedSync,
      skipCourse,
      state,
      toggleTableActive,
      unreadNotifications,
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
  const ticket = session?.courseTickets[course];
  if (!ticket || ticket.status !== "countdown" || !ticket.releasedAt) {
    return {
      status: ticket?.status ?? "not-recorded",
      minutesLeft: 0
    };
  }

  const releaseTime = new Date(ticket.releasedAt).getTime();
  const deadline = releaseTime + ticket.countdownMinutes * 60 * 1000;
  const remaining = Math.ceil((deadline - Date.now()) / 60000);

  if (remaining <= 0) {
    return {
      status: "ready" as const,
      minutesLeft: 0
    };
  }

  return {
    status: "countdown" as const,
    minutesLeft: remaining
  };
};

export const resolveProductName = (products: Product[], productId: string) =>
  getProductById(products, productId)?.name ?? "Unbekannt";

export const getOrderableProducts = (products: Product[], course: CourseKey) =>
  products.filter((product) => product.category === course);

export const getServiceStepIndex = (course: CourseKey | "review") =>
  course === "review" ? serviceCourseOrder.length : serviceCourseOrder.indexOf(course);

export { calculateSessionTotal, courseLabels, getSessionForTable };
