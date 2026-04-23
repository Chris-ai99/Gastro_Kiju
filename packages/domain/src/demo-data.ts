import { kitchenRules } from "@kiju/config";

import type {
  AppState,
  CourseKey,
  CourseTicket,
  KitchenTicketBatch,
  ModifierGroup,
  OrderSession,
  Product,
  TableLayout,
  UserAccount
} from "./types";

const now = "2026-03-27T18:30:00.000Z";

const drinkSizeModifier: ModifierGroup = {
  id: "size-drink",
  name: "Größe",
  required: false,
  min: 0,
  max: 1,
  options: [
    { id: "small", name: "0,2l", priceDeltaCents: 0 },
    { id: "large", name: "0,4l", priceDeltaCents: 80 }
  ]
};

const cheeseModifier: ModifierGroup = {
  id: "extra-cheese",
  name: "Extras",
  required: false,
  min: 0,
  max: 2,
  options: [
    { id: "extra-cheese", name: "Extra Käse", priceDeltaCents: 120 },
    { id: "no-onion", name: "Ohne Zwiebeln", priceDeltaCents: 0 },
    { id: "mild", name: "Mild statt scharf", priceDeltaCents: 0 }
  ]
};

export const demoUsers: UserAccount[] = [
  {
    id: "user-admin",
    name: "Haus Amos Admin",
    username: "Admin",
    role: "admin",
    password: "Admin1234",
    active: true,
    lastSeenAt: now
  },
  {
    id: "user-waiter-1",
    name: "Leonie",
    username: "Kellner",
    role: "waiter",
    password: "KiJu1234",
    pin: "1234",
    active: true,
    lastSeenAt: now
  },
  {
    id: "user-waiter-2",
    name: "Jonas",
    username: "Jonas",
    role: "waiter",
    password: "Service2026",
    pin: "1212",
    active: true
  },
  {
    id: "user-kitchen",
    name: "Küche",
    username: "Kueche",
    role: "kitchen",
    password: "Kitchen1234",
    pin: "2026",
    active: true
  }
];

const createSeats = (tableId: string, count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `${tableId}-seat-${index + 1}`,
    label: `P${index + 1}`,
    visible: true
  }));

export const demoTables: TableLayout[] = [
  { id: "table-1", name: "Tisch 1", seatCount: 5, active: true, plannedOnly: false, x: 63, y: 60, width: 15, height: 20, seats: createSeats("table-1", 5) },
  { id: "table-2", name: "Tisch 2", seatCount: 5, active: true, plannedOnly: false, x: 78, y: 60, width: 15, height: 20, seats: createSeats("table-2", 5) },
  { id: "table-3", name: "Tisch 3", seatCount: 5, active: true, plannedOnly: false, x: 58, y: 43, width: 18, height: 15, seats: createSeats("table-3", 5) },
  { id: "table-4", name: "Tisch 4", seatCount: 5, active: true, plannedOnly: false, x: 46, y: 32, width: 16, height: 14, seats: createSeats("table-4", 5) },
  { id: "table-5", name: "Tisch 5", seatCount: 4, active: true, plannedOnly: false, x: 33, y: 27, width: 14, height: 13, seats: createSeats("table-5", 4) },
  { id: "table-6", name: "Tisch 6", seatCount: 5, active: true, plannedOnly: false, x: 18, y: 27, width: 14, height: 13, seats: createSeats("table-6", 5) },
  {
    id: "table-7",
    name: "Sicherheitstisch 7",
    seatCount: 2,
    active: false,
    plannedOnly: true,
    x: 45,
    y: 49,
    width: 16,
    height: 13,
    note: "Nur über das Menü auswählbar",
    seats: createSeats("table-7", 2)
  }
];

