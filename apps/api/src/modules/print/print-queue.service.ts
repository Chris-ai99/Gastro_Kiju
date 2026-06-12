import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrintJob as DatabasePrintJob } from "@prisma/client";
import {
  buildBookingStatisticsPrintDocument,
  buildKitchenPlateLabelPrintDocument,
  buildKitchenTicketPrintDocument,
  buildPickupTicketPrintDocument,
  buildPrinterTestDocument,
  buildReceiptPrintDocument
} from "@kiju/print-bridge";
import type {
  CourseKey,
  NetworkPrinterConfig,
  PersistedPrintJob,
  ThermalPrintDocument
} from "@kiju/domain";

import { PrismaService } from "../prisma/prisma.service";
import { sendDocumentToNetworkPrinter } from "./network-printer";
import type { PrintJobRequest } from "./print.types";

const PRINTER_CONFIG_ID = "network-printer";
const DEFAULT_PRINTER_CONFIG: NetworkPrinterConfig = {
  enabled: false,
  host: "",
  port: 9100,
  model: "Epson TM-T70II"
};
const courseLabels: Record<Exclude<CourseKey, "drinks">, string> = {
  starter: "Vorspeise",
  main: "Hauptspeise",
  dessert: "Nachtisch"
};
const receiptJobTitles = {
  receipt: {
    full: "Gesamtbon drucken",
    table: "Tisch-Bon drucken",
    partial: "Teil-Bon drucken"
  },
  reprint: {
    full: "Gesamtbon erneut drucken",
    table: "Tisch-Bon erneut drucken",
    partial: "Teil-Bon erneut drucken"
  }
} as const;

const asJson = (value: unknown) => value as Prisma.InputJsonValue;
const hashRequest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const normalizePrinterConfig = (
  printer?: Partial<NetworkPrinterConfig>
): NetworkPrinterConfig => ({
  enabled: printer?.enabled ?? DEFAULT_PRINTER_CONFIG.enabled,
  host: printer?.host?.trim() ?? DEFAULT_PRINTER_CONFIG.host,
  port:
    typeof printer?.port === "number" &&
    Number.isFinite(printer.port) &&
    printer.port > 0
      ? Math.round(printer.port)
      : DEFAULT_PRINTER_CONFIG.port,
  model: printer?.model?.trim() || DEFAULT_PRINTER_CONFIG.model,
  lastTestAt: printer?.lastTestAt,
  lastError: printer?.lastError
});

