export type Role = "admin" | "waiter" | "kitchen" | "bar";
export type LoginMethod = "password" | "pin";
export type CourseKey = "drinks" | "starter" | "main" | "dessert";
export type ProductCategory = CourseKey;
export type ProductionTarget = "service" | "bar" | "kitchen";
export type PaymentMethod = "cash" | "card" | "voucher";
export type PrintJobType =
  | "receipt"
  | "reprint"
  | "daily-close"
  | "kitchen-ticket"
  | "test-print";
export type PrintJobStatus = "pending" | "processing" | "printed" | "failed";
export type ThermalPrintAlign = "left" | "center";
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
export type KitchenUnitStatus = "pending" | "in-progress" | "completed";
export const EXTRA_INGREDIENTS_MODIFIER_GROUP_ID = "extra-ingredients";
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

export interface ExtraIngredient {
  id: string;
  name: string;
  priceDeltaCents: number;
  active: boolean;
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
  supportsExtraIngredients?: boolean;
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

export interface KitchenUnitState {
  status: KitchenUnitStatus;
  startedAt?: string;
  completedAt?: string;
}

export interface OrderItem {
  id: string;
  target: OrderTarget;
  productId: string;
  category: ProductCategory;
  quantity: number;
  note?: string;
  modifiers: OrderModifierSelection[];
  kitchenUnitStates?: KitchenUnitState[];
  createdAt?: string;
  sentAt?: string;
  canceledAt?: string;
  canceledByUserId?: string;
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

export type BarTicketBatch = KitchenTicketBatch;

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

export interface OrderCancellation {
  id: string;
  label: string;
  createdAt: string;
  createdByUserId?: string;
  lineItems: PaymentLineItem[];
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
  barTicketBatches: BarTicketBatch[];
  payments: PaymentSplit[];
  cancellations: OrderCancellation[];
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
  createdByUserId?: string;
  createdByName?: string;
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

export interface ThermalPrintLine {
  text: string;
  emphasis?: boolean;
  align?: ThermalPrintAlign;
}

export interface ThermalPrintDocument {
  title: string;
  width: number;
  lines: ThermalPrintLine[];
}

export interface NetworkPrinterConfig {
  enabled: boolean;
  host: string;
  port: number;
  model: string;
  lastTestAt?: string;
  lastError?: string;
}

export interface PersistedPrintJob {
  id: string;
  type: PrintJobType;
  status: PrintJobStatus;
  title: string;
  subtitle?: string;
  tableId?: string;
  tableLabel?: string;
  sessionId?: string;
  batchId?: string;
  course?: CourseKey;
  sequence?: number;
  createdAt: string;
  updatedAt: string;
  lastAttemptAt?: string;
  printedAt?: string;
  failedAt?: string;
  error?: string;
  attemptCount: number;
  document: ThermalPrintDocument;
}

export interface PrintQueueState {
  version: number;
  updatedAt: string;
  printer: NetworkPrinterConfig;
  jobs: PersistedPrintJob[];
}

export interface AppState {
  catalogVersion?: number;
  serviceOrderMode: ServiceOrderMode;
  designMode: DesignMode;
  linkedTableGroups: LinkedTableGroup[];
  deletedTableIds?: string[];
  deletedUserIds?: string[];
  deletedProductIds?: string[];
  extraIngredients?: ExtraIngredient[];
  users: UserAccount[];
  tables: TableLayout[];
  products: Product[];
  sessions: OrderSession[];
  notifications: AppNotification[];
  dailyStats: DailyStats;
}
