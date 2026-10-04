import {
  ConflictException,
  Injectable,
  ServiceUnavailableException
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  applyCriticalOperation,
  createDefaultOperationalState,
  CriticalOperationConflictError,
  type AppState,
  type CriticalTransactionConfirmation,
  type CriticalTransactionRequest
} from "@kiju/domain";

import { PrismaService } from "../prisma/prisma.service";
import { PrintQueueService } from "../print/print-queue.service";

const OPERATIONAL_STATE_ID = "operational-state";
const checkpointKinds = new Set(["daily.reset", "staff.handover"]);

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  return value;
};

const hashPayload = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");

const asJson = (value: unknown) => value as Prisma.InputJsonValue;

const parseConfirmation = (value: Prisma.JsonValue) =>
  value as unknown as CriticalTransactionConfirmation;

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly printQueue: PrintQueueService
  ) {}

  async process(
    request: CriticalTransactionRequest
  ): Promise<CriticalTransactionConfirmation> {
    const payloadHash = hashPayload({
      operation: request.operation,
      printJobs: request.printJobs ?? []
    });
    const attemptNumber =
      (await this.prisma.transmissionAttempt.count({
        where: { transactionId: request.transactionId }
      })) + 1;
    const attempt = await this.prisma.transmissionAttempt.create({
      data: {
        transactionId: request.transactionId,
        deviceId: request.deviceId,
        actorId: request.actorId,
        kind: request.operation.kind,
        attemptNumber,
        status: "processing"
      }
    });

    try {
      const confirmation = await this.prisma.$transaction(
        async (database) => {
          const existing = await database.transactionRecord.findUnique({
            where: { transactionId: request.transactionId }
          });
          if (existing) {
            if (existing.payloadHash !== payloadHash) {
              throw new ConflictException(
                "Diese Transaktions-ID wurde bereits mit anderen Daten verwendet."
              );
            }
            return parseConfirmation(existing.confirmation);
          }

          const current =
            (await database.operationalState.findUnique({
              where: { id: OPERATIONAL_STATE_ID }
            })) ??
            (await database.operationalState.create({
              data: {
                id: OPERATIONAL_STATE_ID,
                version: 1,
                state: asJson(createDefaultOperationalState())
              }
            }));
          const currentState = current.state as unknown as AppState;
          let nextState: AppState;

          try {
            nextState = applyCriticalOperation(currentState, request.operation);
          } catch (error) {
            if (error instanceof CriticalOperationConflictError) {
              throw new ConflictException(error.message);
            }
            throw error;
          }

          const nextVersion = current.version + 1;
          const savedAt = new Date();
          const serverId = randomUUID();
          const printJobIds: string[] = [];

          if (checkpointKinds.has(request.operation.kind)) {
            await database.undoCheckpoint.create({
              data: {
                kind: request.operation.kind,
                transactionId: request.transactionId,
                actorId: request.actorId,
                state: asJson(currentState),
                stateVersion: current.version
              }
            });
          }

          for (const [index, printJob] of (request.printJobs ?? []).entries()) {
            const requestHash = hashPayload(printJob.request);
            const id = printJob.transactionId || `${request.transactionId}-print-${index + 1}`;
            const persisted = await database.printJob.upsert({
              where: {
                transactionId_requestHash: {
                  transactionId: request.transactionId,
                  requestHash
                }
              },
              create: {
                id,
                transactionId: request.transactionId,
                requestHash,
                request: asJson(printJob.request)
              },
              update: {}
            });
            printJobIds.push(persisted.id);
          }

          await database.operationalState.update({
            where: { id: OPERATIONAL_STATE_ID },
            data: {
              version: nextVersion,
              state: asJson(nextState)
            }
          });

          const confirmation: CriticalTransactionConfirmation = {
            success: true,
            transactionId: request.transactionId,
            serverId,
            savedAt: savedAt.toISOString(),
            status: "confirmed",
            stateVersion: nextVersion,
            state: nextState,
            result: {
              kind: request.operation.kind,
              patchCount: request.operation.patches.length,
              printJobIds
            }
          };

          await database.transactionRecord.create({
            data: {
              id: serverId,
              transactionId: request.transactionId,
              deviceId: request.deviceId,
              actorId: request.actorId,
              kind: request.operation.kind,
              payloadHash,
              operation: asJson(request.operation),
              confirmation: asJson(confirmation),
              stateVersion: nextVersion,
              savedAt
            }
          });

          return confirmation;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 15000
        }
      );

      await this.prisma.transmissionAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "confirmed",
          completedAt: new Date(),
          response: asJson({
            success: confirmation.success,
            transactionId: confirmation.transactionId,
            serverId: confirmation.serverId,
            savedAt: confirmation.savedAt,
            stateVersion: confirmation.stateVersion
          })
        }
      });

      this.printQueue.schedule();
      return confirmation;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unbekannter Übertragungsfehler.";
      await this.prisma.transmissionAttempt
        .update({
          where: { id: attempt.id },
          data: {
            status: error instanceof ConflictException ? "conflict" : "failed",
            completedAt: new Date(),
            error: message
          }
        })
        .catch(() => undefined);

      if (error instanceof ConflictException) {
        throw error;
      }
      throw new ServiceUnavailableException(
        "Die Transaktion konnte nicht sicher in der Datenbank gespeichert werden."
      );
    }
  }

  async getConfirmation(transactionId: string) {
    const record = await this.prisma.transactionRecord.findUnique({
      where: { transactionId }
    });
    return record ? parseConfirmation(record.confirmation) : null;
  }
}
