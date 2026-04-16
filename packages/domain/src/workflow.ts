import type {
  AppState,
  CourseKey,
  KitchenStatus,
  OrderItem,
  OrderSession,
  Product,
  SessionStatus,
  TableLayout
} from "./types";

export const courseLabels: Record<CourseKey, string> = {
  drinks: "Getränke",
  starter: "Vorspeise",
  main: "Hauptspeise",
  dessert: "Nachtisch"
};

export const paymentLabels = {
  cash: "Bar",
  card: "Karte",
  voucher: "Gutschein"
} as const;

export const euro = (valueCents: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
  }).format(valueCents / 100);

export const getProductById = (products: Product[], id: string) =>
  products.find((product) => product.id === id);

export const getSessionForTable = (sessions: OrderSession[], tableId: string) =>
  sessions.find((session) => session.tableId === tableId && session.status !== "closed");

export const getItemsForCourse = (session: OrderSession | undefined, course: CourseKey) =>
  session?.items.filter((item) => item.category === course) ?? [];

export const getOrderTargetKey = (item: OrderItem) =>
  item.target.type === "table" ? "table" : item.target.seatId;

export const getSeatItems = (session: OrderSession | undefined, seatId: string) =>
  session?.items.filter((item) => item.target.type === "seat" && item.target.seatId === seatId) ??
  [];

export const getTableTargetItems = (session: OrderSession | undefined) =>
  session?.items.filter((item) => item.target.type === "table") ?? [];

export const resolveSessionStatus = (
  table: TableLayout,
  session?: OrderSession
): SessionStatus => {
  if (table.plannedOnly && !table.active) return "planned";
  if (!session) return "idle";
  return session.status;
};

export const calculateItemTotal = (item: OrderItem, products: Product[]) => {
  const product = getProductById(products, item.productId);
  if (!product) return 0;

  const modifierTotal = item.modifiers.reduce((sum, modifierSelection) => {
    const modifierGroup = product.modifierGroups.find(
      (group) => group.id === modifierSelection.groupId
    );
    if (!modifierGroup) return sum;

    return (
      sum +
      modifierSelection.optionIds.reduce((optionSum, optionId) => {
        const option = modifierGroup.options.find((entry) => entry.id === optionId);
        return optionSum + (option?.priceDeltaCents ?? 0);
      }, 0)
    );
  }, 0);

  return (product.priceCents + modifierTotal) * item.quantity;
};

export const calculateSessionTotal = (session: OrderSession | undefined, products: Product[]) =>
  session?.items.reduce((sum, item) => sum + calculateItemTotal(item, products), 0) ?? 0;

export const calculateGuestCount = (session?: OrderSession) =>
  session ? new Set(session.items.map(getOrderTargetKey)).size : 0;

export const buildKitchenSummary = (
  session: OrderSession | undefined,
  table: TableLayout,
  products: Product[]
) => {
  const courses = (["starter", "main", "dessert", "drinks"] as CourseKey[]).map((course) => {
    const items = getItemsForCourse(session, course);
    const ticket = session?.courseTickets[course];
    const status: KitchenStatus = ticket?.status ?? "not-recorded";
    const label =
      status === "not-recorded"
        ? "Nicht erfasst"
        : status === "skipped"
          ? "X"
          : items
              .map((item) => getProductById(products, item.productId)?.name ?? "Unbekannt")
              .join(", ");

    return {
      course,
      label,
      status,
      itemCount: items.length
    };
  });

  return {
    tableId: table.id,
    tableName: table.name,
    active: table.active,
    plannedOnly: table.plannedOnly,
    courses
  };
};

export const buildDashboardSummary = (state: AppState) =>
  state.tables.map((table) => {
    const session = getSessionForTable(state.sessions, table.id);
    return {
      table,
      session,
      status: resolveSessionStatus(table, session),
      total: calculateSessionTotal(session, state.products),
      guests: calculateGuestCount(session)
    };
  });

export const buildClosedSessions = (state: AppState) =>
  state.sessions.filter((session) => session.status === "closed");
