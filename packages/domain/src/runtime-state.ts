import { EXTRA_INGREDIENTS_MODIFIER_GROUP_ID } from "./types";

import type {
  AppState,
  CourseKey,
  ExtraIngredient,
  KitchenUnitState,
  KitchenUnitStatus,
  KitchenTicketBatch,
  OrderItem,
  OrderModifierSelection,
  OrderSession,
  OrderTarget,
  Product,
  UserAccount
} from "./types";
import { demoProducts, demoTables } from "./demo-data";

const SYSTEM_CATALOG_VERSION = 1;
const drinkSubcategoryFallback = "Sonstiges";
const LEGACY_EXTRA_INGREDIENTS_GROUP_ID = "extra-cheese";
const legacyExtraIngredientCatalog: ExtraIngredient[] = [
  { id: "extra-cheese", name: "Extra Käse", priceDeltaCents: 120, active: true },
  { id: "no-onion", name: "Ohne Zwiebeln", priceDeltaCents: 0, active: true },
  { id: "mild", name: "Mild statt scharf", priceDeltaCents: 0, active: true }
];
const legacyExtraIngredientById = new Map(
  legacyExtraIngredientCatalog.map((ingredient) => [ingredient.id, ingredient])
);

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

const normalizeExtraIngredient = (
  ingredient: Partial<ExtraIngredient> | undefined
): ExtraIngredient | null => {
  const id = typeof ingredient?.id === "string" ? ingredient.id.trim() : "";
  if (!id) {
    return null;
  }

  return {
    id,
    name: typeof ingredient?.name === "string" && ingredient.name.trim() ? ingredient.name.trim() : id,
    priceDeltaCents: Number.isFinite(ingredient?.priceDeltaCents)
      ? Math.max(0, Math.round(ingredient?.priceDeltaCents ?? 0))
      : 0,
    active: ingredient?.active !== false
  };
};

const collectLegacyExtraIngredientsFromProducts = (products: AppState["products"]) => {
  const ingredients = new Map<string, ExtraIngredient>();

  products.forEach((product) => {
    product.modifierGroups.forEach((group) => {
      if (
        group.id !== LEGACY_EXTRA_INGREDIENTS_GROUP_ID &&
        group.id !== EXTRA_INGREDIENTS_MODIFIER_GROUP_ID
      ) {
        return;
      }

      group.options.forEach((option) => {
        const normalizedIngredient = normalizeExtraIngredient({
          id: option.id,
          name: option.name,
          priceDeltaCents: option.priceDeltaCents,
          active: true
        });
        if (!normalizedIngredient || ingredients.has(normalizedIngredient.id)) {
          return;
        }

        ingredients.set(normalizedIngredient.id, normalizedIngredient);
      });
    });
  });

  return [...ingredients.values()];
};

const collectSelectedExtraIngredientIds = (sessions: AppState["sessions"]) => {
  const selectedIds = new Set<string>();

  sessions.forEach((session) => {
    session.items.forEach((item) => {
      item.modifiers.forEach((selection) => {
        if (
          selection.groupId !== LEGACY_EXTRA_INGREDIENTS_GROUP_ID &&
          selection.groupId !== EXTRA_INGREDIENTS_MODIFIER_GROUP_ID
        ) {
          return;
        }

        selection.optionIds.forEach((optionId) => {
          const normalizedOptionId = optionId.trim();
          if (normalizedOptionId) {
            selectedIds.add(normalizedOptionId);
          }
        });
      });
    });
  });

  return selectedIds;
};

const normalizeExtraIngredients = (
  extraIngredients: AppState["extraIngredients"],
  products: AppState["products"],
  sessions: AppState["sessions"]
) => {
  const normalizedIngredients = new Map<string, ExtraIngredient>();

  (extraIngredients ?? []).forEach((ingredient) => {
    const normalizedIngredient = normalizeExtraIngredient(ingredient);
    if (!normalizedIngredient) {
      return;
    }

    normalizedIngredients.set(normalizedIngredient.id, normalizedIngredient);
  });

  collectLegacyExtraIngredientsFromProducts(products).forEach((ingredient) => {
    if (!normalizedIngredients.has(ingredient.id)) {
      normalizedIngredients.set(ingredient.id, ingredient);
    }
  });

  collectSelectedExtraIngredientIds(sessions).forEach((ingredientId) => {
    if (normalizedIngredients.has(ingredientId)) {
      return;
    }

    normalizedIngredients.set(
      ingredientId,
      legacyExtraIngredientById.get(ingredientId) ?? {
        id: ingredientId,
        name: ingredientId,
        priceDeltaCents: 0,
        active: false
      }
    );
  });

  return [...normalizedIngredients.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "de")
  );
};

