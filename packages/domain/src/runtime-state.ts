import type { AppState, UserAccount } from "./types";
import { demoProducts, demoTables } from "./demo-data";

const SYSTEM_CATALOG_VERSION = 1;

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
      name: "Kueche",
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

const mergeSeededUsers = (users: AppState["users"]) => {
  const seededUsers = createSystemUsers();
  const existingById = new Map(users.map((user) => [user.id, user]));
  const seededIds = new Set(seededUsers.map((user) => user.id));

  return [
    ...seededUsers.map((seededUser) => ({
      ...seededUser,
      ...structuredClone(existingById.get(seededUser.id) ?? {})
    })),
    ...users
      .filter((user) => !seededIds.has(user.id))
      .map((user) => structuredClone(user))
  ];
};

const mergeSeededTables = (tables: AppState["tables"]) => {
  const existingById = new Map(tables.map((table) => [table.id, table]));
  const seededIds = new Set(demoTables.map((table) => table.id));

  return [
    ...demoTables.map((seededTable) => ({
      ...structuredClone(seededTable),
      ...structuredClone(existingById.get(seededTable.id) ?? {})
    })),
    ...tables
      .filter((table) => !seededIds.has(table.id))
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
      .map((product) => structuredClone(product))
  ];
};

export const normalizeOperationalState = (state: AppState): AppState => {
  const forceCanonicalSeed = (state.catalogVersion ?? 0) < SYSTEM_CATALOG_VERSION;

  return {
    ...state,
    catalogVersion: SYSTEM_CATALOG_VERSION,
    users: mergeSeededUsers(state.users),
    tables: mergeSeededTables(state.tables),
    products: mergeSeededProducts(state.products, state.sessions, forceCanonicalSeed)
  };
};

export const createDefaultOperationalState = (): AppState =>
  normalizeOperationalState({
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
