import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const reviewUrl = "https://g.page/r/Cd6oVy0HDjCIEBM/review";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const outputDir = join(repoRoot, "docs", "marketing");
const pdfPath = join(outputDir, "google-bewertung-aushang.pdf");
const qrSvgPath = join(outputDir, "google-bewertung-qr.svg");

const webRequire = createRequire(new URL("../apps/web/package.json", import.meta.url));
const QRCode = webRequire("qrcode");

const mm = 72 / 25.4;
const page = {
  width: 210 * mm,
  height: 297 * mm,
};

const colors = {
  background: "#fffdf7",
  ink: "#202124",
  muted: "#5f6368",
  border: "#dadce0",
  card: "#ffffff",
  blue: "#4285f4",
  red: "#db4437",
  yellow: "#f4b400",
  green: "#0f9d58",
  warm: "#fff4db",
};

const fmt = (value) => {
  if (Math.abs(value) < 0.0001) return "0";
  return value.toFixed(3).replace(/\.?0+$/, "");
};

const hexToRgb = (hex) => {
  const normalized = hex.replace("#", "");
  return [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16) / 255);
};

const winAnsi = (text) => Buffer.from(text, "latin1").toString("latin1");

const escapePdfText = (text) =>
  winAnsi(text)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const approximateTextWidth = (text, size, fontName) => {
  const base = fontName === "F3" ? 0.5 : 0.53;
  let width = 0;

  for (const character of text) {
    if (character === " ") width += size * 0.28;
    else if ("ilI.,:;|".includes(character)) width += size * 0.22;
    else if ("MW".includes(character)) width += size * 0.78;
    else if ("&@".includes(character)) width += size * 0.72;
    else width += size * base;
  }

  return width;
};

const createPdfStream = (qr) => {
  const stream = [];

  const setFill = (hex) => {
    const [r, g, b] = hexToRgb(hex);
    stream.push(`${fmt(r)} ${fmt(g)} ${fmt(b)} rg`);
  };

  const setStroke = (hex) => {
    const [r, g, b] = hexToRgb(hex);
    stream.push(`${fmt(r)} ${fmt(g)} ${fmt(b)} RG`);
  };

  const lineWidth = (width) => {
    stream.push(`${fmt(width)} w`);
  };

  const rect = (x, y, width, height, mode) => {
    stream.push(`${fmt(x)} ${fmt(y)} ${fmt(width)} ${fmt(height)} re ${mode}`);
  };

  const roundedRect = (x, y, width, height, radius, mode) => {
    const c = radius * 0.5522847498;
    stream.push(
      [
        `${fmt(x + radius)} ${fmt(y)} m`,
        `${fmt(x + width - radius)} ${fmt(y)} l`,
        `${fmt(x + width - radius + c)} ${fmt(y)} ${fmt(x + width)} ${fmt(y + radius - c)} ${fmt(x + width)} ${fmt(y + radius)} c`,
        `${fmt(x + width)} ${fmt(y + height - radius)} l`,
        `${fmt(x + width)} ${fmt(y + height - radius + c)} ${fmt(x + width - radius + c)} ${fmt(y + height)} ${fmt(x + width - radius)} ${fmt(y + height)} c`,
        `${fmt(x + radius)} ${fmt(y + height)} l`,
        `${fmt(x + radius - c)} ${fmt(y + height)} ${fmt(x)} ${fmt(y + height - radius + c)} ${fmt(x)} ${fmt(y + height - radius)} c`,
        `${fmt(x)} ${fmt(y + radius)} l`,
        `${fmt(x)} ${fmt(y + radius - c)} ${fmt(x + radius - c)} ${fmt(y)} ${fmt(x + radius)} ${fmt(y)} c`,
        `h ${mode}`,
      ].join("\n"),
    );
  };

  const centeredText = (text, x, y, size, fontName, fill = colors.ink) => {
    const textWidth = approximateTextWidth(text, size, fontName);
    const left = x - textWidth / 2;
    setFill(fill);
    stream.push(`BT /${fontName} ${fmt(size)} Tf 1 0 0 1 ${fmt(left)} ${fmt(y)} Tm (${escapePdfText(text)}) Tj ET`);
  };

  const leftText = (text, x, y, size, fontName, fill = colors.ink) => {
    setFill(fill);
    stream.push(`BT /${fontName} ${fmt(size)} Tf 1 0 0 1 ${fmt(x)} ${fmt(y)} Tm (${escapePdfText(text)}) Tj ET`);
  };

  const star = (cx, cy, outerRadius, innerRadius) => {
    const points = [];
    for (let index = 0; index < 10; index += 1) {
      const radius = index % 2 === 0 ? outerRadius : innerRadius;
      const angle = (-90 + index * 36) * (Math.PI / 180);
      points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
    }

    setFill(colors.yellow);
    stream.push(
      [
        `${fmt(points[0][0])} ${fmt(points[0][1])} m`,
        ...points.slice(1).map(([x, y]) => `${fmt(x)} ${fmt(y)} l`),
        "h f",
      ].join("\n"),
    );
  };

  const qrCode = (x, y, size) => {
    const quietZone = 4;
    const moduleCount = qr.modules.size;
    const totalModules = moduleCount + quietZone * 2;
    const moduleSize = size / totalModules;
    const rects = [];

    setFill(colors.card);
    rect(x, y, size, size, "f");

    for (let row = 0; row < moduleCount; row += 1) {
      for (let col = 0; col < moduleCount; col += 1) {
        if (!qr.modules.get(row, col)) continue;
        const moduleX = x + (col + quietZone) * moduleSize;
        const moduleY = y + size - (row + quietZone + 1) * moduleSize;
        rects.push(`${fmt(moduleX)} ${fmt(moduleY)} ${fmt(moduleSize)} ${fmt(moduleSize)} re`);
      }
    }

    setFill(colors.ink);
    stream.push(`${rects.join("\n")}\nf`);
  };

  setFill(colors.background);
  rect(0, 0, page.width, page.height, "f");

  const stripeWidth = page.width / 4;
  [
    colors.blue,
    colors.red,
    colors.yellow,
    colors.green,
  ].forEach((color, index) => {
    setFill(color);
    rect(index * stripeWidth, page.height - 9, stripeWidth, 9, "f");
  });

  setFill(colors.warm);
  roundedRect(38, 43, page.width - 76, page.height - 103, 26, "f");

  setFill(colors.card);
  setStroke(colors.border);
  lineWidth(1.2);
  roundedRect(46, 53, page.width - 92, page.height - 123, 22, "B");

  centeredText("Bistro PiPa", page.width / 2, 741, 36, "F3", colors.ink);
  centeredText("Pizza & Pasta | Zionsgemeinde Haus Amos", page.width / 2, 716, 13, "F1", colors.muted);

  setFill(colors.blue);
  roundedRect(page.width / 2 - 72, 678, 144, 26, 13, "f");
  centeredText("Google-Bewertung", page.width / 2, 686, 12, "F2", colors.card);

  centeredText("Bewerte uns auf Google", page.width / 2, 628, 42, "F2", colors.ink);

  const starStart = page.width / 2 - 76;
  for (let index = 0; index < 5; index += 1) {
    star(starStart + index * 38, 588, 15, 6.5);
  }

  centeredText("Deine Meinung hilft uns sehr.", page.width / 2, 535, 21, "F2", colors.ink);
  centeredText("Scanne den QR-Code und teile deine Erfahrung.", page.width / 2, 506, 18, "F1", colors.muted);

  setFill("#eef3fd");
  roundedRect(page.width / 2 - 177, 142, 354, 336, 24, "f");
  setFill(colors.card);
  setStroke(colors.border);
  lineWidth(1.4);
  roundedRect(page.width / 2 - 168, 151, 336, 318, 20, "B");

  centeredText("Jetzt scannen", page.width / 2, 438, 18, "F2", colors.blue);
  qrCode(page.width / 2 - 135, 184, 270);

  centeredText("Danke für deine Unterstützung!", page.width / 2, 99, 23, "F2", colors.ink);
  centeredText("Link: g.page/r/Cd6oVy0HDjCIEBM/review", page.width / 2, 76, 10.5, "F1", colors.muted);

  leftText("Zum Bewerten bitte die Smartphone-Kamera öffnen und den QR-Code scannen.", 75, 57, 9.5, "F1", colors.muted);

  return stream.join("\n");
};