const createExtraIngredientsModifierGroup = (extraIngredients: ExtraIngredient[]) => ({
  id: EXTRA_INGREDIENTS_MODIFIER_GROUP_ID,
  name: "Extra Zutaten",
  required: false,
  min: 0,
  max: extraIngredients.length,
  options: extraIngredients.map((ingredient) => ({
    id: ingredient.id,
    name: ingredient.name,
    priceDeltaCents: ingredient.priceDeltaCents
  }))
});

const collectProductIdsWithSelectedExtraIngredients = (sessions: OrderSession[]) => {
  const productIds = new Set<string>();

  sessions.forEach((session) => {
    session.items.forEach((item) => {
      if (
        item.modifiers.some(
          (selection) => selection.groupId === EXTRA_INGREDIENTS_MODIFIER_GROUP_ID
        )
      ) {
        productIds.add(item.productId);
      }
    });
  });

  return productIds;
};

const normalizeProduct = (
  product: Product,
  extraIngredients: ExtraIngredient[],
  productIdsWithSelectedExtraIngredients: Set<string>
): Product => {
  const supportsExtraIngredients =
    product.supportsExtraIngredients === true ||
    product.modifierGroups.some((group) => group.id === LEGACY_EXTRA_INGREDIENTS_GROUP_ID);
  const shouldAttachExtraIngredientsGroup =
    supportsExtraIngredients || productIdsWithSelectedExtraIngredients.has(product.id);
  const modifierGroups = product.modifierGroups.filter(
    (group) =>
      group.id !== LEGACY_EXTRA_INGREDIENTS_GROUP_ID &&
      group.id !== EXTRA_INGREDIENTS_MODIFIER_GROUP_ID
  );
  const normalizedBaseProduct =
    product.category !== "drinks"
      ? (() => {
          const { drinkSubcategory: _drinkSubcategory, ...rest } = product;
          return rest;
        })()
      : (() => {
          const hasDrinkSubcategory = Object.prototype.hasOwnProperty.call(
            product,
            "drinkSubcategory"
          );
          const drinkSubcategory =
            typeof product.drinkSubcategory === "string" ? product.drinkSubcategory.trim() : "";

          return {
            ...product,
            drinkSubcategory: hasDrinkSubcategory
              ? drinkSubcategory
              : inferDrinkSubcategory(product.name)
          };
        })();

  return {
    ...normalizedBaseProduct,
    modifierGroups: shouldAttachExtraIngredientsGroup
      ? [...modifierGroups, createExtraIngredientsModifierGroup(extraIngredients)]
      : modifierGroups,
    ...(supportsExtraIngredients ? { supportsExtraIngredients: true } : {})
  };
};

const normalizeOrderModifiers = (
  modifiers: OrderModifierSelection[] | undefined
): OrderModifierSelection[] => {
  const groupedModifiers = new Map<string, Set<string>>();

  (modifiers ?? []).forEach((selection) => {
    const rawGroupId = typeof selection?.groupId === "string" ? selection.groupId.trim() : "";
    if (!rawGroupId) {
      return;
    }

    const groupId =
      rawGroupId === LEGACY_EXTRA_INGREDIENTS_GROUP_ID
        ? EXTRA_INGREDIENTS_MODIFIER_GROUP_ID
        : rawGroupId;
    const optionIds = groupedModifiers.get(groupId) ?? new Set<string>();

    (selection.optionIds ?? []).forEach((optionId) => {
      const normalizedOptionId = optionId.trim();
      if (normalizedOptionId) {
        optionIds.add(normalizedOptionId);
      }
    });

    if (optionIds.size > 0) {
      groupedModifiers.set(groupId, optionIds);
    }
  });

  return [...groupedModifiers.entries()].map(([groupId, optionIds]) => ({
    groupId,
    optionIds: [...optionIds]
  }));
};

