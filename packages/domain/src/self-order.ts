import { kitchenRules } from "@kiju/config";

import type {
  CourseKey,
  CourseTicket,
  KitchenStatus,
  KitchenTicketBatch,
  OrderItem,
  OrderModifierSelection,
  OrderSession,
  Product,
  SelfOrderCustomerStatus,
  TableLayout
} from "./types";

export type SelfOrderLineInput = {
  productId: string;
  quantity: number;
  note?: string;
  modifiers?: OrderModifierSelection[];
};

export type ValidatedSelfOrderLine = {
  product: Product;
  quantity: number;
  note?: string;
  modifiers: OrderModifierSelection[];
};

export class SelfOrderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SelfOrderValidationError";
  }
}

const createBaseTicket = (course: CourseKey): CourseTicket => ({
  course,
  status: "not-recorded",
  manualRelease: false,
  countdownMinutes: kitchenRules.releaseCountdownMinutes
});

export const createSelfOrderCourseTickets = (): Record<CourseKey, CourseTicket> => ({
  drinks: createBaseTicket("drinks"),
  starter: createBaseTicket("starter"),
  main: createBaseTicket("main"),
  dessert: createBaseTicket("dessert")
});

const normalizeModifierSelections = (
  product: Product,
  selections: OrderModifierSelection[] | undefined
) => {
  const selectionsByGroup = new Map(
    (selections ?? []).map((selection) => [selection.groupId, selection.optionIds])
  );

  for (const selection of selections ?? []) {
    if (!product.modifierGroups.some((group) => group.id === selection.groupId)) {
      throw new SelfOrderValidationError(
        `Eine Auswahl für ${product.name} ist nicht mehr verfügbar.`
      );
    }
  }

  return product.modifierGroups.map((group) => {
    const optionIds = [...new Set(selectionsByGroup.get(group.id) ?? [])];
    const allowedOptionIds = new Set(group.options.map((option) => option.id));
    if (optionIds.some((optionId) => !allowedOptionIds.has(optionId))) {
      throw new SelfOrderValidationError(
        `Eine Auswahl für ${product.name} ist nicht mehr verfügbar.`
      );
    }
    if (optionIds.length < group.min || optionIds.length > group.max) {
      throw new SelfOrderValidationError(
        `Bitte prüfe die Auswahl für ${product.name}.`
      );
    }
    if (group.required && optionIds.length === 0) {
      throw new SelfOrderValidationError(
        `Bitte wähle eine erforderliche Option für ${product.name}.`
      );
    }

    return {
      groupId: group.id,
      optionIds
    };
  }).filter((selection) => selection.optionIds.length > 0);
};

export const validateSelfOrderLines = (
  products: Product[],
  lines: SelfOrderLineInput[]
): ValidatedSelfOrderLine[] => {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new SelfOrderValidationError("Bitte wähle mindestens einen Artikel aus.");
  }
  if (lines.length > 50) {
    throw new SelfOrderValidationError("Eine Bestellung darf höchstens 50 Positionen enthalten.");
  }

  const productsById = new Map(products.map((product) => [product.id, product]));
  let totalQuantity = 0;

  const validated = lines.map((line) => {
    const product = productsById.get(line.productId);
    if (!product) {
      throw new SelfOrderValidationError("Ein ausgewählter Artikel ist nicht mehr verfügbar.");
    }

    const quantity = Math.round(Number(line.quantity));
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 20) {
      throw new SelfOrderValidationError(
        `Die Menge für ${product.name} muss zwischen 1 und 20 liegen.`
      );
    }
    totalQuantity += quantity;

    const note = line.note?.trim();
    if (note && note.length > 200) {
      throw new SelfOrderValidationError(
        `Der Hinweis für ${product.name} darf höchstens 200 Zeichen lang sein.`
      );
    }

    return {
      product,
      quantity,
      note: note || undefined,
      modifiers: normalizeModifierSelections(product, line.modifiers)
    };
  });

  if (totalQuantity > 100) {
    throw new SelfOrderValidationError("Eine Bestellung darf höchstens 100 Artikel enthalten.");
  }

  return validated;
};

const createBatch = ({
  id,
  course,
  itemIds,
  sentAt,
  sequence,
  bedienung,
  isBar
}: {
  id: string;
  course: CourseKey;
  itemIds: string[];
  sentAt: string;
  sequence: number;
  bedienung: string;
  isBar: boolean;
}): KitchenTicketBatch => ({
  id,
  course,
  itemIds,
  bedienung,
  status: "ready",
  sentAt,
  releasedAt: sentAt,
  readyAt: isBar ? sentAt : undefined,
  completedAt: undefined,
  manualRelease: false,
  countdownMinutes: isBar ? 0 : kitchenRules.releaseCountdownMinutes,
  sequence
});

