import type {
  AppState,
  CourseKey,
  KitchenStatus,
  OrderItem,
  OrderSession,
  PaymentLineItem,
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

export const isOrderItemCanceled = (item: Pick<OrderItem, "canceledAt">) =>
  Boolean(item.canceledAt);

export const getItemsForCourse = (session: OrderSession | undefined, course: CourseKey) =>
  session?.items.filter((item) => item.category === course && !isOrderItemCanceled(item)) ?? [];

export const getOrderTargetKey = (item: OrderItem) =>
  item.target.type === "table" ? "table" : item.target.seatId;

export const getSeatItems = (session: OrderSession | undefined, seatId: string) =>
  session?.items.filter(
    (item) =>
      item.target.type === "seat" &&
      item.target.seatId === seatId &&
      !isOrderItemCanceled(item)
  ) ?? [];

export const getTableTargetItems = (session: OrderSession | undefined) =>
  session?.items.filter((item) => item.target.type === "table" && !isOrderItemCanceled(item)) ?? [];

export const resolveSessionStatus = (
  table: TableLayout,
  session?: OrderSession
): SessionStatus => {
  if (table.plannedOnly && !table.active) return "planned";
  if (!session) return "idle";
  return session.status;
};

export const calculateItemTotal = (item: OrderItem, products: Product[]) => {
  if (isOrderItemCanceled(item)) return 0;

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

export const calculatePaidItemQuantity = (session: OrderSession | undefined, itemId: string) => {
  if (!session) return 0;

  return session.payments.reduce(
    (sum, payment) =>
      sum +
      payment.lineItems
        .filter((lineItem) => lineItem.itemId === itemId)
        .reduce((lineSum, lineItem) => lineSum + lineItem.quantity, 0),
    0
  );
};

export const calculateCanceledItemQuantity = (
  session: OrderSession | undefined,
  itemId: string
) => {
  if (!session) return 0;

  const item = session.items.find((entry) => entry.id === itemId);
  if (!item) return 0;

  const canceledQuantity = session.cancellations.reduce(
    (sum, cancellation) =>
      sum +
      cancellation.lineItems
        .filter((lineItem) => lineItem.itemId === itemId)
        .reduce((lineSum, lineItem) => lineSum + lineItem.quantity, 0),
    0
  );

  return Math.min(
    Math.max(0, item.quantity - calculatePaidItemQuantity(session, itemId)),
    canceledQuantity
  );
};

export const calculateOpenItemQuantity = (session: OrderSession | undefined, item: OrderItem) =>
  isOrderItemCanceled(item)
    ? 0
    : Math.max(
        0,
        item.quantity -
          calculatePaidItemQuantity(session, item.id) -
          calculateCanceledItemQuantity(session, item.id)
      );

export const calculateLineItemsTotal = (
  session: OrderSession | undefined,
  products: Product[],
  lineItems: PaymentLineItem[]
) =>
  lineItems.reduce((sum, lineItem) => {
    const item = session?.items.find((entry) => entry.id === lineItem.itemId);
    if (!item) return sum;

    const quantity = Math.min(calculateOpenItemQuantity(session, item), Math.max(0, lineItem.quantity));
    if (quantity <= 0) return sum;

    return sum + Math.round((calculateItemTotal(item, products) / item.quantity) * quantity);
  }, 0);

export const calculateSessionPaidTotal = (session: OrderSession | undefined) =>
  session?.payments.reduce((sum, payment) => sum + payment.amountCents, 0) ?? 0;

export const calculateSessionCanceledTotal = (
  session: OrderSession | undefined,
  products: Product[]
) =>
  session?.items.reduce((sum, item) => {
    const quantity = calculateCanceledItemQuantity(session, item.id);
    if (quantity <= 0) return sum;

    return sum + Math.round((calculateItemTotal(item, products) / item.quantity) * quantity);
  }, 0) ?? 0;

export const calculateSessionBillableTotal = (
  session: OrderSession | undefined,
  products: Product[]
) =>
  Math.max(
    0,
    calculateSessionTotal(session, products) - calculateSessionCanceledTotal(session, products)
  );

export const calculateSessionOpenTotal = (session: OrderSession | undefined, products: Product[]) =>
  Math.max(0, calculateSessionBillableTotal(session, products) - calculateSessionPaidTotal(session));

export const getOpenLineItems = (session: OrderSession | undefined) =>
  session?.items
    .map((item) => ({
      item,
      openQuantity: calculateOpenItemQuantity(session, item)
    }))
    .filter((entry) => entry.openQuantity > 0) ?? [];

export const getLinkedTableGroupForTable = (state: AppState, tableId: string) =>
  state.linkedTableGroups.find((group) => group.active && group.tableIds.includes(tableId));

export const getCheckoutTableIds = (state: AppState, tableId: string) =>
  getLinkedTableGroupForTable(state, tableId)?.tableIds ?? [tableId];

export const getOpenTotalForTables = (state: AppState, tableIds: string[]) =>
  tableIds.reduce((sum, tableId) => {
    const session = getSessionForTable(state.sessions, tableId);
    return sum + calculateSessionOpenTotal(session, state.products);
  }, 0);

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