const createPdf = (content) => {
  const objects = [];

  const addObject = (body) => {
    objects.push(Buffer.isBuffer(body) ? body : Buffer.from(body, "latin1"));
    return objects.length;
  };

  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = addObject("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  const pageId = addObject(
    [
      "<<",
      "/Type /Page",
      `/Parent ${pagesId} 0 R`,
      `/MediaBox [0 0 ${fmt(page.width)} ${fmt(page.height)}]`,
      "/Resources <<",
      "/Font <<",
      "/F1 4 0 R",
      "/F2 5 0 R",
      "/F3 6 0 R",
      ">>",
      ">>",
      "/Contents 7 0 R",
      ">>",
    ].join("\n"),
  );
  const helveticaId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const helveticaBoldId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const timesBoldId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>");
  const contentBuffer = Buffer.from(content, "latin1");
  const contentId = addObject(Buffer.concat([
    Buffer.from(`<< /Length ${contentBuffer.length} >>\nstream\n`, "latin1"),
    contentBuffer,
    Buffer.from("\nendstream", "latin1"),
  ]));
  const infoId = addObject(
    "<< /Title (Google-Bewertung Aushang) /Author (Bistro PiPa) /Producer (Codex Node PDF Generator) >>",
  );

  if (![catalogId, pageId, helveticaId, helveticaBoldId, timesBoldId, contentId, infoId].every(Boolean)) {
    throw new Error("PDF object creation failed.");
  }

  const chunks = [Buffer.from("%PDF-1.4\n%\xff\xff\xff\xff\n", "latin1")];
  const offsets = [0];
  let length = chunks[0].length;

  objects.forEach((object, index) => {
    offsets.push(length);
    const prefix = Buffer.from(`${index + 1} 0 obj\n`, "latin1");
    const suffix = Buffer.from("\nendobj\n", "latin1");
    chunks.push(prefix, object, suffix);
    length += prefix.length + object.length + suffix.length;
  });

  const xrefOffset = length;
  const xrefLines = [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
    "",
  ];

  chunks.push(Buffer.from(xrefLines.join("\n"), "latin1"));

  return Buffer.concat(chunks);
};

await mkdir(outputDir, { recursive: true });

const qr = QRCode.create(reviewUrl, { errorCorrectionLevel: "H" });
const qrSvg = await QRCode.toString(reviewUrl, {
  type: "svg",
  errorCorrectionLevel: "H",
  margin: 4,
  width: 1024,
  color: {
    dark: colors.ink,
    light: colors.card,
  },
});

await writeFile(qrSvgPath, qrSvg, "utf8");
await writeFile(pdfPath, createPdf(createPdfStream(qr)));

console.log(`PDF erstellt: ${pdfPath}`);
console.log(`QR-SVG erstellt: ${qrSvgPath}`);
