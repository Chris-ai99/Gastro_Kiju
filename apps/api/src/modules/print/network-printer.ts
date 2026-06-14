import net from "node:net";
import type {
  NetworkPrinterConfig,
  ThermalPrintDocument
} from "@kiju/domain";

const ESC = 0x1b;
const GS = 0x1d;
const WPC1252_CODEPAGE = 16;

const encodeLine = (value: string) => {
  const bytes: number[] = [];
  for (const character of value.replace(/\r\n?/g, "\n").replace(/\t/g, "    ")) {
    if (character === "\n") {
      bytes.push(0x0a);
      continue;
    }
    const code = character.charCodeAt(0);
    bytes.push(code <= 0xff ? code : "?".charCodeAt(0));
  }
  return Buffer.from(bytes);
};

const resolveCharacterSize = (size: ThermalPrintDocument["lines"][number]["size"]) => {
  if (size === "xlarge") return 0x22;
  if (size === "large") return 0x11;
  return 0x00;
};

const buildRasterBitmapBuffer = (
  bitmap: NonNullable<ThermalPrintDocument["lines"][number]["bitmap"]>
) => {
  const width = Math.max(1, Math.floor(bitmap.width));
  const height = Math.max(1, Math.floor(bitmap.height));
  const bytesPerRow = Math.ceil(width / 8);
  const raster = Buffer.from(bitmap.dataBase64, "base64");
  const expectedLength = bytesPerRow * height;

  if (raster.length !== expectedLength) {
    throw new Error(
      `Ungültige Rastergrafik: ${raster.length} Byte vorhanden, ${expectedLength} Byte erwartet.`
    );
  }

  return Buffer.concat([
    Buffer.from([
      GS,
      0x76,
      0x30,
      0x00,
      bytesPerRow & 0xff,
      (bytesPerRow >> 8) & 0xff,
      height & 0xff,
      (height >> 8) & 0xff
    ]),
    raster
  ]);
};

const buildEscPosDocumentBuffer = (document: ThermalPrintDocument) => {
  const upsideDown = document.upsideDown ?? true;
  const chunks: Buffer[] = [
    Buffer.from([ESC, 0x40]),
    Buffer.from([ESC, 0x7b, upsideDown ? 0x01 : 0x00]),
    Buffer.from([ESC, 0x74, WPC1252_CODEPAGE]),
    Buffer.from([ESC, 0x32])
  ];

  for (const line of document.lines) {
    chunks.push(Buffer.from([ESC, 0x61, line.align === "center" ? 1 : 0]));
    chunks.push(Buffer.from([ESC, 0x45, line.emphasis ? 1 : 0]));
    chunks.push(Buffer.from([GS, 0x21, resolveCharacterSize(line.size)]));

    if (line.bitmap) {
      chunks.push(buildRasterBitmapBuffer(line.bitmap));
      chunks.push(Buffer.from("\n", "ascii"));
      continue;
    }

    chunks.push(encodeLine(line.text));
    chunks.push(Buffer.from("\n", "ascii"));
  }

  chunks.push(Buffer.from([ESC, 0x7b, 0x00]));
  chunks.push(Buffer.from([ESC, 0x45, 0]));
  chunks.push(Buffer.from([ESC, 0x61, 0]));
  chunks.push(Buffer.from([GS, 0x21, 0x00]));
  chunks.push(Buffer.from([ESC, 0x64, 4]));
  chunks.push(Buffer.from([GS, 0x56, 0x42, 0x00]));
  return Buffer.concat(chunks);
};

export const sendDocumentToNetworkPrinter = async (
  printer: Pick<NetworkPrinterConfig, "enabled" | "host" | "port">,
  document: ThermalPrintDocument,
  timeoutMs = 5000
) => {
  if (!printer.enabled) {
    throw new Error("Der Netzwerkdrucker ist deaktiviert.");
  }
  const host = printer.host.trim();
  if (!host) {
    throw new Error("Für den Drucker ist keine IP-Adresse hinterlegt.");
  }
  const payload = buildEscPosDocumentBuffer(document);
  await new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({
      host,
      port: Number.isFinite(printer.port) ? printer.port : 9100
    });
    const fail = (error: Error) => {
      socket.destroy();
      reject(error);
    };
    socket.setTimeout(timeoutMs);
    socket.once("timeout", () =>
      fail(new Error("Zeitüberschreitung beim Netzwerkdruck."))
    );
    socket.once("error", fail);
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
