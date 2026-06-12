import type { ReceiptDocumentInput } from "@kiju/print-bridge";
import type {
  KitchenTicketBatch,
  OrderItem,
  OrderSession,
  PersistedPrintJob,
  Product,
  TableLayout
} from "@kiju/domain";

export type PrintJobRequest =
  | {
      type: "receipt" | "reprint";
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
    }
  | {
      type: "daily-close";
      sessions: OrderSession[];
      tables: TableLayout[];
      products: Product[];
      printedAt?: string;
    }
  | {
      type: "pickup-ticket";
        tableId: string;
        tableLabel: string;
        pickupNumber: number;
        bedienung?: string;
        createdAt?: string;
      }
  | {
      type: "kitchen-label";
      session: OrderSession;
      table: TableLayout;
      products: Product[];
      batch: KitchenTicketBatch;
      itemId: OrderItem["id"];
      unitIndex: number;
      completedAt: string;
    }
  | {
      type: "test-print";
    }
  | {
      type: "legacy-document";
      job: PersistedPrintJob;
    };
