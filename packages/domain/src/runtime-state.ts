import type { AppState, OrderItem, OrderSession, OrderTarget, Product, UserAccount } from "./types";
import { demoProducts, demoTables } from "./demo-data";

const SYSTEM_CATALOG_VERSION = 1;
const drinkSubcategoryFallback = "Sonstiges";

const inferDrinkSubcategory = (productName: string) => {
  const normalizedName = productName.toLocaleLowerCase("de-DE");

  if (
    normalizedName.includes("cola") ||
    normalizedName.includes("fanta") ||
    normalizedName.includes("sprite") ||
    normalizedName.includes("bionade") ||
    normalizedName.includes("wasser")
  ) {
    return "Alkoholfrei";
  }

  if (normalizedName.includes("bier") || normalizedName.includes("radler")) {
    return "Bier/Radler";
  }

  if (normalizedName.includes("wein")) {
    return "Wein";
  }

  return drinkSubcategoryFallback;
};

const normalizeProduct = (product: Product): Product => {
  if (product.category !== "drinks") {
    const { drinkSubcategory: _drinkSubcategory, ...rest } = product;
    return rest;
  }

  const hasDrinkSubcategory = Object.prototype.hasOwnProperty.call(product, "drinkSubcategory");
  const drinkSubcategory =
    typeof product.drinkSubcategory === "string" ? product.drinkSubcategory.trim() : "";

  return {
    ...product,
    drinkSubcategory: hasDrinkSubcategory ? drinkSubcategory : inferDrinkSubcategory(product.name)
  };
};

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

const legacySeedProductIds = new Set([
  "starter-bruschetta",
  "starter-salad",
  "main-pizza-margherita",
  "main-pasta",
  "dessert-icecream",
  "dessert-cake"
]);

const mergeSeededUsers = (users: AppState["users"], deletedUserIds: Set<string>) => {
  const seededUsers = createSystemUsers();
  const activeUsers = users.filter((user) => !deletedUserIds.has(user.id));
  const activeSeededUsers = seededUsers.filter((user) => !deletedUserIds.has(user.id));
  const existingById = new Map(activeUsers.map((user) => [user.id, user]));
  const seededIds = new Set(seededUsers.map((user) => user.id));

  return [
    ...activeSeededUsers.map((seededUser) => ({
      ...seededUser,
      ...structuredClone(existingById.get(seededUser.id) ?? {})
    })),
    ...activeUsers
      .filter((user) => !seededIds.has(user.id))
      .map((user) => structuredClone(user))
  ];
};

const mergeSeededTables = (tables: AppState["tables"], deletedTableIds: Set<string>) => {
  const existingById = new Map(
    tables.filter((table) => !deletedTableIds.has(table.id)).map((table) => [table.id, table])
  );
  const seededIds = new Set(demoTables.map((table) => table.id));

  return [
    ...demoTables
      .filter((seededTable) => !deletedTableIds.has(seededTable.id))
      .map((seededTable) => ({
        ...structuredClone(seededTable),
        ...structuredClone(existingById.get(seededTable.id) ?? {})
      })),
    ...tables
      .filter((table) => !seededIds.has(table.id) && !deletedTableIds.has(table.id))
      .map((table) => structuredClone(table))
  ];
};

const mergeSeededProducts = (
  products: AppState["products"],
  sessions: AppState["sessions"],
  forceCanonicalSeed: boolean
) => {
  const canonicalProductIds = new Set(demoProducts.map((product) => product.id));
  const managedProductIds = new Set([...canonicalProductIds, ...legacySeedProductIds]);
  const referencedProductIds = new Set(
    sessions.flatMap((session) => session.items.map((item) => item.productId))
  );
  const existingById = new Map(products.map((product) => [product.id, product]));

  return [
    ...demoProducts.map((seededProduct) =>
      forceCanonicalSeed
        ? structuredClone(seededProduct)
        : {
            ...structuredClone(seededProduct),
            ...structuredClone(existingById.get(seededProduct.id) ?? {})
          }
    ),
    ...products
      .filter((product) => {
        if (!managedProductIds.has(product.id)) {
          return true;
        }

        return !canonicalProductIds.has(product.id) && referencedProductIds.has(product.id);
      })
      .map((product) => normalizeProduct(structuredClone(product)))
  ];
};

