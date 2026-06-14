import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  appendValidatedSelfOrderLines,
  calculateSessionTotal,
  createDefaultOperationalState,
  createSelfOrderCourseTickets,
  normalizeOperationalState,
  resolveNextPickupNumber,
  resolveNextTableNumber,
  resolveSelfOrderCustomerStatus,
  SelfOrderValidationError,
  validateSelfOrderLines,
  type AppNotification,
  type AppState,
  type OrderSession,
  type SelfOrderLineInput,
  type SelfOrderLocation,
  type TableLayout
} from "@kiju/domain";

import { PrismaService } from "../prisma/prisma.service";
import { PrintQueueService } from "../print/print-queue.service";

const OPERATIONAL_STATE_ID = "operational-state";
const MAX_NAME_LENGTH = 80;
const PAYMENT_CALL_COOLDOWN_MS = 2 * 60 * 1000;
const asJson = (value: unknown) => value as Prisma.InputJsonValue;

type CreateOrderInput = {
  customerName: string;
  guestCount: number;
  idempotencyKey: string;
  lines: SelfOrderLineInput[];
};

type AppendOrderInput = {
  idempotencyKey: string;
  lines: SelfOrderLineInput[];
};

type PaymentCallInput = {
  idempotencyKey: string;
};

type StoredPublicConfirmation = {
  payloadHash: string;
  response: unknown;
};

const hashValue = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

const safeTokenMatch = (token: string, expectedHash: string) => {
  const actual = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

const createId = (prefix: string) => `${prefix}-${randomUUID()}`;

const normalizeIdempotencyKey = (value: unknown) => {
  const key = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(key)) {
    throw new BadRequestException("Die Bestellanfrage besitzt keine gültige Vorgangs-ID.");
  }
  return key;
};

const normalizeCustomerName = (value: unknown) => {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > MAX_NAME_LENGTH) {
    throw new BadRequestException("Der Name muss zwischen 2 und 80 Zeichen lang sein.");
  }
  return name;
};

const normalizeGuestCount = (value: unknown) => {
  const guestCount = Math.round(Number(value));
  if (!Number.isFinite(guestCount) || guestCount < 1 || guestCount > 20) {
    throw new BadRequestException("Die Personenzahl muss zwischen 1 und 20 liegen.");
  }
  return guestCount;
};

const normalizeLines = (value: unknown): SelfOrderLineInput[] => {
  if (!Array.isArray(value)) {
    throw new BadRequestException("Die Bestellpositionen fehlen.");
  }
  return value as SelfOrderLineInput[];
};

const publicProduct = (product: AppState["products"][number]) => ({
  id: product.id,
  name: product.name,
  category: product.category,
  drinkSubcategory: product.drinkSubcategory,
  description: product.description,
  priceCents: product.priceCents,
  taxRate: product.taxRate,
  allergens: product.allergens,
  modifierGroups: product.modifierGroups
});

