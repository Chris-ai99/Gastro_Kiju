import type { ReceiptDocumentInput } from "@kiju/print-bridge";
import type {
  KitchenTicketBatch,
  NetworkPrinterConfig,
  OrderSession,
  PersistedPrintJob,
  Product,
  TableLayout
} from "@kiju/domain";

export type ReceiptPrintMode = "receipt" | "reprint";

export type CreatePrintJobRequest =
  | {
      type: ReceiptPrintMode;
      receipt: ReceiptDocumentInput;
      tableId?: string;
      tableLabel?: string;
      sessionId?: string;
    }
  | {
      type: "kitchen-ticket";
      session: OrderSession;
      table: TableLayout;
      products: Product[];
      batch: KitchenTicketBatch;
    };

export type UpdatePrinterConfigRequest = Pick<NetworkPrinterConfig, "enabled" | "host" | "port">;

export type PrintOverviewResponse = {
  ok: true;
  printer: NetworkPrinterConfig;
  jobs: PersistedPrintJob[];
};

export type PrintJobResponse = {
  ok: boolean;
  printer: NetworkPrinterConfig;
  job?: PersistedPrintJob;
  message?: string;
};

export const normalizePublicBasePath = (value?: string) => {
  if (!value) return "";

  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") {
    return "";
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
};

export const resolvePrintApiPath = (suffix = "") => {
  const deployedBasePath = normalizePublicBasePath(process.env["NEXT_PUBLIC_BASE_PATH"]);
  const basePath = deployedBasePath ? `${deployedBasePath}/api/print` : "/api/print";
  return suffix ? `${basePath}${suffix}` : basePath;
};
