import { describe, expect, it } from "vitest";

import {
  appendValidatedSelfOrderLines,
  createSelfOrderCourseTickets,
  resolveSelfOrderCustomerStatus,
  SelfOrderValidationError,
  validateSelfOrderLines
} from "./self-order";
import { calculateGuestCount } from "./workflow.ts";
import type { OrderSession, Product } from "./types";

const products: Product[] = [
  {
    id: "pizza",
    name: "Pizza",
    category: "main",
    description: "",
    priceCents: 800,
    taxRate: 7,
    allergens: [],
    showInKitchen: true,
    productionTarget: "kitchen",
    modifierGroups: [
      {
        id: "size",
        name: "Größe",
        required: true,
        min: 1,
        max: 1,
        options: [
          { id: "small", name: "Klein", priceDeltaCents: 0 },
          { id: "large", name: "Groß", priceDeltaCents: 200 }
        ]
      }
    ]
  },
  {
    id: "cola",
    name: "Cola",
    category: "drinks",
    description: "",
    priceCents: 250,
    taxRate: 19,
    allergens: [],
    showInKitchen: false,
    productionTarget: "bar",
    modifierGroups: []
  },
  {
    id: "service",
    name: "Serviceartikel",
    category: "dessert",
    description: "",
    priceCents: 100,
    taxRate: 7,
    allergens: [],
    showInKitchen: false,
    productionTarget: "service",
    modifierGroups: []
  }
];

const createSession = (): OrderSession => ({
  id: "session-1",
  tableId: "table-10",
  waiterId: "waiter-1",
  serviceUserIds: ["waiter-1"],
  status: "serving",
  items: [],
  skippedCourses: [],
  courseTickets: createSelfOrderCourseTickets(),
  kitchenTicketBatches: [],
  barTicketBatches: [],
  payments: [],
  cancellations: [],
  partyGroups: [],
  receipt: {},
  selfOrder: {
    customerName: "Alex Beispiel",
    guestCount: 4,
    locationId: "location-1",
    locationName: "Saal",
    pickupNumber: 7,
    accessTokenHash: "hash",
    createdAt: "2026-06-13T20:00:00.000Z",
    paymentCallStatus: "idle"
  }
});

describe("QR-Selbstbestellung", () => {
  it("prüft Pflichtvarianten und unbekannte Optionen", () => {
    expect(() =>
      validateSelfOrderLines(products, [{ productId: "pizza", quantity: 1 }])
    ).toThrow(SelfOrderValidationError);

    expect(() =>
      validateSelfOrderLines(products, [
        {
          productId: "pizza",
          quantity: 1,
          modifiers: [{ groupId: "size", optionIds: ["missing"] }]
        }
      ])
    ).toThrow("nicht mehr verfügbar");
  });

  it("erzeugt Küchen- und Barbatches und erhöht Nachbestellungssequenzen", () => {
    const session = createSession();
    let id = 0;
    const createId = (prefix: string) => `${prefix}-${++id}`;
    const lines = validateSelfOrderLines(products, [
      {
        productId: "pizza",
        quantity: 2,
        modifiers: [{ groupId: "size", optionIds: ["large"] }]
      },
      { productId: "cola", quantity: 1 },
      { productId: "service", quantity: 1 }
    ]);

    appendValidatedSelfOrderLines({
      session,
      lines,
      createdAt: "2026-06-13T20:00:00.000Z",
      bedienung: "Selbstbestellung",
      createId
    });
    appendValidatedSelfOrderLines({
      session,
      lines: validateSelfOrderLines(products, [{ productId: "cola", quantity: 1 }]),
      createdAt: "2026-06-13T20:05:00.000Z",
      bedienung: "Selbstbestellung",
      createId
    });

    expect(session.kitchenTicketBatches).toHaveLength(1);
    expect(session.kitchenTicketBatches[0]?.sequence).toBe(1);
    expect(session.barTicketBatches.map((batch) => batch.sequence)).toEqual([1, 2]);
    expect(session.items.find((item) => item.productId === "service")?.sentAt).toBeUndefined();
    expect(session.items.find((item) => item.productId === "pizza")?.kitchenUnitStates).toHaveLength(2);
  });

  it("verwendet Personenzahl und leitet den einfachen Kundenstatus ab", () => {
    const session = createSession();
    let id = 0;
    appendValidatedSelfOrderLines({
      session,
      lines: validateSelfOrderLines(products, [
        {
          productId: "pizza",
          quantity: 1,
          modifiers: [{ groupId: "size", optionIds: ["small"] }]
        },
        { productId: "cola", quantity: 1 }
      ]),
      createdAt: "2026-06-13T20:00:00.000Z",
      bedienung: "Selbstbestellung",
      createId: (prefix) => `${prefix}-${++id}`
    });

    expect(calculateGuestCount(session)).toBe(4);
    expect(resolveSelfOrderCustomerStatus(session, products)).toBe("preparing");

    const pizza = session.items.find((item) => item.productId === "pizza");
    if (pizza) pizza.preparedAt = "2026-06-13T20:10:00.000Z";
    expect(resolveSelfOrderCustomerStatus(session, products)).toBe("partially-ready");

    const cola = session.items.find((item) => item.productId === "cola");
    if (cola) cola.preparedAt = "2026-06-13T20:11:00.000Z";
    expect(resolveSelfOrderCustomerStatus(session, products)).toBe("ready");

    session.status = "closed";
    expect(resolveSelfOrderCustomerStatus(session, products)).toBe("closed");
  });
});
