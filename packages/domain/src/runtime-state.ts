import type { AppState, UserAccount } from "./types";
import { demoProducts, demoTables } from "./demo-data";

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

export const createDefaultOperationalState = (): AppState => ({
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