const normalizeLegacyExtraIngredientNote = (
  note: string | undefined,
  modifiers: OrderModifierSelection[]
) => {
  const trimmedNote = note?.trim();
  if (!trimmedNote) {
    return undefined;
  }

  const extraSelection = modifiers.find(
    (selection) => selection.groupId === EXTRA_INGREDIENTS_MODIFIER_GROUP_ID
  );
  if (!extraSelection) {
    return trimmedNote;
  }

  const normalizedSelectedLabel = extraSelection.optionIds
    .map((optionId) => legacyExtraIngredientById.get(optionId)?.name)
    .filter((optionName): optionName is string => Boolean(optionName))
    .join(", ")
    .toLocaleLowerCase("de-DE");

  if (!normalizedSelectedLabel) {
    return trimmedNote;
  }

  return trimmedNote.toLocaleLowerCase("de-DE") === normalizedSelectedLabel
    ? undefined
    : trimmedNote;
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
  forceCanonicalSeed: boolean,
  deletedProductIds: Set<string>
) => {
  const canonicalProductIds = new Set(demoProducts.map((product) => product.id));
  const managedProductIds = new Set([...canonicalProductIds, ...legacySeedProductIds]);
  const referencedProductIds = new Set(
    sessions.flatMap((session) => session.items.map((item) => item.productId))
  );
  const existingById = new Map(products.map((product) => [product.id, product]));

  return [
    ...demoProducts
      .filter((seededProduct) => !deletedProductIds.has(seededProduct.id))
      .map((seededProduct) =>
      forceCanonicalSeed
        ? structuredClone(seededProduct)
        : {
            ...structuredClone(seededProduct),
            ...structuredClone(existingById.get(seededProduct.id) ?? {})
          }
      ),
    ...products
      .filter((product) => {
        if (deletedProductIds.has(product.id)) {
          return false;
        }

        if (!managedProductIds.has(product.id)) {
          return true;
        }

        return !canonicalProductIds.has(product.id) && referencedProductIds.has(product.id);
      })
      .map((product) => structuredClone(product))
  ];
};

type LegacyOrderItem = Omit<OrderItem, "target"> & {
  target?: OrderTarget;
  seatId?: string;
};

