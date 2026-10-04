import {
  isOrderItemCanceled,
  type CourseKey,
  type OrderItem,
  type OrderSession,
  type Product
} from "@kiju/domain";

export const orderOverviewCourseSequence: CourseKey[] = [
  "drinks",
  "starter",
  "main",
  "dessert"
];

export type OrderSendTarget = "bar" | "kitchen";

export type PendingOrderSendSummary = {
  byCourse: Record<CourseKey, OrderItem[]>;
  affectedCourses: CourseKey[];
  targets: OrderSendTarget[];
  sentItemCount: number;
};

export const expandCheckoutUnitEntries = <
  T extends { item: Pick<OrderItem, "id">; openQuantity: number }
>(
  entries: T[]
) =>
  entries.flatMap((entry) =>
    Array.from(
      { length: Math.max(0, Math.floor(entry.openQuantity)) },
      (_, unitIndex) => ({
        ...entry,
        unitIndex,
        unitKey: `${entry.item.id}:${unitIndex}`
      })
    )
  );

export const isAlwaysServiceBookedProduct = (
  product: Pick<Product, "id" | "category"> | undefined
) => product?.category === "dessert" || product?.id === "starter-greeting";

export const isServiceBookedItem = (item: OrderItem, products: Product[]) =>
  item.category === "dessert" ||
  item.productId === "starter-greeting" ||
  products.find((product) => product.id === item.productId)?.productionTarget === "service";

export const getOpenKitchenLabelUnits = (items: OrderItem[], products: Product[]) =>
  items.flatMap((item) => {
    if (
      isOrderItemCanceled(item) ||
      item.preparedAt ||
      isServiceBookedItem(item, products)
    ) {
      return [];
    }

    const unitCount = Math.max(1, Math.floor(item.quantity));
    return Array.from({ length: unitCount }, (_, unitIndex) => unitIndex)
      .filter((unitIndex) => item.kitchenUnitStates?.[unitIndex]?.status !== "completed")
      .map((unitIndex) => ({ itemId: item.id, unitIndex }));
  });

export const resetKitchenItemsForReopen = (items: OrderItem[], products: Product[]) => {
  const reopenedItemIds: string[] = [];

  items.forEach((item) => {
    if (isServiceBookedItem(item, products)) return;

    reopenedItemIds.push(item.id);
    if (isOrderItemCanceled(item)) return;

    const unitCount = Math.max(1, Math.floor(item.quantity));
    item.kitchenUnitStates = Array.from({ length: unitCount }, () => ({
      status: "pending" as const
    }));
    delete item.preparedAt;
    delete item.servedAt;
  });

  return reopenedItemIds;
};

export const buildPendingOrderSendSummary = (
  session: OrderSession | undefined,
  products: Product[]
): PendingOrderSendSummary => {
  const byCourse: Record<CourseKey, OrderItem[]> = {
    drinks: [],
    starter: [],
    main: [],
    dessert: []
  };

  session?.items.forEach((item) => {
    if (item.sentAt || item.canceledAt || isServiceBookedItem(item, products)) return;
    byCourse[item.category].push(item);
  });

  const affectedCourses = orderOverviewCourseSequence.filter(
    (course) => byCourse[course].length > 0
  );
  const targets: OrderSendTarget[] = [];

  if (byCourse.drinks.length > 0) {
    targets.push("bar");
  }
  if (affectedCourses.some((course) => course !== "drinks")) {
    targets.push("kitchen");
  }

  return {
    byCourse,
    affectedCourses,
    targets,
    sentItemCount: affectedCourses.reduce(
      (sum, course) =>
        sum + byCourse[course].reduce((courseSum, item) => courseSum + item.quantity, 0),
      0
    )
  };
};
