import { calculateSessionTotal, type OrderSession, type Product } from "@kiju/domain";

const RECEIPT_LINE_WIDTH = 42;
const ITEM_NAME_WIDTH = 27;
const QUANTITY_WIDTH = 5;
const PRICE_WIDTH = 8;
const TOTAL_VALUE_WIDTH = 12;
const SEPARATOR = "-".repeat(RECEIPT_LINE_WIDTH);

type ReceiptLine = {
  text: string;
  emphasis?: boolean;
};

type ThermalReceiptPaperProps = {
  session: OrderSession;
  products: Product[];
  openedAt: string;
  className?: string;
};

const normalizeReceiptText = (value: string) => value.replace(/\s+/g, " ").trim();

const fitLeft = (value: string, width: number) => {
  const normalized = normalizeReceiptText(value);
  return normalized.length > width ? normalized.slice(0, width) : normalized.padEnd(width, " ");
};

const fitRight = (value: string, width: number) => {
  const normalized = normalizeReceiptText(value);
  return normalized.length > width ? normalized.slice(-width) : normalized.padStart(width, " ");
};

const centerLine = (value: string) => {
  const normalized = normalizeReceiptText(value);
  if (normalized.length >= RECEIPT_LINE_WIDTH) return normalized.slice(0, RECEIPT_LINE_WIDTH);

  const leftPadding = Math.floor((RECEIPT_LINE_WIDTH - normalized.length) / 2);
  return `${" ".repeat(leftPadding)}${normalized}`.padEnd(RECEIPT_LINE_WIDTH, " ");
};

const formatReceiptNumber = (source: string) => {
  let hash = 0;

  for (const character of source) {
    hash = (hash * 33 + character.charCodeAt(0)) % 1000000;
  }

  return String(hash).padStart(6, "0");
};

const formatReceiptDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return normalizeReceiptText(value);

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

const formatReceiptCents = (cents: number) => {
  const sign = cents < 0 ? "-" : "";
  return `${sign}${(Math.abs(cents) / 100).toFixed(2)}`;
};

const wrapText = (value: string, width: number) => {
  const words = normalizeReceiptText(value).split(" ").filter(Boolean);
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

  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [""];
};

const buildItemLines = (session: OrderSession, products: Product[]) =>
  session.items.flatMap((item) => {
    const product = products.find((entry) => entry.id === item.productId);
    const nameLines = wrapText(product?.name ?? "Unbekannter Artikel", ITEM_NAME_WIDTH);
    const quantity = fitRight(`${item.quantity}x`, QUANTITY_WIDTH);
    const price = fitRight(formatReceiptCents((product?.priceCents ?? 0) * item.quantity), PRICE_WIDTH);

    return nameLines.map((line, index): ReceiptLine => {
      if (index === 0) {
        return {
          text: `${fitLeft(line, ITEM_NAME_WIDTH)} ${quantity} ${price}`
        };
      }

      return {
        text: `${fitLeft(line, ITEM_NAME_WIDTH)} ${" ".repeat(QUANTITY_WIDTH)} ${" ".repeat(PRICE_WIDTH)}`
      };
    });
  });

const buildThermalReceiptLines = (
  session: OrderSession,
  products: Product[],
  openedAt: string
): ReceiptLine[] => {
  const total = calculateSessionTotal(session, products);
  const totalValue = fitRight(`${formatReceiptCents(total)} €`, TOTAL_VALUE_WIDTH);
  const itemLines = buildItemLines(session, products);

  return [
    { text: centerLine("PiPa Bistro"), emphasis: true },
    { text: centerLine("Pizza & Pasta") },
    { text: "" },
    { text: SEPARATOR },
    { text: "" },
    { text: centerLine("KASSENBON"), emphasis: true },
    { text: "" },
    { text: `BON NR: ${formatReceiptNumber(session.id)}` },
    { text: `DATUM : ${formatReceiptDate(openedAt)}` },
    { text: "" },
    { text: SEPARATOR },
    {
      text: `${fitLeft("ARTIKEL", ITEM_NAME_WIDTH)} ${fitLeft("MENGE", QUANTITY_WIDTH)} ${fitRight(
        "PREIS",
        PRICE_WIDTH
      )}`,
      emphasis: true
    },
    { text: SEPARATOR },
    ...(itemLines.length > 0 ? itemLines : [{ text: "KEINE POSITIONEN" }]),
    { text: SEPARATOR },
    {
      text: `${fitLeft("SUMME", RECEIPT_LINE_WIDTH - TOTAL_VALUE_WIDTH)}${totalValue}`,
      emphasis: true
    },
    { text: SEPARATOR },
    { text: "" },
    { text: "Danke für deinen Besuch!" }
  ];
};

export function ThermalReceiptPaper({
  session,
  products,
  openedAt,
  className = ""
}: ThermalReceiptPaperProps) {
  const lines = buildThermalReceiptLines(session, products, openedAt);
  const receiptClassName = `kiju-receipt-paper ${className}`.trim();

  return (
    <div className={receiptClassName} role="document" aria-label="Kassenbon">
      {lines.map((line, index) => (
        <div
          key={`${index}-${line.text}`}
          className={`kiju-receipt-paper__line${line.emphasis ? " kiju-receipt-paper__line--emphasis" : ""}`}
        >
          {line.text}
        </div>
      ))}
    </div>
  );
}