type LegacyOrderSession = Omit<OrderSession, "items" | "status" | "kitchenTicketBatches"> & {
  status?: OrderSession["status"] | "hold";
  holdReason?: string;
  items: LegacyOrderItem[];
  payments?: (OrderSession["payments"][number] & { lineItems?: OrderSession["payments"][number]["lineItems"] })[];
  cancellations?: (
    OrderSession["cancellations"][number] & {
      lineItems?: OrderSession["cancellations"][number]["lineItems"];
    }
  )[];
  partyGroups?: OrderSession["partyGroups"];
  kitchenTicketBatches?: OrderSession["kitchenTicketBatches"];
  barTicketBatches?: OrderSession["barTicketBatches"];
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

const kitchenBatchCourses: CourseKey[] = ["starter", "main", "dessert"];

const normalizeKitchenUnitState = (
  unitState: KitchenUnitState | undefined,
  fallbackStatus: KitchenUnitStatus = "pending"
): KitchenUnitState => {
  const status =
    unitState?.status === "in-progress" || unitState?.status === "completed"
      ? unitState.status
      : fallbackStatus;

  if (status === "pending") {
    return { status };
  }

  if (status === "in-progress") {
    return {
      status,
      startedAt: unitState?.startedAt
    };
  }

  return {
    status,
    startedAt: unitState?.startedAt,
    completedAt: unitState?.completedAt
  };
};

const normalizeKitchenUnitStates = (item: LegacyOrderItem): OrderItem["kitchenUnitStates"] => {
  if (item.category === "drinks" || !item.sentAt) {
    return undefined;
  }

  if (item.preparedAt) {
    return Array.from({ length: item.quantity }, () => ({
      status: "completed" as const,
      completedAt: item.preparedAt
    }));
  }

  const existingStates = Array.isArray(item.kitchenUnitStates) ? item.kitchenUnitStates : [];
  if (existingStates.length === 0) {
    return Array.from({ length: item.quantity }, () => ({ status: "pending" as const }));
  }

  return Array.from({ length: item.quantity }, (_, index) =>
    normalizeKitchenUnitState(existingStates[index])
  );
};

const createLegacyKitchenTicketBatches = (
  session: LegacyOrderSession,
  normalizedItems: OrderItem[]
): KitchenTicketBatch[] => {
  const existingBatches = session.kitchenTicketBatches;
  if (existingBatches?.length) {
    return existingBatches
      .map((batch) => ({
        ...batch,
        itemIds: batch.itemIds.filter((itemId) =>
          normalizedItems.some((item) => item.id === itemId)
        )
      }))
      .filter((batch) => batch.itemIds.length > 0);
  }

  return kitchenBatchCourses.flatMap((course) => {
    const ticket = session.courseTickets[course];
    if (!ticket?.sentAt || ticket.status === "not-recorded" || ticket.status === "skipped") {
      return [];
    }

    const courseItems = normalizedItems.filter((item) => item.category === course);
    const sentItems = courseItems.filter((item) => item.sentAt);
    const itemIds = (sentItems.length > 0 ? sentItems : courseItems).map((item) => item.id);
    if (itemIds.length === 0) {
      return [];
    }

    return [
      {
        id: `${session.id}-${course}-batch-1`,
        course,
        itemIds,
        status: ticket.status,
        sentAt: ticket.sentAt,
        releasedAt: ticket.releasedAt,
        readyAt: ticket.readyAt,
        completedAt: ticket.completedAt,
        manualRelease: ticket.manualRelease,
        countdownMinutes: ticket.countdownMinutes,
        sequence: 1
      }
    ];
  });
};

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
    const {
      holdReason: _legacyHoldReason,
      status,
      items,
      payments,
      cancellations,
      partyGroups,
      barTicketBatches,
      kitchenTicketBatches: _legacyKitchenTicketBatches,
      ...sessionFields
    } = legacySession;
    const normalizedItems = items.map((item) => {
      const legacyItem = item as LegacyOrderItem;
      const {
        seatId: _legacySeatId,
        target: _legacyTarget,
        kitchenUnitStates: _legacyKitchenUnitStates,
        modifiers: legacyModifiers,
        note: legacyNote,
        ...itemFields
      } = legacyItem;
      const kitchenUnitStates = normalizeKitchenUnitStates(legacyItem);
      const modifiers = normalizeOrderModifiers(legacyModifiers);
      const note = normalizeLegacyExtraIngredientNote(legacyNote, modifiers);

      return {
        ...itemFields,
        target: normalizeOrderTarget(legacyItem),
        modifiers,
        ...(note ? { note } : {}),
        ...(kitchenUnitStates ? { kitchenUnitStates } : {})
      };
    });

    return {
      ...sessionFields,
      status: normalizeSessionStatus(status),
      items: normalizedItems,
      payments: (payments ?? []).map((payment) => ({
        ...payment,
        lineItems:
          payment.lineItems ??
          normalizedItems.map((item) => ({
            itemId: item.id,
            quantity: item.quantity
          }))
      })),
      cancellations: (cancellations ?? []).map((cancellation) => ({
        ...cancellation,
        lineItems:
          cancellation.lineItems?.map((lineItem) => ({
            itemId: lineItem.itemId,
            quantity: Math.max(0, Math.floor(lineItem.quantity))
          })) ?? []
      })),
      kitchenTicketBatches: createLegacyKitchenTicketBatches(legacySession, normalizedItems),
      barTicketBatches: barTicketBatches ?? [],
      partyGroups: partyGroups ?? []
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
  const deletedProductIds = [
    ...new Set((state.deletedProductIds ?? []).map((productId) => productId.trim()).filter(Boolean))
  ];
  const deletedTableIdSet = new Set(deletedTableIds);
  const deletedUserIdSet = new Set(deletedUserIds);
  const deletedProductIdSet = new Set(deletedProductIds);
  const normalizedSessions = normalizeSessions(
    state.sessions.filter((session) => !deletedTableIdSet.has(session.tableId))
  );
  const mergedProducts = mergeSeededProducts(
    state.products,
    normalizedSessions,
    forceCanonicalSeed,
    deletedProductIdSet
  );
  const extraIngredients = normalizeExtraIngredients(
    state.extraIngredients,
    mergedProducts,
    normalizedSessions
  );
  const productIdsWithSelectedExtraIngredients =
    collectProductIdsWithSelectedExtraIngredients(normalizedSessions);

  return {
    ...state,
    catalogVersion: SYSTEM_CATALOG_VERSION,
    serviceOrderMode: state.serviceOrderMode === "seat" ? "seat" : "table",
    designMode: state.designMode === "classic" ? "classic" : "modern",
    linkedTableGroups: (state.linkedTableGroups ?? []).filter(
      (group) =>
        group.active &&
        group.tableIds.length > 1 &&
        group.tableIds.every((tableId) => !deletedTableIdSet.has(tableId))
    ),
    deletedTableIds,
    deletedUserIds,
    deletedProductIds,
    extraIngredients,
    users: mergeSeededUsers(state.users, deletedUserIdSet),
    tables: normalizeTables(mergeSeededTables(state.tables, deletedTableIdSet)),
    products: mergedProducts.map((product) =>
      normalizeProduct(product, extraIngredients, productIdsWithSelectedExtraIngredients)
    ),
    sessions: normalizedSessions,
    notifications: state.notifications.filter(
      (notification) => !notification.tableId || !deletedTableIdSet.has(notification.tableId)
    )
  };
};

export const createDefaultOperationalState = (): AppState =>
  normalizeOperationalState({
    serviceOrderMode: "table",
    designMode: "modern",
    linkedTableGroups: [],
    deletedTableIds: [],
    deletedUserIds: [],
    deletedProductIds: [],
    extraIngredients: [],
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
