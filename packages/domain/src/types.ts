export type Role = "admin" | "waiter" | "kitchen";
export type LoginMethod = "password" | "pin";
export type CourseKey = "drinks" | "starter" | "main" | "dessert";
export type ProductCategory = CourseKey;
export type ProductionTarget = "service" | "bar" | "kitchen";
export type PaymentMethod = "cash" | "card" | "voucher";
export type ServiceOrderMode = "table" | "seat";
export type DesignMode = "modern" | "classic";
export type OrderTarget = { type: "table" } | { type: "seat"; seatId: string };
export type SessionStatus =
  | "planned"
  | "idle"
  | "serving"
  | "waiting"
  | "ready-to-bill"
  | "closed";
export type KitchenStatus =
  | "not-recorded"
  | "skipped"
  | "blocked"
  | "countdown"
  | "ready"
  | "completed";
export type NotificationTone = "info" | "success" | "alert";
export type NotificationKind =
  | "service-drinks"
  | "service-drinks-accepted"
  | "service-course-ready"
  | "service-course-ready-accepted"
  | "admin-receipt-alarm";

export interface UserAccount {
  id: string;
  name: string;
  username: string;
  role: Role;
  password: string;
  pin?: string;
  active: boolean;
  lastSeenAt?: string;
}

export interface ModifierOption {
  id: string;
  name: string;
  priceDeltaCents: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  required: boolean;
  min: number;
  max: number;
  options: ModifierOption[];
}

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  drinkSubcategory?: string;
  description: string;
  priceCents: number;
  taxRate: number;
  allergens: string[];
  showInKitchen: boolean;
  productionTarget: ProductionTarget;
  modifierGroups: ModifierGroup[];
}

export interface TableSeat {
  id: string;
  label: string;
  visible: boolean;
}

export interface TableLayout {
  id: string;
  name: string;
  seatCount: number;
  active: boolean;
  plannedOnly: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  note?: string;
  seats: TableSeat[];
}

export interface OrderModifierSelection {
  groupId: string;
  optionIds: string[];
}

export interface OrderItem {
  id: string;
  target: OrderTarget;
  productId: string;
  category: ProductCategory;
  quantity: number;
  note?: string;
  modifiers: OrderModifierSelection[];
  sentAt?: string;
  preparedAt?: string;
  servedAt?: string;
}

export interface CourseTicket {
  course: CourseKey;
  status: KitchenStatus;
  sentAt?: string;
  releasedAt?: string;
  readyAt?: string;
  completedAt?: string;
  manualRelease: boolean;
  countdownMinutes: number;
}

export interface KitchenTicketBatch {
  id: string;
  course: CourseKey;
  itemIds: string[];
  status: KitchenStatus;
  sentAt: string;
  releasedAt?: string;
  readyAt?: string;
  completedAt?: string;
  manualRelease: boolean;
  countdownMinutes: number;
  sequence: number;
}

export interface PaymentLineItem {
  itemId: string;
  quantity: number;
}

export interface PaymentSplit {
  id: string;
  label: string;
  amountCents: number;
  method: PaymentMethod;
  lineItems: PaymentLineItem[];
  tableIds?: string[];
  groupId?: string;
}

export interface OrderPartyGroup {
  id: string;
  label: string;
  itemIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptRecord {
  printedAt?: string;
  reprintedAt?: string;
  closedAt?: string;
}

export interface OrderSession {
  id: string;
  tableId: string;
  waiterId: string;
  status: SessionStatus;
  items: OrderItem[];
  skippedCourses: CourseKey[];
  courseTickets: Record<CourseKey, CourseTicket>;
  kitchenTicketBatches: KitchenTicketBatch[];
  payments: PaymentSplit[];
  partyGroups: OrderPartyGroup[];
  receipt: ReceiptRecord;
}

export interface DailyStats {
  date: string;
  servedTables: number;
  servedGuests: number;
  revenueCents: number;
  closedOrderIds: string[];
}

export interface AppNotification {
  id: string;
  kind?: NotificationKind;
  course?: CourseKey;
  itemIds?: string[];
  title: string;
  body: string;
  tone: NotificationTone;
  tableId?: string;
  targetRoles?: Role[];
  acceptedByUserId?: string;
  acceptedByName?: string;
  sourceNotificationId?: string;
  createdAt: string;
  expiresAt?: string;
  read: boolean;
}

export interface LinkedTableGroup {
  id: string;
  label: string;
  tableIds: string[];
  active: boolean;
  createdAt: string;
}

export interface AppState {
  catalogVersion?: number;
  serviceOrderMode: ServiceOrderMode;
  designMode: DesignMode;
  linkedTableGroups: LinkedTableGroup[];
  deletedTableIds?: string[];
  deletedUserIds?: string[];
  users: UserAccount[];
  tables: TableLayout[];
  products: Product[];
  sessions: OrderSession[];
  notifications: AppNotification[];
  dailyStats: DailyStats;
}
