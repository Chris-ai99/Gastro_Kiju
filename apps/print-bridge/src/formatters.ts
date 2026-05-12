import {
  calculateItemTotal,
  calculateLineItemsTotal,
  calculateOpenItemQuantity,
  calculateSessionBillableTotal,
  calculateSessionCanceledTotal,
  calculateSessionOpenTotal,
  calculateSessionPaidTotal,
  calculateSessionTotal,
  paymentLabels,
  type KitchenTicketBatch,
  type OrderItem,
  type OrderSession,
  type PaymentLineItem,
  type Product,
  type TableLayout,
  type ThermalPrintDocument,
  type ThermalPrintLine
} from "@kiju/domain";

const THERMAL_LINE_WIDTH = 42;
const RECEIPT_ARTICLE_WIDTH = 24;
const RECEIPT_QUANTITY_WIDTH = 4;
const RECEIPT_AMOUNT_WIDTH = 12;
const RECEIPT_SUMMARY_LABEL_WIDTH = 29;
const SEPARATOR = "-".repeat(THERMAL_LINE_WIDTH);
const STRONG_SEPARATOR = "=".repeat(THERMAL_LINE_WIDTH);
const DEFAULT_CANCELLATION_LABEL = "Rechnungsstorno";

export type PipaReceiptPosition = {
  name: string;
  menge: number;
  betrag: number;
};

export type PipaReceiptInput = {
  bonNummer: string;
  datum: string;
  bedienung?: string;
  positionen: PipaReceiptPosition[];
  gesamt: number;
};

export type ReceiptDocumentMode = "full" | "table" | "partial";

export type ReceiptDocumentSection = {
  sectionLabel?: string;
  positionen: PipaReceiptPosition[];
};

export type ReceiptDocumentInput = {
  mode: ReceiptDocumentMode;
  bonNummer: string;
  datum: string;
  tableLabel?: string;
  bedienung?: string;
  sections: ReceiptDocumentSection[];
  gesamt: number;
};

export type BuildReceiptDocumentInput = {
  session: OrderSession;
  products: Product[];
  openedAt: string;
  bedienung?: string;
  tableLabel?: string;
};

export type BuildReceiptDocumentFromSessionsInput = {
  sessions: OrderSession[];
  products: Product[];
  scope: ReceiptDocumentMode;
  selectedLineItems?: PaymentLineItem[];
  tableLabelsById?: Record<string, string>;
  openedAt: string;
  bedienung?: string;
};

export type BuildPickupTicketDocumentInput = {
  tableLabel: string;
  pickupNumber: number;
  createdAt?: string;
};

type BuildKitchenTicketDocumentInput = {
  batch: KitchenTicketBatch;
  session: OrderSession;
  table: TableLayout;
  products: Product[];
  printedAt?: string;
};

type BuildKitchenPlateLabelDocumentInput = BuildKitchenTicketDocumentInput & {
  itemId: OrderItem["id"];
  unitIndex: number;
  completedAt?: string;
};

export type BuildBookingStatisticsDocumentInput = {
  sessions: OrderSession[];
  tables: TableLayout[];
  products: Product[];
  printedAt?: string;
};

type GroupedItem = {
  quantity: number;
  productName: string;
  note?: string;
};

const courseLabels: Record<KitchenTicketBatch["course"], string> = {
  drinks: "Getränke",
  starter: "Vorspeise",
  main: "Hauptspeise",
  dessert: "Nachtisch"
};

const receiptModeLabels: Record<ReceiptDocumentMode, string> = {
  full: "GESAMTBON",
  table: "TISCH-BON",
  partial: "TEIL-BON"
};

const receiptDocumentTitles: Record<ReceiptDocumentMode, string> = {
  full: "Gesamtbon",
  table: "Tisch-Bon",
  partial: "Teil-Bon"
};

const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();

const sanitizeReceiptValue = (value: string) => {
  const normalized = normalizeText(value);
  return normalized || "-";
};

const fitLeft = (value: string, width: number) => {
  const normalized = sanitizeReceiptValue(value);
  return normalized.length > width ? normalized.slice(0, width) : normalized.padEnd(width, " ");
};

const fitRight = (value: string, width: number) => {
  const normalized = sanitizeReceiptValue(value);
  return normalized.length > width ? normalized.slice(-width) : normalized.padStart(width, " ");
};