@Injectable()
export class PrintQueueService implements OnModuleInit {
  private readonly logger = new Logger(PrintQueueService.name);
  private workerPromise: Promise<void> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.schedule();
  }

  schedule() {
    if (this.workerPromise) return;
    this.workerPromise = (async () => {
      try {
        while (await this.processNextJob()) {
          // Druckjobs werden strikt in Erstellungsreihenfolge verarbeitet.
        }
      } catch (error) {
        this.logger.error(
          "Die Druckwarteschlange konnte nicht verarbeitet werden.",
          error instanceof Error ? error.stack : undefined
        );
      }
    })().finally(() => {
      this.workerPromise = null;
    });
  }

  async getOverview() {
    this.schedule();
    const [printer, jobs] = await Promise.all([
      this.getPrinterConfig(),
      this.prisma.printJob.findMany({
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
      })
    ]);
    return { printer, jobs: jobs.map((job) => this.toPersistedJob(job)) };
  }

  async getPrinterConfig() {
    const record = await this.prisma.printerConfig.upsert({
      where: { id: PRINTER_CONFIG_ID },
      create: {
        id: PRINTER_CONFIG_ID,
        config: asJson(DEFAULT_PRINTER_CONFIG)
      },
      update: {}
    });
    return normalizePrinterConfig(
      record.config as unknown as Partial<NetworkPrinterConfig>
    );
  }

  async updatePrinterConfig(
    input: Pick<NetworkPrinterConfig, "enabled" | "host" | "port">
  ) {
    const current = await this.getPrinterConfig();
    const next = normalizePrinterConfig({ ...current, ...input });
    await this.prisma.printerConfig.upsert({
      where: { id: PRINTER_CONFIG_ID },
      create: { id: PRINTER_CONFIG_ID, config: asJson(next) },
      update: {
        version: { increment: 1 },
        config: asJson(next)
      }
    });
    this.schedule();
    return next;
  }

  async enqueue(request: PrintJobRequest) {
    const id = `print-job-${randomUUID()}`;
    const job = await this.prisma.printJob.create({
      data: {
        id,
        transactionId: `print-direct-${id}`,
        requestHash: hashRequest(request),
        request: asJson(request)
      }
    });
    const printer = await this.getPrinterConfig();
    this.schedule();
    return { printer, job: this.toPersistedJob(job) };
  }

  async enqueueTest() {
    return this.enqueue({ type: "test-print" });
  }

  async retry(jobId: string) {
    const existing = await this.prisma.printJob.findUnique({
      where: { id: jobId }
    });
    if (!existing) {
      return { ok: false as const, message: "Druckjob wurde nicht gefunden." };
    }
    const job = await this.prisma.printJob.update({
      where: { id: jobId },
      data: {
        status: "pending",
        printedAt: null,
        failedAt: null,
        error: null
      }
    });
    this.schedule();
    return { ok: true as const, job: this.toPersistedJob(job) };
  }

  private async processNextJob() {
    const claimed = await this.prisma.$transaction(
      async (database) => {
        const next = await database.printJob.findFirst({
          where: { status: "pending" },
          orderBy: { createdAt: "asc" }
        });
        if (!next) return null;
        const updated = await database.printJob.updateMany({
          where: { id: next.id, status: "pending" },
          data: {
            status: "processing",
            attemptCount: { increment: 1 },
            lastAttemptAt: new Date()
          }
        });
        return updated.count === 1
          ? database.printJob.findUnique({ where: { id: next.id } })
          : null;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
    if (!claimed) return false;

    const printer = await this.getPrinterConfig();
    const request = claimed.request as unknown as PrintJobRequest;
    try {
      await sendDocumentToNetworkPrinter(
        printer,
        this.buildDocument(request, printer)
      );
      await this.finishJob(claimed.id, request, printer);
    } catch (error) {
      await this.failJob(
        claimed.id,
        request,
        printer,
        error instanceof Error ? error.message : "Unbekannter Druckfehler."
      );
    }
    return true;
  }

  private async finishJob(
    jobId: string,
    request: PrintJobRequest,
    printer: NetworkPrinterConfig
  ) {
    const printedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.printJob.update({
        where: { id: jobId },
        data: {
          status: "printed",
          printedAt,
          failedAt: null,
          error: null
        }
      }),
      this.prisma.printerConfig.update({
        where: { id: PRINTER_CONFIG_ID },
        data: {
          config: asJson({
            ...printer,
            lastError: undefined,
            ...(request.type === "test-print"
              ? { lastTestAt: printedAt.toISOString() }
              : {})
          })
        }
      })
    ]);
  }

  private async failJob(
    jobId: string,
    request: PrintJobRequest,
    printer: NetworkPrinterConfig,
    message: string
  ) {
    const failedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.printJob.update({
        where: { id: jobId },
        data: { status: "failed", failedAt, error: message }
      }),
      this.prisma.printerConfig.update({
        where: { id: PRINTER_CONFIG_ID },
        data: {
          config: asJson({
            ...printer,
            lastError: message,
            ...(request.type === "test-print"
              ? { lastTestAt: failedAt.toISOString() }
              : {})
          })
        }
      })
    ]);
  }

  private buildDocument(
    request: PrintJobRequest,
    printer: NetworkPrinterConfig
  ): ThermalPrintDocument {
    switch (request.type) {
      case "receipt":
      case "reprint":
        return buildReceiptPrintDocument(request.receipt);
      case "kitchen-ticket":
        return buildKitchenTicketPrintDocument(request);
      case "kitchen-label":
        return buildKitchenPlateLabelPrintDocument(request);
      case "pickup-ticket":
        return buildPickupTicketPrintDocument(request);
      case "daily-close":
        return buildBookingStatisticsPrintDocument(request);
      case "test-print":
        return buildPrinterTestDocument(
          printer.model,
          printer.host,
          printer.port
        );
      case "legacy-document":
        return request.job.document;
    }
  }

  private toPersistedJob(job: DatabasePrintJob): PersistedPrintJob {
    const request = job.request as unknown as PrintJobRequest;
    return {
      id: job.id,
      ...this.buildMetadata(request),
      status:
        job.status === "processing" ||
        job.status === "printed" ||
        job.status === "failed"
          ? job.status
          : "pending",
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      attemptCount: job.attemptCount,
      lastAttemptAt: job.lastAttemptAt?.toISOString(),
      printedAt: job.printedAt?.toISOString(),
      failedAt: job.failedAt?.toISOString(),
      error: job.error ?? undefined,
      document: this.buildDocument(request, DEFAULT_PRINTER_CONFIG)
    };
  }

  private buildMetadata(
    request: PrintJobRequest
  ): Omit<
    PersistedPrintJob,
    | "id"
    | "status"
    | "createdAt"
    | "updatedAt"
    | "attemptCount"
    | "lastAttemptAt"
    | "printedAt"
    | "failedAt"
    | "error"
    | "document"
  > {
    if (request.type === "receipt" || request.type === "reprint") {
      const tableLabel =
        request.tableLabel?.trim() ||
        request.tableId?.replace("table-", "Tisch ") ||
        "Kassenbon";
      return {
        type: request.type,
        title: receiptJobTitles[request.type][request.receipt.mode],
        subtitle: tableLabel,
        tableId: request.tableId,
        tableLabel,
        sessionId: request.sessionId
      };
    }
    if (request.type === "kitchen-ticket") {
      const courseLabel =
        courseLabels[request.batch.course as Exclude<CourseKey, "drinks">];
      return {
        type: request.type,
        title: "Küchenbon drucken",
        subtitle:
          request.batch.sequence > 1
            ? `${request.table.name} · ${courseLabel} · Nachbestellung ${request.batch.sequence}`
            : `${request.table.name} · ${courseLabel}`,
        tableId: request.table.id,
        tableLabel: request.table.name,
        sessionId: request.session.id,
        batchId: request.batch.id,
        course: request.batch.course,
        sequence: request.batch.sequence
      };
    }
    if (request.type === "kitchen-label") {
      const item = request.session.items.find(
        (entry) => entry.id === request.itemId
      );
      const productName =
        request.products.find((entry) => entry.id === item?.productId)?.name ??
        "Unbekannter Artikel";
      return {
        type: request.type,
        title: "Tellerbon drucken",
        subtitle: `${request.table.name} · ${productName}`,
        tableId: request.table.id,
        tableLabel: request.table.name,
        sessionId: request.session.id,
        batchId: request.batch.id,
        itemId: request.itemId,
        unitIndex: request.unitIndex,
        course: request.batch.course,
        sequence: request.batch.sequence
      };
    }
    if (request.type === "pickup-ticket") {
      return {
        type: request.type,
        title: "Abholbon drucken",
        subtitle: `${request.tableLabel} · Bon ${request.pickupNumber}`,
        tableId: request.tableId,
        tableLabel: request.tableLabel,
        sequence: request.pickupNumber
      };
    }
    if (request.type === "daily-close") {
      return {
        type: request.type,
        title: "Statistik drucken",
        subtitle: `${request.sessions.length} Buchungen`
      };
    }
    if (request.type === "legacy-document") {
      const legacy = request.job;
      return {
        type: legacy.type,
        title: legacy.title,
        subtitle: legacy.subtitle,
        tableId: legacy.tableId,
        tableLabel: legacy.tableLabel,
        sessionId: legacy.sessionId,
        batchId: legacy.batchId,
        itemId: legacy.itemId,
        unitIndex: legacy.unitIndex,
        course: legacy.course,
        sequence: legacy.sequence
      };
    }
    return {
      type: "test-print",
      title: "Testdruck",
      subtitle: "Netzwerkdrucker"
    };
  }
}
