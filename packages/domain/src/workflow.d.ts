import type { AppState, CourseKey, KitchenStatus, OrderItem, OrderSession, Product, SessionStatus, TableLayout } from "./types";
export declare const courseLabels: Record<CourseKey, string>;
export declare const paymentLabels: {
    readonly cash: "Bar";
    readonly card: "Karte";
    readonly voucher: "Gutschein";
};
export declare const euro: (valueCents: number) => string;
export declare const getProductById: (products: Product[], id: string) => Product | undefined;
export declare const getSessionForTable: (sessions: OrderSession[], tableId: string) => OrderSession | undefined;
export declare const getItemsForCourse: (session: OrderSession | undefined, course: CourseKey) => OrderItem[];
export declare const getSeatItems: (session: OrderSession | undefined, seatId: string) => OrderItem[];
export declare const resolveSessionStatus: (table: TableLayout, session?: OrderSession) => SessionStatus;
export declare const calculateItemTotal: (item: OrderItem, products: Product[]) => number;
export declare const calculateSessionTotal: (session: OrderSession | undefined, products: Product[]) => number;
export declare const calculateGuestCount: (session?: OrderSession) => number;
export declare const buildKitchenSummary: (session: OrderSession | undefined, table: TableLayout, products: Product[]) => {
    tableId: string;
    tableName: string;
    active: boolean;
    plannedOnly: boolean;
    courses: {
        course: CourseKey;
        label: string;
        status: KitchenStatus;
        itemCount: number;
    }[];
};
export declare const buildDashboardSummary: (state: AppState) => {
    table: TableLayout;
    session: OrderSession | undefined;
    status: SessionStatus;
    total: number;
    guests: number;
}[];
export declare const buildClosedSessions: (state: AppState) => OrderSession[];