const wrapText = (value: string, width: number) => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return [""];
  }

  const words = normalized.split(" ").filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (let word of words) {
    while (word.length > width) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }

      lines.push(word.slice(0, width));
      word = word.slice(width);
    }

    if (!word) continue;

    if (!currentLine) {
      currentLine = word;
      continue;
    }

    if (currentLine.length + 1 + word.length <= width) {
      currentLine = `${currentLine} ${word}`;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [""];
};

const centerLine = (value: string) => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }

  return normalized.length > THERMAL_LINE_WIDTH ? normalized.slice(0, THERMAL_LINE_WIDTH) : normalized;
};

const formatEuroCents = (valueCents: number) => {
  const normalizedCents =
    Number.isFinite(valueCents) && !Number.isNaN(valueCents) ? Math.round(valueCents) : 0;
  const sign = normalizedCents < 0 ? "-" : "";
  const absoluteCents = Math.abs(normalizedCents);
  const euros = Math.floor(absoluteCents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const cents = String(absoluteCents % 100).padStart(2, "0");

  return `${sign}${euros},${cents} €`;
};

const formatQuantity = (value: number) => {
  const normalized = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return `${normalized}x`;
};

const formatReceiptNumber = (source: string) => {
  let hash = 0;

  for (const character of source) {
    hash = (hash * 33 + character.charCodeAt(0)) % 1000000;
  }

  return String(hash).padStart(6, "0");
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return sanitizeReceiptValue(value);
  }

  const parts = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(date);

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${getPart("day")}.${getPart("month")}.${getPart("year")} ${getPart("hour")}:${getPart("minute")}`;
};

const resolveProductLabel = (products: Product[], productId: string) =>
  products.find((entry) => entry.id === productId)?.name ?? "Unbekannter Artikel";

const resolveSeatLabel = (table: TableLayout, item: OrderItem) => {
  const target = item.target;
  if (target.type === "table") {
    return "Tisch";
  }

  return table.seats.find((seat) => seat.id === target.seatId)?.label ?? "Sitzplatz";
};

const resolveModifierLabels = (item: OrderItem, product: Product | undefined) => {
  if (!product || item.modifiers.length === 0) {
    return [];
  }

  return item.modifiers.flatMap((selection) => {
    const group = product.modifierGroups.find((entry) => entry.id === selection.groupId);
    if (!group) {
      return [];
    }

    const optionNames = selection.optionIds
      .map((optionId) => group.options.find((option) => option.id === optionId)?.name)
      .filter((optionName): optionName is string => Boolean(optionName));

    if (optionNames.length === 0) {
      return [];
    }

    return [`${group.name}: ${optionNames.join(", ")}`];
  });
};

const joinItemDetails = (parts: Array<string | undefined>) =>
  parts.map((part) => normalizeText(part ?? "")).filter(Boolean).join(" - ");

const calculateBookedItemTotal = (item: OrderItem, products: Product[]) => {
  const product = products.find((entry) => entry.id === item.productId);
  if (!product) return 0;

  const modifierTotal = item.modifiers.reduce((sum, modifierSelection) => {
    const modifierGroup = product.modifierGroups.find(
      (group) => group.id === modifierSelection.groupId
    );
    if (!modifierGroup) return sum;

    return (
      sum +
      modifierSelection.optionIds.reduce((optionSum, optionId) => {
        const option = modifierGroup.options.find((entry) => entry.id === optionId);
        return optionSum + (option?.priceDeltaCents ?? 0);
      }, 0)
    );
  }, 0);

  return (product.priceCents + modifierTotal) * item.quantity;
};

const buildSessionPositionName = (item: OrderItem, products: Product[]) => {
  const product = products.find((entry) => entry.id === item.productId);
  const modifierLabel = resolveModifierLabels(item, product).join(", ");
  const noteLabel = item.note?.trim() ? `Hinweis: ${item.note.trim()}` : undefined;

  return joinItemDetails([
    resolveProductLabel(products, item.productId),
    modifierLabel || undefined,
    noteLabel
  ]);
};

const buildCancellationPositionName = (
  item: OrderItem,
  products: Product[],
  label: string | undefined
) => {
  const trimmedLabel = normalizeText(label ?? "");
  const itemName = buildSessionPositionName(item, products);

  return trimmedLabel && trimmedLabel !== DEFAULT_CANCELLATION_LABEL
    ? `STORNO ${itemName} - ${trimmedLabel}`
    : `STORNO ${itemName}`;
};

const buildReceiptInfoLines = (input: ReceiptDocumentInput): ThermalPrintLine[] => {
  const infoLabelWidth = 10;
  const lines: ThermalPrintLine[] = [
    { text: `${fitLeft("BON NR.", infoLabelWidth)} ${sanitizeReceiptValue(input.bonNummer)}` },
    { text: `${fitLeft("DATUM", infoLabelWidth)} ${sanitizeReceiptValue(input.datum)}` }
  ];

  if (normalizeText(input.tableLabel ?? "")) {
    lines.push({
      text: `${fitLeft("TISCH", infoLabelWidth)} ${sanitizeReceiptValue(input.tableLabel ?? "")}`
    });
  }

  if (normalizeText(input.bedienung ?? "")) {
    lines.push({
      text: `${fitLeft("BEDIENUNG", infoLabelWidth)} ${sanitizeReceiptValue(input.bedienung ?? "")}`
    });
  }

  return lines;
};

const buildPipaPositionLines = (position: PipaReceiptPosition): ThermalPrintLine[] => {
  const articleName = sanitizeReceiptValue(position.name);
  const quantity = fitRight(formatQuantity(position.menge), RECEIPT_QUANTITY_WIDTH);
  const amount = fitRight(formatEuroCents(position.betrag), RECEIPT_AMOUNT_WIDTH);
  const nameLines = wrapText(articleName, RECEIPT_ARTICLE_WIDTH);

  return nameLines.map((line, index) => ({
    text:
      index === 0
        ? `${fitLeft(line, RECEIPT_ARTICLE_WIDTH)} ${quantity} ${amount}`
        : fitLeft(line, RECEIPT_ARTICLE_WIDTH)
  }));
};

const normalizePipaPositions = (positions: PipaReceiptPosition[]) =>
  positions.map((position) => ({
    name: sanitizeReceiptValue(position.name),
    menge: Number.isFinite(position.menge) ? Math.max(0, Math.floor(position.menge)) : 0,
    betrag:
      Number.isFinite(position.betrag) && !Number.isNaN(position.betrag)
        ? Math.round(position.betrag)
        : 0
  }));

const buildSectionLines = (section: ReceiptDocumentSection, sectionIndex: number) => {
  const lines: ThermalPrintLine[] = [];
  const normalizedLabel = normalizeText(section.sectionLabel ?? "");

  if (sectionIndex > 0) {
    lines.push({ text: SEPARATOR });
  }

  if (normalizedLabel) {
    lines.push({
      text: sanitizeReceiptValue(normalizedLabel).slice(0, THERMAL_LINE_WIDTH),
      emphasis: true
    });
  }

  const normalizedPositions = normalizePipaPositions(section.positionen).filter(
    (position) => position.menge > 0
  );

  if (normalizedPositions.length === 0) {
    lines.push({ text: "Keine Positionen vorhanden." });
    return lines;
  }

  return [...lines, ...normalizedPositions.flatMap((position) => buildPipaPositionLines(position))];
};

const buildReceiptDocumentFromInput = (input: ReceiptDocumentInput): ThermalPrintDocument => {
  const normalizedSections =
    input.sections.length > 0 ? input.sections : [{ positionen: [], sectionLabel: undefined }];
  const sectionLines = normalizedSections.flatMap((section, index) => buildSectionLines(section, index));

  return {
    title: receiptDocumentTitles[input.mode],
    width: THERMAL_LINE_WIDTH,
    lines: [
      { text: centerLine("PiPa Bistro"), emphasis: true, align: "center" },
      { text: centerLine("Pizza & Pasta"), align: "center" },
      { text: SEPARATOR },
      { text: centerLine("KASSENBON"), emphasis: true, align: "center" },
      { text: centerLine(receiptModeLabels[input.mode]), align: "center" },
      { text: SEPARATOR },
      ...buildReceiptInfoLines(input),
      { text: SEPARATOR },
      {
        text: `${fitLeft("ARTIKEL", RECEIPT_ARTICLE_WIDTH)} ${fitLeft("MNG", RECEIPT_QUANTITY_WIDTH)} ${fitRight("BETRAG", RECEIPT_AMOUNT_WIDTH)}`,
        emphasis: true
      },
      { text: SEPARATOR },
      ...sectionLines,
      { text: STRONG_SEPARATOR },
      {
        text: `${fitLeft("SUMME", RECEIPT_SUMMARY_LABEL_WIDTH)} ${fitRight(
          formatEuroCents(input.gesamt),
          RECEIPT_AMOUNT_WIDTH
        )}`,
        emphasis: true
      },
      { text: STRONG_SEPARATOR },
      { text: "" },
      { text: centerLine("Vielen Dank für deinen Besuch!"), align: "center" },
      {
        text: centerLine("Dieser Beleg dient nur der Orientierung"),
        align: "center"
      },
      {
        text: centerLine("und ist kein offizielles Dokument."),
        align: "center"
      },
      { text: "" },
      { text: centerLine("Zionsgemeinde Haus Amos"), align: "center" },
      { text: centerLine("Paracelsusweg 8, 33689 Bielefeld"), align: "center" }
    ]
  };
};

export const buildPipaReceiptDocument = (input: PipaReceiptInput): ThermalPrintDocument =>
  buildReceiptDocumentFromInput({
    mode: "table",
    bonNummer: input.bonNummer,
    datum: input.datum,
    bedienung: input.bedienung,
    sections: [{ positionen: input.positionen }],
    gesamt: input.gesamt
  });

export const buildPipaReceiptText = (input: PipaReceiptInput) =>
  buildPipaReceiptDocument(input).lines.map((line) => line.text).join("\n");

const buildFullSessionPositions = (session: OrderSession, products: Product[]) => {
  return session.items.map((item) => ({
    name: buildSessionPositionName(item, products),
    menge: item.quantity,
    betrag: calculateItemTotal(item, products)
  }));
};

const aggregateSelectedLineItems = (lineItems: PaymentLineItem[] | undefined) => {
  const quantitiesByItemId = new Map<string, number>();

  for (const lineItem of lineItems ?? []) {
    const quantity = Number.isFinite(lineItem.quantity) ? Math.max(0, Math.floor(lineItem.quantity)) : 0;
    if (quantity <= 0) continue;

    quantitiesByItemId.set(lineItem.itemId, (quantitiesByItemId.get(lineItem.itemId) ?? 0) + quantity);
  }

  return quantitiesByItemId;
};

const buildPartialSessionPositions = (
  session: OrderSession,
  products: Product[],
  selectedLineItems: PaymentLineItem[] | undefined
) => {
  const quantitiesByItemId = aggregateSelectedLineItems(selectedLineItems);

  return session.items.flatMap((item) => {
    const selectedQuantity = quantitiesByItemId.get(item.id) ?? 0;
    const quantity = Math.min(calculateOpenItemQuantity(session, item), selectedQuantity);

    if (quantity <= 0 || item.quantity <= 0) {
      return [];
    }

    const unitAmount = Math.round(calculateItemTotal(item, products) / item.quantity);

    return [
      {
        name: buildSessionPositionName(item, products),
        menge: quantity,
        betrag: unitAmount * quantity
      }
    ];
  });
};

const resolveTableLabel = (
  tableLabelsById: Record<string, string> | undefined,
  session: OrderSession
) => tableLabelsById?.[session.tableId] ?? session.tableId.replace("table-", "Tisch ");

const buildReceiptNumberSource = (
  scope: ReceiptDocumentMode,
  sessions: OrderSession[],
  selectedLineItems: PaymentLineItem[] | undefined
) => {
  const sessionIds = [...sessions.map((session) => session.id)].sort();
  const selectedItems = [...aggregateSelectedLineItems(selectedLineItems).entries()]
    .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
    .map(([itemId, quantity]) => `${itemId}:${quantity}`);

  return [scope, ...sessionIds, ...selectedItems].join("|");
};

export const buildReceiptDocumentFromSessions = ({
  sessions,
  products,
  scope,
  selectedLineItems,
  tableLabelsById,
  openedAt,
  bedienung
}: BuildReceiptDocumentFromSessionsInput): ReceiptDocumentInput => {
  const activeSessions = sessions.filter((session) => session.items.length > 0);
  const showSectionLabels = activeSessions.length > 1;

  const sections = activeSessions
    .map((session) => {
      const positionen =
        scope === "partial"
          ? buildPartialSessionPositions(session, products, selectedLineItems)
          : buildFullSessionPositions(session, products);

      return {
        sectionLabel: showSectionLabels ? resolveTableLabel(tableLabelsById, session) : undefined,
        positionen
      };
    })
    .filter((section) => section.positionen.length > 0);

  const gesamt =
    scope === "partial"
      ? activeSessions.reduce(
          (sum, session) => sum + calculateLineItemsTotal(session, products, selectedLineItems ?? []),
          0
        )
      : activeSessions.reduce(
          (sum, session) => sum + calculateSessionTotal(session, products),
          0
        );
  const singleSession = activeSessions.length === 1 ? activeSessions[0] : undefined;

  return {
    mode: scope,
    bonNummer: formatReceiptNumber(buildReceiptNumberSource(scope, activeSessions, selectedLineItems)),
    datum: formatDateTime(openedAt),
    tableLabel: singleSession ? resolveTableLabel(tableLabelsById, singleSession) : undefined,
    bedienung: normalizeText(bedienung ?? "") || undefined,
    sections,
    gesamt
  };
};

const isReceiptDocumentInput = (
  input: ReceiptDocumentInput | BuildReceiptDocumentInput
): input is ReceiptDocumentInput => "sections" in input;

export function buildReceiptPrintDocument(input: ReceiptDocumentInput): ThermalPrintDocument;
export function buildReceiptPrintDocument(input: BuildReceiptDocumentInput): ThermalPrintDocument;
export function buildReceiptPrintDocument(
  input: ReceiptDocumentInput | BuildReceiptDocumentInput
): ThermalPrintDocument {
  if (isReceiptDocumentInput(input)) {
    return buildReceiptDocumentFromInput(input);
  }

  return buildReceiptDocumentFromInput(
    buildReceiptDocumentFromSessions({
      sessions: [input.session],
      products: input.products,
      scope: "table",
      tableLabelsById: input.tableLabel ? { [input.session.tableId]: input.tableLabel } : undefined,
      openedAt: input.openedAt,
      bedienung: input.bedienung
    })
  );
}

export const buildPickupTicketPrintDocument = ({
  tableLabel,
  pickupNumber,
  createdAt = new Date().toISOString()
}: BuildPickupTicketDocumentInput): ThermalPrintDocument => {
  const safePickupNumber = Math.max(
    1,
    Math.floor(Number.isFinite(pickupNumber) ? pickupNumber : 1)
  );
  const safeTableLabel = normalizeText(tableLabel) || `Zum Abholen ${safePickupNumber}`;

  return {
    title: "Abholbon",
    width: THERMAL_LINE_WIDTH,
    lines: [
      { text: centerLine("ABHOLBON"), emphasis: true, align: "center" },
      { text: centerLine("Zum Abholen"), align: "center" },
      { text: STRONG_SEPARATOR },
      { text: centerLine(`NUMMER ${safePickupNumber}`), emphasis: true, align: "center" },
      { text: STRONG_SEPARATOR },
      { text: `BON   : ${safeTableLabel}` },
      { text: `ZEIT  : ${formatDateTime(createdAt)}` },
      { text: SEPARATOR },
      { text: centerLine("Für Abholung bereitlegen"), align: "center" }
    ]
  };
};

const groupKitchenItems = (items: OrderItem[], products: Product[]) => {
  const groupedItems = new Map<string, GroupedItem>();

  items.forEach((item) => {
    const key = [item.productId, item.note ?? ""].join("|");
    const current = groupedItems.get(key);

    if (current) {
      current.quantity += item.quantity;
      return;
    }

    groupedItems.set(key, {
      quantity: item.quantity,
      productName: resolveProductLabel(products, item.productId),
      note: item.note?.trim() || undefined
    });
  });

  return [...groupedItems.values()];
};

const buildKitchenItemLines = (
  items: OrderItem[],
  products: Product[],
  table: TableLayout
): ThermalPrintLine[] =>
  items.flatMap((item) => {
    const product = products.find((entry) => entry.id === item.productId);
    const modifierLabels = resolveModifierLabels(item, product);
    const detailLines = [
      `Platz: ${resolveSeatLabel(table, item)}`,
      ...modifierLabels,
      ...(item.note?.trim() ? [`Hinweis: ${item.note.trim()}`] : [])
    ].flatMap((line) => wrapText(line, THERMAL_LINE_WIDTH - 2).map((wrapped) => `  ${wrapped}`));

    return [
      ...wrapText(
        `${item.quantity}x ${product?.name ?? "Unbekannter Artikel"}`,
        THERMAL_LINE_WIDTH
      ).map((line, index) => ({
        text: line,
        emphasis: index === 0
      })),
      ...detailLines.map((text) => ({ text }))
    ];
  });

export const buildKitchenTicketPrintDocument = ({
  batch,
  session,
  table,
  products,
  printedAt = new Date().toISOString()
}: BuildKitchenTicketDocumentInput): ThermalPrintDocument => {
  const itemIds = new Set(batch.itemIds);
  const batchItems = session.items.filter((item) => itemIds.has(item.id));
  const groupedItems = groupKitchenItems(batchItems, products);
  const totalQuantity = groupedItems.reduce((sum, item) => sum + item.quantity, 0);
  const title =
    batch.sequence > 1
      ? `${courseLabels[batch.course]} · Nachbestellung ${batch.sequence}`
      : courseLabels[batch.course];

  return {
    title,
    width: THERMAL_LINE_WIDTH,
    lines: [
      { text: centerLine("KÜCHENBON"), emphasis: true, align: "center" },
      { text: centerLine(title), align: "center" },
      { text: SEPARATOR },
      { text: `TISCH : ${table.name}` },
      { text: `ZEIT  : ${formatDateTime(printedAt)}` },
      { text: `BED.  : ${sanitizeReceiptValue(batch.bedienung ?? "Service")}` },
      {
        text: `BON   : ${batch.sequence === 1 ? "Erstsendung" : `Nachbestellung ${batch.sequence}`}`
      },
      { text: `STATUS: ${batch.status === "countdown" ? "Wartezeit gesetzt" : "Direkt frei"}` },
      { text: `POSTEN: ${totalQuantity}` },
      { text: SEPARATOR },
      ...(batchItems.length > 0
        ? buildKitchenItemLines(batchItems, products, table)
        : [{ text: "Keine Positionen vorhanden." }]),
      { text: SEPARATOR },
      { text: centerLine("Guten Service!"), align: "center" }
    ]
  };
};

export const buildKitchenPlateLabelPrintDocument = ({
  batch,
  session,
  table,
  products,
  itemId,
  unitIndex,
  completedAt = new Date().toISOString()
}: BuildKitchenPlateLabelDocumentInput): ThermalPrintDocument => {
  const item = session.items.find((entry) => entry.id === itemId);
  const product = item ? products.find((entry) => entry.id === item.productId) : undefined;
  const productName = product?.name ?? "Unbekannter Artikel";
  const safeUnitIndex = Math.max(0, unitIndex);
  const portionLabel =
    item && item.quantity > 1 ? `Portion ${safeUnitIndex + 1} von ${item.quantity}` : "Einzelportion";
  const modifierLines =
    item?.modifiers && item.modifiers.length > 0
      ? resolveModifierLabels(item, product).flatMap((line) =>
          wrapText(`Extra: ${line}`, THERMAL_LINE_WIDTH).map((text) => ({ text }))
        )
      : [];
  const noteLines = item?.note?.trim()
    ? wrapText(`Hinweis: ${item.note.trim()}`, THERMAL_LINE_WIDTH).map((text) => ({ text }))
    : [];
  const courseLabel = courseLabels[batch.course];

  return {
    title: "Tellerbon",
    width: THERMAL_LINE_WIDTH,
    lines: [
      { text: centerLine("TELLERBON"), emphasis: true, align: "center" },
      { text: centerLine(courseLabel), align: "center" },
      { text: SEPARATOR },
      { text: `TISCH : ${table.name}`, emphasis: true },
      { text: `PLATZ : ${item ? resolveSeatLabel(table, item) : "Tisch"}` },
      { text: `ZEIT  : ${formatDateTime(completedAt)}` },
      { text: `BON   : ${batch.sequence === 1 ? "Erstsendung" : `Nachbestellung ${batch.sequence}`}` },
      { text: `PORT. : ${portionLabel}` },
      { text: SEPARATOR },
      { text: "GERICHT:", emphasis: true },
      ...wrapText(`1x ${productName}`, THERMAL_LINE_WIDTH).map((text, index) => ({
        text,
        emphasis: index === 0
      })),
      ...modifierLines,
      ...noteLines,
      { text: SEPARATOR },
      { text: centerLine("Zum Teller kleben"), align: "center" }
    ]
  };
};

const sessionStatusReportLabels: Record<OrderSession["status"], string> = {
  planned: "Geplant",
  idle: "Frei",
  serving: "Läuft",
  waiting: "Wartet",
  "ready-to-bill": "Abrechnungsbereit",
  closed: "Geschlossen"
};

const buildReportInfoLine = (label: string, value: string): ThermalPrintLine => ({
  text: `${fitLeft(label, 18)} ${fitRight(value, THERMAL_LINE_WIDTH - 19)}`
});

const buildReportSection = (title: string): ThermalPrintLine[] => [
  { text: SEPARATOR },
  { text: centerLine(title), emphasis: true, align: "center" },
  { text: SEPARATOR }
];

const resolveReportTableName = (tables: TableLayout[], tableId: string) =>
  tables.find((table) => table.id === tableId)?.name ?? tableId.replace("table-", "Tisch ");

const resolveReportTable = (tables: TableLayout[], tableId: string) =>
  tables.find((table) => table.id === tableId);

const buildReportItemTargetLabel = (table: TableLayout | undefined, item: OrderItem) => {
  const target = item.target;
  if (target.type === "table") return "Tisch";

  return table?.seats.find((seat) => seat.id === target.seatId)?.label ?? "Sitzplatz";
};

const buildWrappedReportLines = (value: string, emphasis = false): ThermalPrintLine[] =>
  wrapText(value, THERMAL_LINE_WIDTH).map((text, index) => ({
    text,
    emphasis: emphasis && index === 0
  }));

export const buildBookingStatisticsPrintDocument = ({
  sessions,
  tables,
  products,
  printedAt = new Date().toISOString()
}: BuildBookingStatisticsDocumentInput): ThermalPrintDocument => {
  const reportSessions = sessions
    .filter(
      (session) =>
        session.items.length > 0 ||
        session.payments.length > 0 ||
        session.cancellations.length > 0
    )
    .sort((left, right) =>
      resolveReportTableName(tables, left.tableId).localeCompare(
        resolveReportTableName(tables, right.tableId),
        "de"
      )
    );
  const orderedQuantity = reportSessions.reduce(
    (sum, session) => sum + session.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0
  );
  const bookingTotal = reportSessions.reduce(
    (sum, session) =>
      sum + session.items.reduce((itemSum, item) => itemSum + calculateBookedItemTotal(item, products), 0),
    0
  );
  const billableTotal = reportSessions.reduce(
    (sum, session) => sum + calculateSessionBillableTotal(session, products),
    0
  );
  const paidTotal = reportSessions.reduce((sum, session) => sum + calculateSessionPaidTotal(session), 0);
  const canceledTotal = reportSessions.reduce(
    (sum, session) => sum + calculateSessionCanceledTotal(session, products),
    0
  );
  const openTotal = reportSessions.reduce(
    (sum, session) => sum + calculateSessionOpenTotal(session, products),
    0
  );
  const paymentTotals = new Map<keyof typeof paymentLabels, number>();
  const productTotals = new Map<string, { name: string; quantity: number; total: number }>();

  for (const session of reportSessions) {
    for (const payment of session.payments) {
      paymentTotals.set(payment.method, (paymentTotals.get(payment.method) ?? 0) + payment.amountCents);
    }

    for (const item of session.items) {
      const productName = resolveProductLabel(products, item.productId);
      const current = productTotals.get(item.productId) ?? {
        name: productName,
        quantity: 0,
        total: 0
      };
      current.quantity += item.quantity;
      current.total += calculateBookedItemTotal(item, products);
      productTotals.set(item.productId, current);
    }
  }

  const paymentLines =
    paymentTotals.size > 0
      ? [...paymentTotals.entries()]
          .sort(([left], [right]) => paymentLabels[left].localeCompare(paymentLabels[right], "de"))
          .map(([method, amount]) => buildReportInfoLine(paymentLabels[method], formatEuroCents(amount)))
      : [{ text: "Keine Abrechnungen vorhanden." }];
  const productLines =
    productTotals.size > 0
      ? [...productTotals.values()]
          .sort((left, right) => right.quantity - left.quantity || left.name.localeCompare(right.name, "de"))
          .flatMap((entry) =>
            buildWrappedReportLines(
              `${entry.quantity}x ${entry.name} · ${formatEuroCents(entry.total)}`,
              true
            )
          )
      : [{ text: "Keine Buchungen vorhanden." }];
  const sessionLines =
    reportSessions.length > 0
      ? reportSessions.flatMap((session) => {
          const tableName = resolveReportTableName(tables, session.tableId);
          const table = resolveReportTable(tables, session.tableId);
          const paymentCount = session.payments.length;
          const cancellationCount = session.cancellations.length;

          return [
            { text: tableName, emphasis: true },
            {
              text: `${sessionStatusReportLabels[session.status]} · ${session.items.length} Positionen · ${paymentCount} Zahlungen`
            },
            buildReportInfoLine("Gebucht", formatEuroCents(calculateSessionTotal(session, products))),
            buildReportInfoLine("Bezahlt", formatEuroCents(calculateSessionPaidTotal(session))),
            buildReportInfoLine("Offen", formatEuroCents(calculateSessionOpenTotal(session, products))),
            ...(cancellationCount > 0
              ? [buildReportInfoLine("Stornos", String(cancellationCount))]
              : []),
            ...session.items.flatMap((item) => {
              const productName = buildSessionPositionName(item, products);
              const targetLabel = buildReportItemTargetLabel(table, item);
              const statusLabel = item.canceledAt ? " · storniert" : "";
              return buildWrappedReportLines(
                `- ${item.quantity}x ${productName} · ${targetLabel} · ${formatEuroCents(
                  calculateBookedItemTotal(item, products)
                )}${statusLabel}`
              );
            }),
            { text: "" }
          ];
        })
      : [{ text: "Keine Tische mit Buchungen vorhanden." }];
  const settlementLines =
    reportSessions.some((session) => session.payments.length > 0)
      ? reportSessions.flatMap((session) =>
          session.payments.flatMap((payment) =>
            buildWrappedReportLines(
              `${resolveReportTableName(tables, session.tableId)} · ${payment.label} · ${
                paymentLabels[payment.method]
              } · ${formatEuroCents(payment.amountCents)}`
            )
          )
        )
      : [{ text: "Keine Zahlungen vorhanden." }];
  const cancellationLines =
    reportSessions.some((session) => session.cancellations.length > 0)
      ? reportSessions.flatMap((session) =>
          session.cancellations.flatMap((cancellation) =>
            buildWrappedReportLines(
              `${resolveReportTableName(tables, session.tableId)} · ${cancellation.label} · ${
                cancellation.lineItems.reduce((sum, lineItem) => sum + lineItem.quantity, 0)
              } Positionen · ${formatDateTime(cancellation.createdAt)}`
            )
          )
        )
      : [{ text: "Keine Stornos vorhanden." }];

  return {
    title: "Statistik",
    width: THERMAL_LINE_WIDTH,
    lines: [
      { text: centerLine("STATISTIK"), emphasis: true, align: "center" },
      { text: centerLine("Abrechnungen & Buchungen"), align: "center" },
      { text: SEPARATOR },
      { text: `ZEIT  : ${formatDateTime(printedAt)}` },
      buildReportInfoLine("Tische", String(reportSessions.length)),
      buildReportInfoLine("Positionen", String(orderedQuantity)),
      buildReportInfoLine("Gebucht", formatEuroCents(bookingTotal)),
      buildReportInfoLine("Abrechenbar", formatEuroCents(billableTotal)),
      buildReportInfoLine("Bezahlt", formatEuroCents(paidTotal)),
      buildReportInfoLine("Storniert", formatEuroCents(canceledTotal)),
      buildReportInfoLine("Offen", formatEuroCents(openTotal)),
      ...buildReportSection("Zahlarten"),
      ...paymentLines,
      ...buildReportSection("Artikel"),
      ...productLines,
      ...buildReportSection("Buchungen je Tisch"),
      ...sessionLines,
      ...buildReportSection("Abrechnungen"),
      ...settlementLines,
      ...buildReportSection("Stornos"),
      ...cancellationLines,
      { text: SEPARATOR },
      { text: centerLine("Ende der Statistik"), align: "center" }
    ]
  };
};

export const buildPrinterTestDocument = (
  model: string,
  host: string,
  port: number
): ThermalPrintDocument => ({
  title: "Testdruck",
  width: THERMAL_LINE_WIDTH,
  lines: [
    { text: centerLine("TESTDRUCK"), emphasis: true, align: "center" },
    { text: centerLine(model), align: "center" },
    { text: SEPARATOR },
    { text: `HOST  : ${host || "nicht gesetzt"}` },
    { text: `PORT  : ${String(port)}` },
    { text: `ZEIT  : ${formatDateTime(new Date().toISOString())}` },
    { text: SEPARATOR },
    { text: "Wenn dieser Bon sichtbar ist," },
    { text: "funktioniert die Netzwerkverbindung." },
    { text: "" },
    { text: centerLine("KiJu Drucktest"), align: "center" }
  ]
});