export const demoProducts: Product[] = [
  {
    id: "starter-greeting",
    name: "Gruß aus der Küche",
    category: "starter",
    description: "Kleiner Gruß aus der Küche als Einstieg.",
    priceCents: 800,
    taxRate: 7,
    allergens: [],
    showInKitchen: true,
    productionTarget: "kitchen",
    modifierGroups: []
  },
  {
    id: "starter-pizza-bread-aioli",
    name: "Pizza Brot mit Aioli",
    category: "starter",
    description: "Frisch gebackenes Pizzabrot mit cremigem Aioli.",
    priceCents: 250,
    taxRate: 7,
    allergens: ["Gluten", "Ei"],
    showInKitchen: true,
    productionTarget: "kitchen",
    modifierGroups: []
  },
  {
    id: "main-pasta-pesto",
    name: "Nudeln mit grüner Pesto",
    category: "main",
    description: "Pasta mit würziger grüner Pesto.",
    priceCents: 700,
    taxRate: 7,
    allergens: ["Gluten", "Nüsse"],
    showInKitchen: true,
    productionTarget: "kitchen",
    modifierGroups: []
  },
  {
    id: "main-pasta-tomato",
    name: "Nudeln mit Tomatensauce",
    category: "main",
    description: "Pasta mit klassischer Tomatensauce.",
    priceCents: 700,
    taxRate: 7,
    allergens: ["Gluten"],
    showInKitchen: true,
    productionTarget: "kitchen",
    modifierGroups: []
  },
  {
    id: "main-pizza-ham",
    name: "Pizza Kochschinken",
    category: "main",
    description: "Pizza mit Tomate, Käse und Kochschinken.",
    priceCents: 800,
    taxRate: 7,
    allergens: ["Gluten", "Milch"],
    showInKitchen: true,
    productionTarget: "kitchen",
    modifierGroups: []
  },
  {
    id: "main-pizza-salami",
    name: "Pizza Salami",
    category: "main",
    description: "Pizza mit Tomate, Käse und Salami.",
    priceCents: 800,
    taxRate: 7,
    allergens: ["Gluten", "Milch"],
    showInKitchen: true,
    productionTarget: "kitchen",
    modifierGroups: []
  },
  {
    id: "main-pizza-speciale",
    name: "Pizza Speziale",
    category: "main",
    description: "Pizza Speziale mit herzhafter Belegung.",
    priceCents: 800,
    taxRate: 7,
    allergens: ["Gluten", "Milch"],
    showInKitchen: true,
    productionTarget: "kitchen",
    modifierGroups: []
  },
  {
    id: "main-pizza-tuna",
    name: "Pizza Thunfisch",
    category: "main",
    description: "Pizza mit Thunfisch und Tomatensauce.",
    priceCents: 800,
    taxRate: 7,
    allergens: ["Gluten", "Fisch", "Milch"],
    showInKitchen: true,
    productionTarget: "kitchen",
    modifierGroups: []
  },
  {
    id: "drink-beer",
    name: "Bier",
    category: "drinks",
    drinkSubcategory: "Bier/Radler",
    description: "Kalt serviertes Bier.",
    priceCents: 300,
    taxRate: 19,
    allergens: ["Gluten"],
    showInKitchen: false,
    productionTarget: "service",
    modifierGroups: []
  },
  {
    id: "drink-cola",
    name: "Cola",
    category: "drinks",
    drinkSubcategory: "Alkoholfrei",
    description: "Klassische Cola, kalt serviert.",
    priceCents: 250,
    taxRate: 19,
    allergens: ["Koffein"],
    showInKitchen: false,
    productionTarget: "service",
    modifierGroups: []
  },
  {
    id: "drink-water",
    name: "Wasser Still",
    category: "drinks",
    drinkSubcategory: "Alkoholfrei",
    description: "Stilles Wasser.",
    priceCents: 200,
    taxRate: 19,
    allergens: [],
    showInKitchen: false,
    productionTarget: "service",
    modifierGroups: []
  },
  {
    id: "drink-wine",
    name: "Wein",
    category: "drinks",
    drinkSubcategory: "Wein",
    description: "Hauswein im Glas.",
    priceCents: 400,
    taxRate: 19,
    allergens: ["Sulfite"],
    showInKitchen: false,
    productionTarget: "service",
    modifierGroups: []
  },
  {
    id: "dessert-pizza-bread-nutella",
    name: "Pizza Brot mit Nutella",
    category: "dessert",
    description: "Warmes Pizzabrot mit Nutella.",
    priceCents: 250,
    taxRate: 7,
    allergens: ["Gluten", "Milch", "Nüsse"],
    showInKitchen: true,
    productionTarget: "kitchen",
    modifierGroups: []
  }
];