const syncTicketFromBatch = (
  session: OrderSession,
  batch: KitchenTicketBatch
) => {
  session.courseTickets[batch.course] = {
    course: batch.course,
    status: batch.status,
    sentAt: batch.sentAt,
    releasedAt: batch.releasedAt,
    readyAt: batch.readyAt,
    completedAt: batch.completedAt,
    manualRelease: batch.manualRelease,
    countdownMinutes: batch.countdownMinutes
  };
};

export const appendValidatedSelfOrderLines = ({
  session,
  lines,
  createdAt,
  bedienung,
  createId
}: {
  session: OrderSession;
  lines: ValidatedSelfOrderLine[];
  createdAt: string;
  bedienung: string;
  createId: (prefix: string) => string;
}) => {
  const addedItems: OrderItem[] = lines.map(({ product, quantity, note, modifiers }) => {
    const externalProduction = product.productionTarget !== "service";

    return {
      id: createId("item"),
      target: { type: "table" },
      productId: product.id,
      category: product.category,
      quantity,
      note,
      modifiers,
      createdAt,
      sentAt: externalProduction ? createdAt : undefined,
      kitchenUnitStates:
        product.productionTarget === "kitchen"
          ? Array.from({ length: quantity }, () => ({ status: "pending" as const }))
          : undefined
    };
  });

  session.items.push(...addedItems);

  const barItems = addedItems.filter(
    (item) => lines.find((line) => line.product.id === item.productId)?.product.productionTarget === "bar"
  );
  if (barItems.length > 0) {
    const batch = createBatch({
      id: createId(`bar-ticket-${session.tableId}-drinks`),
      course: "drinks",
      itemIds: barItems.map((item) => item.id),
      sentAt: createdAt,
      sequence: session.barTicketBatches.filter((entry) => entry.course === "drinks").length + 1,
      bedienung,
      isBar: true
    });
    session.barTicketBatches.push(batch);
    syncTicketFromBatch(session, batch);
  }

  const kitchenCourses: CourseKey[] = ["starter", "main", "dessert", "drinks"];
  kitchenCourses.forEach((course) => {
    const items = addedItems.filter((item) => {
      const product = lines.find((line) => line.product.id === item.productId)?.product;
      return item.category === course && product?.productionTarget === "kitchen";
    });
    if (items.length === 0) return;

    const batch = createBatch({
      id: createId(`kitchen-ticket-${session.tableId}-${course}`),
      course,
      itemIds: items.map((item) => item.id),
      sentAt: createdAt,
      sequence:
        session.kitchenTicketBatches.filter((entry) => entry.course === course).length + 1,
      bedienung,
      isBar: false
    });
    session.kitchenTicketBatches.push(batch);
    syncTicketFromBatch(session, batch);
  });

  session.status = "waiting";
  return addedItems;
};

const isItemPrepared = (item: OrderItem, session: OrderSession) => {
  if (item.canceledAt) return true;
  if (item.preparedAt) return true;
  if (
    item.kitchenUnitStates?.length &&
    item.kitchenUnitStates.every((unit) => unit.status === "completed")
  ) {
    return true;
  }

  return [...session.kitchenTicketBatches, ...session.barTicketBatches].some(
    (batch) => batch.itemIds.includes(item.id) && batch.status === "completed"
  );
};

export const resolveSelfOrderCustomerStatus = (
  session: OrderSession,
  products: Product[]
): SelfOrderCustomerStatus => {
  if (session.status === "closed") return "closed";

  const productsById = new Map(products.map((product) => [product.id, product]));
  const productionItems = session.items.filter(
    (item) =>
      !item.canceledAt &&
      productsById.get(item.productId)?.productionTarget !== "service"
  );

  if (productionItems.length === 0) return "ready";

  const preparedCount = productionItems.filter((item) => isItemPrepared(item, session)).length;
  if (preparedCount === productionItems.length) return "ready";
  if (preparedCount > 0) return "partially-ready";
  if (productionItems.some((item) => item.sentAt)) return "preparing";
  return "received";
};

export const resolveNextTableNumber = (tables: TableLayout[]) =>
  tables.reduce((highest, table) => {
    const match = table.id.match(/^table-(\d+)$/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0) + 1;

export const resolveNextPickupNumber = (tables: TableLayout[]) =>
  tables.reduce((highest, table) => {
    const match = table.name.trim().match(/^Zum Abholen\s+(\d+)$/i);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0) + 1;