@Injectable()
export class SelfOrderService {
  private readonly rateLimits = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly printQueue: PrintQueueService
  ) {}

  assertRateLimit(scope: string, clientId: string, maximum: number) {
    const key = `${scope}:${clientId || "unknown"}`;
    const now = Date.now();
    const attempts = (this.rateLimits.get(key) ?? []).filter(
      (timestamp) => now - timestamp < 60_000
    );
    if (attempts.length >= maximum) {
      throw new ServiceUnavailableException(
        "Zu viele Anfragen. Bitte warte kurz und versuche es erneut."
      );
    }
    attempts.push(now);
    this.rateLimits.set(key, attempts);
  }

  async getCatalog(accessKey: string) {
    const state = await this.getState();
    const location = this.requireActiveLocation(state, accessKey);

    return {
      location: {
        id: location.id,
        name: location.name
      },
      products: state.products.map(publicProduct)
    };
  }

  async createOrder(accessKey: string, rawInput: unknown, clientId: string) {
    const inputObject =
      rawInput && typeof rawInput === "object"
        ? (rawInput as Record<string, unknown>)
        : {};
    const input: CreateOrderInput = {
      customerName: normalizeCustomerName(inputObject["customerName"]),
      guestCount: normalizeGuestCount(inputObject["guestCount"]),
      idempotencyKey: normalizeIdempotencyKey(inputObject["idempotencyKey"]),
      lines: normalizeLines(inputObject["lines"])
    };

    const transactionId = `self-order-create:${input.idempotencyKey}`;
    const payloadHash = hashValue({ accessKey, input });
    const response = await this.withIdempotentMutation(
      transactionId,
      payloadHash,
      clientId,
      "self-order.create",
      async (state, database) => {
        const location = this.requireActiveLocation(state, accessKey);
        let validatedLines;
        try {
          validatedLines = validateSelfOrderLines(state.products, input.lines);
        } catch (error) {
          if (error instanceof SelfOrderValidationError) {
            throw new BadRequestException(error.message);
          }
          throw error;
        }

        const waiter =
          state.users.find((user) => user.role === "waiter" && user.active) ??
          state.users.find((user) => user.role === "waiter");
        if (!waiter) {
          throw new ServiceUnavailableException(
            "Die Selbstbestellung ist aktuell nicht verfügbar."
          );
        }

        const createdAt = new Date().toISOString();
        const tableNumber = resolveNextTableNumber(state.tables);
        const pickupNumber = resolveNextPickupNumber(state.tables);
        const tableId = `table-${tableNumber}`;
        const tableName = `Zum Abholen ${pickupNumber}`;
        const accessToken = randomBytes(32).toString("base64url");
        const sessionId = createId(`session-${tableId}`);
        const table: TableLayout = {
          id: tableId,
          name: tableName,
          seatCount: 1,
          active: true,
          plannedOnly: false,
          x: 45,
          y: 49,
          width: 16,
          height: 13,
          note: `Selbstbestellung · ${location.name} · ${input.customerName} · ${input.guestCount} Personen`,
          seats: [
            {
              id: `${tableId}-seat-1`,
              label: "P1",
              visible: true
            }
          ]
        };
        const session: OrderSession = {
          id: sessionId,
          tableId,
          waiterId: waiter.id,
          serviceUserIds: [waiter.id],
          status: "serving",
          items: [],
          skippedCourses: [],
          courseTickets: createSelfOrderCourseTickets(),
          kitchenTicketBatches: [],
          barTicketBatches: [],
          payments: [],
          cancellations: [],
          partyGroups: [],
          receipt: {},
          selfOrder: {
            customerName: input.customerName,
            guestCount: input.guestCount,
            locationId: location.id,
            locationName: location.name,
            pickupNumber,
            accessTokenHash: hashToken(accessToken),
            createdAt,
            paymentCallStatus: "idle"
          }
        };

        appendValidatedSelfOrderLines({
          session,
          lines: validatedLines,
          createdAt,
          bedienung: "Selbstbestellung",
          createId
        });

        state.tables.push(table);
        state.sessions.unshift(session);
        state.notifications.unshift(
          this.createNotification({
            title: "Selbstbestellung eingegangen",
            body: `${tableName}: ${input.customerName}, ${input.guestCount} Personen, Ort ${location.name}.`,
            tone: "info",
            tableId,
            targetRoles: ["waiter"]
          })
        );

        const printRequest = {
          type: "pickup-ticket" as const,
          tableId,
          tableLabel: tableName,
          pickupNumber,
          bedienung: "Selbstbestellung",
          customerName: input.customerName,
          guestCount: input.guestCount,
          locationName: location.name,
          createdAt
        };
        const requestHash = hashValue(printRequest);
        await database.printJob.create({
          data: {
            id: createId("print-job"),
            transactionId,
            requestHash,
            request: asJson(printRequest)
          }
        });

        return {
          orderId: sessionId,
          accessToken,
          pickupNumber,
          tableLabel: tableName,
          customerName: input.customerName,
          guestCount: input.guestCount,
          locationName: location.name,
          status: resolveSelfOrderCustomerStatus(session, state.products),
          paymentCallStatus: session.selfOrder?.paymentCallStatus ?? "idle",
          totalCents: calculateSessionTotal(session, state.products)
        };
      }
    );

    this.printQueue.schedule();
    return response;
  }

  async appendOrder(
    orderId: string,
    token: string,
    rawInput: unknown,
    clientId: string
  ) {
    const inputObject =
      rawInput && typeof rawInput === "object"
        ? (rawInput as Record<string, unknown>)
        : {};
    const input: AppendOrderInput = {
      idempotencyKey: normalizeIdempotencyKey(inputObject["idempotencyKey"]),
      lines: normalizeLines(inputObject["lines"])
    };
    const transactionId = `self-order-append:${orderId}:${input.idempotencyKey}`;
    const payloadHash = hashValue({ orderId, input });

    return this.withIdempotentMutation(
      transactionId,
      payloadHash,
      clientId,
      "self-order.append",
      async (state) => {
        const session = this.requireAuthorizedSession(state, orderId, token);
        if (session.status === "closed") {
          throw new ConflictException("Diese Bestellung ist bereits abgeschlossen.");
        }

        let validatedLines;
        try {
          validatedLines = validateSelfOrderLines(state.products, input.lines);
        } catch (error) {
          if (error instanceof SelfOrderValidationError) {
            throw new BadRequestException(error.message);
          }
          throw error;
        }

        const createdAt = new Date().toISOString();
        appendValidatedSelfOrderLines({
          session,
          lines: validatedLines,
          createdAt,
          bedienung: "Selbstbestellung",
          createId
        });
        const tableName =
          state.tables.find((table) => table.id === session.tableId)?.name ??
          `Zum Abholen ${session.selfOrder?.pickupNumber ?? ""}`.trim();
        state.notifications.unshift(
          this.createNotification({
            title: "Nachbestellung eingegangen",
            body: `${tableName}: ${session.selfOrder?.customerName ?? "Gast"} hat weitere Artikel bestellt.`,
            tone: "info",
            tableId: session.tableId,
            targetRoles: ["waiter"]
          })
        );

        return this.buildStatusResponse(state, session);
      }
    );
  }

  async callService(
    orderId: string,
    token: string,
    rawInput: unknown,
    clientId: string
  ) {
    const inputObject =
      rawInput && typeof rawInput === "object"
        ? (rawInput as Record<string, unknown>)
        : {};
    const input: PaymentCallInput = {
      idempotencyKey: normalizeIdempotencyKey(inputObject["idempotencyKey"])
    };
    const transactionId = `self-order-payment:${orderId}:${input.idempotencyKey}`;
    const payloadHash = hashValue({ orderId, input });

    return this.withIdempotentMutation(
      transactionId,
      payloadHash,
      clientId,
      "self-order.payment-call",
      async (state) => {
        const session = this.requireAuthorizedSession(state, orderId, token);
        if (session.status === "closed") {
          throw new ConflictException("Diese Bestellung ist bereits abgeschlossen.");
        }
        const selfOrder = session.selfOrder;
        if (!selfOrder) {
          throw new NotFoundException("Selbstbestellung wurde nicht gefunden.");
        }

        const previousRequest = selfOrder.paymentRequestedAt
          ? Date.parse(selfOrder.paymentRequestedAt)
          : 0;
        const withinCooldown =
          selfOrder.paymentCallStatus === "requested" &&
          Number.isFinite(previousRequest) &&
          Date.now() - previousRequest < PAYMENT_CALL_COOLDOWN_MS;
        if (withinCooldown || selfOrder.paymentCallStatus === "accepted") {
          return this.buildStatusResponse(state, session);
        }

        const requestedAt = new Date().toISOString();
        selfOrder.paymentCallStatus = "requested";
        selfOrder.paymentRequestedAt = requestedAt;
        selfOrder.paymentAcceptedAt = undefined;
        const tableName =
          state.tables.find((table) => table.id === session.tableId)?.name ??
          `Zum Abholen ${selfOrder.pickupNumber}`;
        state.notifications = state.notifications.filter(
          (notification) =>
            notification.tableId !== session.tableId ||
            notification.kind !== "self-order-payment" ||
            notification.read
        );
        state.notifications.unshift(
          this.createNotification({
            kind: "self-order-payment",
            title: "Kunde möchte bezahlen",
            body: `${tableName}: ${selfOrder.customerName} wartet in ${selfOrder.locationName} auf den Service.`,
            tone: "alert",
            tableId: session.tableId,
            targetRoles: ["waiter"],
            targetUserIds: session.serviceUserIds
          })
        );

        return this.buildStatusResponse(state, session);
      }
    );
  }

  async getOrderStatus(orderId: string, token: string) {
    const state = await this.getState();
    const session = this.requireAuthorizedSession(state, orderId, token);
    return this.buildStatusResponse(state, session);
  }

  private async getState() {
    const stored =
      (await this.prisma.operationalState.findUnique({
        where: { id: OPERATIONAL_STATE_ID }
      })) ??
      (await this.prisma.operationalState.create({
        data: {
          id: OPERATIONAL_STATE_ID,
          version: 1,
          state: asJson(createDefaultOperationalState())
        }
      }));
    return normalizeOperationalState(stored.state as unknown as AppState);
  }

  private requireActiveLocation(state: AppState, accessKey: string): SelfOrderLocation {
    const location = state.selfOrderLocations.find(
      (entry) => entry.accessKey === accessKey && entry.active
    );
    if (!location) {
      throw new NotFoundException("Dieser Bestell-QR-Code ist nicht aktiv.");
    }
    return location;
  }

  private requireAuthorizedSession(
    state: AppState,
    orderId: string,
    token: string
  ) {
    const session = state.sessions.find((entry) => entry.id === orderId);
    if (
      !session?.selfOrder ||
      !token ||
      !safeTokenMatch(token, session.selfOrder.accessTokenHash)
    ) {
      throw new UnauthorizedException("Der private Bestellzugang ist ungültig.");
    }
    return session;
  }

  private buildStatusResponse(state: AppState, session: OrderSession) {
    const selfOrder = session.selfOrder;
    if (!selfOrder) {
      throw new NotFoundException("Selbstbestellung wurde nicht gefunden.");
    }
    const productsById = new Map(state.products.map((product) => [product.id, product]));

    return {
      orderId: session.id,
      pickupNumber: selfOrder.pickupNumber,
      customerName: selfOrder.customerName,
      guestCount: selfOrder.guestCount,
      locationName: selfOrder.locationName,
      status: resolveSelfOrderCustomerStatus(session, state.products),
      paymentCallStatus: selfOrder.paymentCallStatus,
      paymentRequestedAt: selfOrder.paymentRequestedAt,
      paymentAcceptedAt: selfOrder.paymentAcceptedAt,
      closed: session.status === "closed",
      totalCents: calculateSessionTotal(session, state.products),
      items: session.items
        .filter((item) => !item.canceledAt)
        .map((item) => ({
          id: item.id,
          productId: item.productId,
          name: productsById.get(item.productId)?.name ?? "Unbekannter Artikel",
          quantity: item.quantity,
          note: item.note,
          modifiers: item.modifiers,
          sentAt: item.sentAt,
          preparedAt: item.preparedAt
        }))
    };
  }

  private createNotification(
    notification: Omit<AppNotification, "id" | "createdAt" | "read">
  ): AppNotification {
    return {
      id: createId("notification"),
      createdAt: new Date().toISOString(),
      read: false,
      ...notification
    };
  }

  private async withIdempotentMutation<TResult>(
    transactionId: string,
    payloadHash: string,
    clientId: string,
    kind: string,
    mutate: (
      state: AppState,
      database: Prisma.TransactionClient
    ) => Promise<TResult>
  ): Promise<TResult> {
    try {
      return await this.prisma.$transaction(
        async (database) => {
          const existing = await database.transactionRecord.findUnique({
            where: { transactionId }
          });
          if (existing) {
            const stored = existing.confirmation as unknown as StoredPublicConfirmation;
            if (stored.payloadHash !== payloadHash) {
              throw new ConflictException(
                "Diese Vorgangs-ID wurde bereits mit anderen Bestelldaten verwendet."
              );
            }
            return stored.response as TResult;
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
          const state = normalizeOperationalState(current.state as unknown as AppState);
          const response = await mutate(state, database);
          const savedAt = new Date();
          const nextVersion = current.version + 1;

          await database.operationalState.update({
            where: { id: OPERATIONAL_STATE_ID },
            data: {
              version: nextVersion,
              state: asJson(state)
            }
          });
          await database.transactionRecord.create({
            data: {
              id: randomUUID(),
              transactionId,
              deviceId: `self-order:${clientId || "unknown"}`.slice(0, 190),
              kind,
              payloadHash,
              operation: asJson({ type: kind }),
              confirmation: asJson({
                payloadHash,
                response
              }),
              stateVersion: nextVersion,
              savedAt
            }
          });

          return response;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 15000
        }
      );
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof NotFoundException ||
        error instanceof UnauthorizedException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      throw new ServiceUnavailableException(
        "Die Bestellung konnte nicht sicher gespeichert werden."
      );
    }
  }
}