const createTicket = (
  course: CourseKey,
  status: CourseTicket["status"],
  overrides: Partial<CourseTicket> = {}
): CourseTicket => ({
  course,
  status,
  countdownMinutes: kitchenRules.releaseCountdownMinutes,
  manualRelease: false,
  ...overrides
});

const baseCourseTickets = () =>
  ({
    drinks: createTicket("drinks", "not-recorded"),
    starter: createTicket("starter", "not-recorded"),
    main: createTicket("main", "not-recorded"),
    dessert: createTicket("dessert", "not-recorded")
  }) satisfies Record<CourseKey, CourseTicket>;

const createKitchenBatch = (
  id: string,
  course: CourseKey,
  itemIds: string[],
  ticket: CourseTicket,
  sequence = 1
): KitchenTicketBatch => ({
  id,
  course,
  itemIds,
  status: ticket.status,
  sentAt: ticket.sentAt ?? now,
  releasedAt: ticket.releasedAt,
  readyAt: ticket.readyAt,
  completedAt: ticket.completedAt,
  manualRelease: ticket.manualRelease,
  countdownMinutes: ticket.countdownMinutes,
  sequence
});

export const demoSessions: OrderSession[] = [
  {
    id: "session-table-1",
    tableId: "table-1",
    waiterId: "user-waiter-1",
    status: "serving",
    items: [
      {
        id: "item-1",
        target: { type: "seat", seatId: "table-1-seat-1" },
        productId: "drink-cola",
        category: "drinks",
        quantity: 1,
        modifiers: [{ groupId: "size-drink", optionIds: ["large"] }],
        sentAt: now
      },
      {
        id: "item-2",
        target: { type: "seat", seatId: "table-1-seat-1" },
        productId: "starter-bruschetta",
        category: "starter",
        quantity: 1,
        modifiers: [],
        sentAt: now,
        preparedAt: "2026-03-27T18:37:00.000Z",
        servedAt: "2026-03-27T18:42:00.000Z"
      },
      {
        id: "item-3",
        target: { type: "seat", seatId: "table-1-seat-2" },
        productId: "main-pizza-margherita",
        category: "main",
        quantity: 1,
        note: "Extra Käse",
        modifiers: [{ groupId: "extra-cheese", optionIds: ["extra-cheese"] }],
        sentAt: "2026-03-27T18:44:00.000Z"
      }
    ],
    skippedCourses: [],
    courseTickets: {
      ...baseCourseTickets(),
      drinks: createTicket("drinks", "completed", {
        sentAt: now,
        completedAt: "2026-03-27T18:31:00.000Z"
      }),
      starter: createTicket("starter", "completed", {
        sentAt: now,
        completedAt: "2026-03-27T18:37:00.000Z"
      }),
      main: createTicket("main", "countdown", {
        sentAt: "2026-03-27T18:44:00.000Z",
        releasedAt: "2026-03-27T18:44:00.000Z"
      })
    },
    kitchenTicketBatches: [
      createKitchenBatch(
        "kitchen-ticket-table-1-starter-1",
        "starter",
        ["item-2"],
        createTicket("starter", "completed", {
          sentAt: now,
          completedAt: "2026-03-27T18:37:00.000Z"
        })
      ),
      createKitchenBatch(
        "kitchen-ticket-table-1-main-1",
        "main",
        ["item-3"],
        createTicket("main", "countdown", {
          sentAt: "2026-03-27T18:44:00.000Z",
          releasedAt: "2026-03-27T18:44:00.000Z"
        })
      )
    ],
    payments: [],
    partyGroups: [],
    receipt: {}
  },
  {
    id: "session-table-3",
    tableId: "table-3",
    waiterId: "user-waiter-2",
    status: "serving",
    items: [
      {
        id: "item-4",
        target: { type: "seat", seatId: "table-3-seat-1" },
        productId: "drink-water",
        category: "drinks",
        quantity: 1,
        modifiers: [],
        sentAt: now,
        servedAt: "2026-03-27T18:34:00.000Z"
      }
    ],
    skippedCourses: ["starter"],
    courseTickets: {
      ...baseCourseTickets(),
      drinks: createTicket("drinks", "completed", {
        sentAt: now,
        completedAt: "2026-03-27T18:34:00.000Z"
      }),
      starter: createTicket("starter", "skipped")
    },
    kitchenTicketBatches: [],
    payments: [],
    partyGroups: [],
    receipt: {}
  },
  {
    id: "session-table-5-closed",
    tableId: "table-5",
    waiterId: "user-waiter-1",
    status: "closed",
    items: [
      {
        id: "item-closed-1",
        target: { type: "seat", seatId: "table-5-seat-1" },
        productId: "drink-cola",
        category: "drinks",
        quantity: 1,
        modifiers: [],
        sentAt: "2026-03-27T16:20:00.000Z",
        servedAt: "2026-03-27T16:25:00.000Z"
      },
      {
        id: "item-closed-2",
        target: { type: "seat", seatId: "table-5-seat-1" },
        productId: "main-pasta",
        category: "main",
        quantity: 1,
        modifiers: [],
        sentAt: "2026-03-27T16:28:00.000Z",
        preparedAt: "2026-03-27T16:42:00.000Z",
        servedAt: "2026-03-27T16:45:00.000Z"
      }
    ],
    skippedCourses: ["starter", "dessert"],
    courseTickets: {
      ...baseCourseTickets(),
      drinks: createTicket("drinks", "completed", {
        sentAt: "2026-03-27T16:20:00.000Z",
        completedAt: "2026-03-27T16:25:00.000Z"
      }),
      starter: createTicket("starter", "skipped"),
      main: createTicket("main", "completed", {
        sentAt: "2026-03-27T16:28:00.000Z",
        releasedAt: "2026-03-27T16:28:00.000Z",
        completedAt: "2026-03-27T16:42:00.000Z"
      }),
      dessert: createTicket("dessert", "skipped")
    },
    kitchenTicketBatches: [
      createKitchenBatch(
        "kitchen-ticket-table-5-main-1",
        "main",
        ["item-closed-2"],
        createTicket("main", "completed", {
          sentAt: "2026-03-27T16:28:00.000Z",
          releasedAt: "2026-03-27T16:28:00.000Z",
          completedAt: "2026-03-27T16:42:00.000Z"
        })
      )
    ],
    payments: [
      {
        id: "payment-closed-1",
        label: "Kartenzahlung",
        amountCents: 1010,
        method: "card",
        lineItems: [
          { itemId: "item-closed-1", quantity: 1 },
          { itemId: "item-closed-2", quantity: 1 }
        ]
      }
    ],
    partyGroups: [],
    receipt: {
      printedAt: "2026-03-27T16:47:00.000Z",
      closedAt: "2026-03-27T16:49:00.000Z"
    }
  }
];

export const demoAppState: AppState = {
  serviceOrderMode: "table",
  designMode: "modern",
  linkedTableGroups: [],
  users: demoUsers,
  tables: demoTables,
  products: demoProducts,
  sessions: demoSessions,
  notifications: [
    {
      id: "note-1",
      title: "Vorspeise fertig",
      body: "Tisch 1 kann serviert werden.",
      tone: "success",
      tableId: "table-1",
      createdAt: "2026-03-27T18:37:00.000Z",
      read: false
    },
    {
      id: "note-2",
      title: "Hauptgang wartet",
      body: "Tisch 3 wartet auf die Entscheidung zum Hauptgang.",
      tone: "info",
      tableId: "table-3",
      createdAt: "2026-03-27T18:40:00.000Z",
      read: false
    }
  ],
  dailyStats: {
    date: "2026-03-27",
    servedTables: 5,
    servedGuests: 18,
    revenueCents: 31240,
    closedOrderIds: ["session-table-5-closed"]
  }
};
