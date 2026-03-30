import type { OrderSession, PaymentMethod, Product } from "@kiju/domain";

export type PrintJob = {
  id: string;
  tableLabel: string;
  sessionId: string;
  type: "receipt" | "reprint" | "daily-close";
  createdAt: string;
};

export interface PrintAdapter {
  name: string;
  print(job: PrintJob, session: OrderSession, products: Product[]): Promise<void>;
}

export interface FiscalAdapter {
  name: string;
  registerPayment(session: OrderSession, method: PaymentMethod): Promise<void>;
  exportDsfinvk(forDate: string): Promise<string>;
}

export class WindowsSpoolPrintAdapter implements PrintAdapter {
  name = "windows-spool";

  async print(job: PrintJob) {
    console.info(`[print-bridge] queued ${job.type} via ${this.name} for ${job.tableLabel}`);
  }
}

export class EscPosPrintAdapter implements PrintAdapter {
  name = "esc-pos";

  async print(job: PrintJob) {
    console.info(`[print-bridge] queued ${job.type} via ${this.name} for ${job.tableLabel}`);
  }
}

export class DeferredFiscalAdapter implements FiscalAdapter {
  name = "phase-2-fiscal-placeholder";

  async registerPayment(session: OrderSession, method: PaymentMethod) {
    console.info(
      `[print-bridge] fiscal registration placeholder for session ${session.id} using ${method}`
    );
  }

  async exportDsfinvk(forDate: string) {
    return `DSFinV-K export placeholder for ${forDate}`;
  }
}
