import net from "node:net";

import type { NetworkPrinterConfig, ThermalPrintDocument } from "@kiju/domain";

import {
  buildPipaReceiptDocument,
  buildReceiptPrintDocument,
  type PipaReceiptInput,
  type ReceiptDocumentInput
} from "./formatters";

const ESC = 0x1b;
const GS = 0x1d;
const DEFAULT_TIMEOUT_MS = 5000;
const WPC1252_CODEPAGE = 16;

const CP1252_EXTENDED_BYTES = new Map<string, number>([
  ["€", 0x80],
  ["‚", 0x82],
  ["„", 0x84],
  ["…", 0x85],
  ["†", 0x86],
  ["‡", 0x87],
  ["ˆ", 0x88],
  ["‰", 0x89],
  ["Š", 0x8a],
  ["‹", 0x8b],
  ["Œ", 0x8c],
  ["Ž", 0x8e],
  ["‘", 0x91],
  ["’", 0x92],
  ["“", 0x93],
  ["”", 0x94],
  ["•", 0x95],
  ["–", 0x96],
  ["—", 0x97],
  ["˜", 0x98],
  ["™", 0x99],
  ["š", 0x9a],
  ["›", 0x9b],
  ["œ", 0x9c],
  ["ž", 0x9e],
  ["Ÿ", 0x9f]
]);

const ASCII_FALLBACKS = new Map<string, string>([
  ["‐", "-"],
  ["‑", "-"],
  ["‒", "-"],
  ["−", "-"],
  ["·", "-"],
  ["•", "-"],
  ["…", "..."],
  ["“", '"'],
  ["”", '"'],
  ["„", '"'],
  ["’", "'"],
  ["‘", "'"]
]);

const normalizeForPrinter = (value: string) =>
  value
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "    ");

const encodeCp1252 = (value: string) => {
  const normalized = normalizeForPrinter(value);
  const bytes: number[] = [];

  for (const character of normalized) {
    if (character === "\n") {
      bytes.push(0x0a);
      continue;
    }

    const directCode = character.charCodeAt(0);
    if (directCode <= 0xff && character !== "€") {
      bytes.push(directCode);
      continue;
    }

    const mappedByte = CP1252_EXTENDED_BYTES.get(character);
    if (mappedByte !== undefined) {
      bytes.push(mappedByte);
      continue;
    }

    const fallback = ASCII_FALLBACKS.get(character);
    if (fallback) {
      bytes.push(...Buffer.from(fallback, "ascii"));
      continue;
    }

    bytes.push("?".charCodeAt(0));
  }

  return Buffer.from(bytes);
};

const encodeLine = (value: string) => encodeCp1252(value);

const resolveAlignment = (align: ThermalPrintDocument["lines"][number]["align"]) =>
  align === "center" ? 1 : 0;

export const buildEscPosDocumentBuffer = (document: ThermalPrintDocument) => {
  const chunks: Buffer[] = [
    Buffer.from([ESC, 0x40]),
    Buffer.from([ESC, 0x74, WPC1252_CODEPAGE]),
    Buffer.from([ESC, 0x32])
  ];

  for (const line of document.lines) {
    chunks.push(Buffer.from([ESC, 0x61, resolveAlignment(line.align)]));
    chunks.push(Buffer.from([ESC, 0x45, line.emphasis ? 1 : 0]));
    chunks.push(encodeLine(line.text));
    chunks.push(Buffer.from("\n", "ascii"));
  }

  chunks.push(Buffer.from([ESC, 0x45, 0]));
  chunks.push(Buffer.from([ESC, 0x61, 0]));
  chunks.push(Buffer.from([ESC, 0x64, 4]));
  chunks.push(Buffer.from([GS, 0x56, 0x42, 0x00]));

  return Buffer.concat(chunks);
};

export const buildEscPosReceiptBuffer = (input: PipaReceiptInput | ReceiptDocumentInput) =>
  buildEscPosDocumentBuffer(
    "sections" in input ? buildReceiptPrintDocument(input) : buildPipaReceiptDocument(input)
  );

export const sendEscPosDocumentToNetworkPrinter = async (
  printer: Pick<NetworkPrinterConfig, "enabled" | "host" | "port">,
  document: ThermalPrintDocument,
  timeoutMs = DEFAULT_TIMEOUT_MS
) => {
  if (!printer.enabled) {
    throw new Error("Der Netzwerkdrucker ist deaktiviert.");
  }

  const host = printer.host.trim();
  if (!host) {
    throw new Error("Für den Drucker ist keine IP-Adresse hinterlegt.");
  }

  const port = Number.isFinite(printer.port) ? printer.port : 9100;
  const payload = buildEscPosDocumentBuffer(document);

  await new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({ host, port });

    const fail = (error: Error) => {
      socket.destroy();
      reject(error);
    };

    socket.setTimeout(timeoutMs);
    socket.once("timeout", () => fail(new Error("Zeitüberschreitung beim Netzwerkdruck.")));
    socket.once("error", (error: Error) => fail(error));
    socket.once("connect", () => {
      socket.write(payload, (error?: Error | null) => {
        if (error) {
          fail(error);
          return;
        }

        socket.end(() => resolve());
      });
    });
  });
};
