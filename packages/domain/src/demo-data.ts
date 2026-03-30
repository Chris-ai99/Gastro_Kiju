import { kitchenRules } from "@kiju/config";

import type {
  AppState,
  CourseKey,
  CourseTicket,
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
    label: `P${index + 1}`
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
    id: "drink-cola",
    name: "Cola",
    category: "drinks",
    description: "Klassische Cola, kalt serviert.",
    priceCents: 250,
    taxRate: 19,
    allergens: ["Koffein"],
    showInKitchen: false,
    productionTarget: "service",
    modifierGroups: [drinkSizeModifier]
  },
  {
    id: "drink-water",
    name: "Wasser",
    category: "drinks",
    description: "Still oder sprudelnd.",
    priceCents: 200,
    taxRate: 19,
    allergens: [],
    showInKitchen: false,
    productionTarget: "service",
    modifierGroups: [drinkSizeModifier]
  },
  {
    id: "starter-bruschetta",
    name: "Bruschetta",
    category: "starter",
    description: "Gerostetes Brot mit Tomaten und Basilikum.",
    priceCents: 550,
    taxRate: 7,
    allergens: ["Gluten"],
    showInKitchen: true,
    productionTarget: "kitchen",
    modifierGroups: []
  },
  {
    id: "starter-salad",
    name: "Beilagensalat",
    category: "starter",
    description: "Kleiner knackiger Salat mit Hausdressing.",
    priceCents: 490,
    taxRate: 7,
    allergens: ["Senf"],
    showInKitchen: true,
    productionTarget: "kitchen",
    modifierGroups: []
  },
  {
    id: "main-pizza-margherita",
    name: "Pizza Margherita",
    category: "main",
    description: "Klassisch mit Tomate und Mozzarella.",
    priceCents: 700,
    taxRate: 7,
    allergens: ["Gluten", "Milch"],
    showInKitchen: true,
    productionTarget: "kitchen",
    modifierGroups: [cheeseModifier]
  },
  {
    id: "main-pasta",
    name: "Pasta Napoli",
    category: "main",
    description: "Hausgemachte Pasta mit Tomatensauce.",
    priceCents: 760,
    taxRate: 7,
    allergens: ["Gluten", "Ei"],
    showInKitchen: true,
    productionTarget: "kitchen",
    modifierGroups: [cheeseModifier]
  },
  {
    id: "dessert-icecream",
    name: "Eisbecher",
    category: "dessert",
    description: "Vanilleeis mit Schokosauce.",
    priceCents: 350,
    taxRate: 7,
    allergens: ["Milch"],
    showInKitchen: true,
    productionTarget: "kitchen",
    modifierGroups: []
  },
  {
    id: "dessert-cake",
    name: "Kuchen des Tages",
    category: "dessert",
    description: "Wechselnder Tageskuchen.",
    priceCents: 390,
    taxRate: 7,
    allergens: ["Gluten", "Ei", "Milch"],
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

export const demoSessions: OrderSession[] = [
  {
    id: "session-table-1",
    tableId: "table-1",
    waiterId: "user-waiter-1",
    status: "serving",
    items: [
      {
        id: "item-1",
        seatId: "table-1-seat-1",
        productId: "drink-cola",
        category: "drinks",
        quantity: 1,
        modifiers: [{ groupId: "size-drink", optionIds: ["large"] }],
        sentAt: now
      },
      {
        id: "item-2",
        seatId: "table-1-seat-1",
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
        seatId: "table-1-seat-2",
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
    payments: [],
    receipt: {}
  },
  {
    id: "session-table-3",
    tableId: "table-3",
    waiterId: "user-waiter-2",
    status: "hold",
    holdReason: "Gäste brauchen Bedenkzeit für Hauptgang",
    items: [
      {
        id: "item-4",
        seatId: "table-3-seat-1",
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
    payments: [],
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
        seatId: "table-5-seat-1",
        productId: "drink-cola",
        category: "drinks",
        quantity: 1,
        modifiers: [],
        sentAt: "2026-03-27T16:20:00.000Z",
        servedAt: "2026-03-27T16:25:00.000Z"
      },
      {
        id: "item-closed-2",
        seatId: "table-5-seat-1",
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
    payments: [
      {
        id: "payment-closed-1",
        label: "Kartenzahlung",
        amountCents: 1010,
        method: "card"
      }
    ],
    receipt: {
      printedAt: "2026-03-27T16:47:00.000Z",
      closedAt: "2026-03-27T16:49:00.000Z"
    }
  }
];

export const demoAppState: AppState = {
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
      body: "Tisch 3 ist auf Hold gesetzt.",
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
