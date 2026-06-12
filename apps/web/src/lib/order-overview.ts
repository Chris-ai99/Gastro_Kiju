import type { CourseKey, OrderItem, OrderSession, Product } from "@kiju/domain";

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

export const isServiceBookedItem = (item: OrderItem, products: Product[]) =>
  products.find((product) => product.id === item.productId)?.productionTarget === "service";

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
