export declare const theme: {
    readonly colors: {
        readonly deepNavy: "#1E3A8A";
        readonly ivory: "#F8FAFC";
        readonly amber: "#CA8A04";
        readonly serviceRed: "#DC2626";
        readonly readyGreen: "#16A34A";
        readonly slate: "#0F172A";
        readonly line: "#CBD5E1";
        readonly softBlue: "#DBEAFE";
        readonly alertTint: "#FEF2F2";
        readonly successTint: "#DCFCE7";
        readonly waitingTint: "#FFFBEB";
    };
    readonly shadows: {
        readonly card: "0 18px 40px rgba(15, 23, 42, 0.12)";
        readonly stage: "0 30px 80px rgba(30, 58, 138, 0.16)";
    };
    readonly radius: {
        readonly xl: "24px";
        readonly lg: "18px";
        readonly md: "14px";
    };
};
export declare const appMetadata: {
    readonly name: "KiJu Gastro Order System";
    readonly shortName: "KiJu Gastro";
    readonly description: "Tablet-first Gastro-Service-System für Bestellungen, Küchenwellen, Admin und Tagesabschluss.";
};
export declare const deploymentConfig: {
    readonly basePath: string;
};
export declare const resolveAppUrl: (path?: string) => string;
export declare const routeConfig: {
    readonly login: "/";
    readonly waiter: "/waiter";
    readonly kitchen: "/kitchen";
    readonly admin: "/admin";
};
export declare const kitchenRules: {
    readonly releaseCountdownMinutes: 10;
    readonly fixedColumns: 7;
    readonly courseOrder: readonly ["starter", "main", "dessert", "drinks"];
};
export declare const serviceLabels: {
    readonly notRecorded: "Nicht erfasst";
    readonly skipped: "X";
    readonly waiting: "Bestellung warten";
    readonly sendToKitchen: "Bestellung an Küche senden";
    readonly finalize: "Bestellung verbuchen";
    readonly printReceipt: "Rechnung drucken";
    readonly reprintReceipt: "Rechnung nochmal drucken";
    readonly closeOrder: "Bestellung schließen";
};