type LegacyOrderItem = Omit<OrderItem, "target"> & {
  target?: OrderTarget;
  seatId?: string;
};

type LegacyOrderSession = Omit<OrderSession, "items" | "status"> & {
  status?: OrderSession["status"] | "hold";
  holdReason?: string;
  items: LegacyOrderItem[];
};

const normalizeOrderTarget = (item: LegacyOrderItem): OrderTarget => {
  if (item.target?.type === "table") {
    return { type: "table" };
  }

  if (item.target?.type === "seat" && item.target.seatId.trim()) {
    return { type: "seat", seatId: item.target.seatId };
  }

  if (item.seatId?.trim()) {
    return { type: "seat", seatId: item.seatId };
  }

  return { type: "table" };
};

const normalizeSessionStatus = (status: LegacyOrderSession["status"]): OrderSession["status"] =>
  status === "hold" ? "serving" : status ?? "serving";

const normalizeTables = (tables: AppState["tables"]) =>
  tables.map((table) => ({
    ...table,
    seats: table.seats.map((seat) => ({
      ...seat,
      visible: seat.visible ?? true
    }))
  }));

const normalizeSessions = (sessions: AppState["sessions"]) =>
  sessions.map((session) => {
    const legacySession = session as LegacyOrderSession;
    const { holdReason: _legacyHoldReason, status, items, ...sessionFields } = legacySession;

    return {
      ...sessionFields,
      status: normalizeSessionStatus(status),
      items: items.map((item) => {
        const legacyItem = item as LegacyOrderItem;
        const { seatId: _legacySeatId, target: _legacyTarget, ...itemFields } = legacyItem;

        return {
          ...itemFields,
          target: normalizeOrderTarget(legacyItem)
        };
      })
    };
  });

export const normalizeOperationalState = (state: AppState): AppState => {
  const forceCanonicalSeed = (state.catalogVersion ?? 0) < SYSTEM_CATALOG_VERSION;
  const deletedTableIds = [
    ...new Set((state.deletedTableIds ?? []).map((tableId) => tableId.trim()).filter(Boolean))
  ];
  const deletedUserIds = [
    ...new Set((state.deletedUserIds ?? []).map((userId) => userId.trim()).filter(Boolean))
  ];
  const deletedTableIdSet = new Set(deletedTableIds);
  const deletedUserIdSet = new Set(deletedUserIds);

  return {
    ...state,
    catalogVersion: SYSTEM_CATALOG_VERSION,
    serviceOrderMode: state.serviceOrderMode === "seat" ? "seat" : "table",
    designMode: state.designMode === "classic" ? "classic" : "modern",
    deletedTableIds,
    deletedUserIds,
    users: mergeSeededUsers(state.users, deletedUserIdSet),
    tables: normalizeTables(mergeSeededTables(state.tables, deletedTableIdSet)),
    products: mergeSeededProducts(state.products, state.sessions, forceCanonicalSeed).map(normalizeProduct),
    sessions: normalizeSessions(state.sessions.filter((session) => !deletedTableIdSet.has(session.tableId))),
    notifications: state.notifications.filter(
      (notification) => !notification.tableId || !deletedTableIdSet.has(notification.tableId)
    )
  };
};

export const createDefaultOperationalState = (): AppState =>
  normalizeOperationalState({
    serviceOrderMode: "table",
    designMode: "modern",
    deletedTableIds: [],
    deletedUserIds: [],
    users: createSystemUsers(),
    tables: structuredClone(demoTables),
    products: structuredClone(demoProducts),
    sessions: [],
    notifications: [],
    dailyStats: {
      date: new Date().toISOString().slice(0, 10),
      servedTables: 0,
      servedGuests: 0,
      revenueCents: 0,
      closedOrderIds: []
    }
  });
