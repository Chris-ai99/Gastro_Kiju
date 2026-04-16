const normalizeBasePath = (value?: string) => {
  if (!value) return "";

  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";

  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
};

const joinBasePath = (basePath: string, path: string) => {
  const normalizedPath = path === "/" ? "/" : `/${path.replace(/^\/+/, "")}`;

  if (!basePath) {
    return normalizedPath;
  }

  return normalizedPath === "/" ? `${basePath}/` : `${basePath}${normalizedPath}`;
};

const runtimeScope = globalThis as typeof globalThis & {
  process?: {
    env?: Record<string, string | undefined>;
  };
};

export const theme = {
  colors: {
    deepNavy: "#1E3A8A",
    ivory: "#F8FAFC",
    amber: "#CA8A04",
    serviceRed: "#DC2626",
    readyGreen: "#16A34A",
    slate: "#0F172A",
    line: "#CBD5E1",
    softBlue: "#DBEAFE",
    alertTint: "#FEF2F2",
    successTint: "#DCFCE7",
    waitingTint: "#FFFBEB"
  },
  shadows: {
    card: "0 18px 40px rgba(15, 23, 42, 0.12)",
    stage: "0 30px 80px rgba(30, 58, 138, 0.16)"
  },
  radius: {
    xl: "24px",
    lg: "18px",
    md: "14px"
  }
} as const;

export const appMetadata = {
  name: "KiJu Gastro Order System",
  shortName: "KiJu Gastro",
  description:
    "Tablet-first Gastro-Service-System für Bestellungen, Küchenwellen, Admin und Tagesabschluss."
} as const;

export const deploymentConfig = {
  basePath: normalizeBasePath(runtimeScope.process?.env?.["NEXT_PUBLIC_BASE_PATH"])
} as const;

export const resolveAppUrl = (path = "/") => joinBasePath(deploymentConfig.basePath, path);

export const routeConfig = {
  login: "/",
  waiter: "/waiter",
  kitchen: "/kitchen",
  admin: "/admin"
} as const;

export const kitchenRules = {
  releaseCountdownMinutes: 15,
  fixedColumns: 7,
  courseOrder: ["starter", "main", "dessert", "drinks"]
} as const;

export const serviceLabels = {
  notRecorded: "Nicht erfasst",
  skipped: "X",
  onHold: "Hold",
  waiting: "Bestellung warten",
  sendToKitchen: "Bestellung an Küche senden",
  finalize: "Bestellung verbuchen",
  printReceipt: "Rechnung drucken",
  reprintReceipt: "Rechnung nochmal drucken",
  closeOrder: "Bestellung schließen"
} as const;
