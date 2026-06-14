"use client";

import { useEffect, useRef } from "react";

import type { ThermalPrintDocument } from "@kiju/domain";

type ThermalReceiptPaperProps = {
  document: ThermalPrintDocument;
  className?: string;
};

function ThermalReceiptBitmap({
  bitmap
}: {
  bitmap: NonNullable<ThermalPrintDocument["lines"][number]["bitmap"]>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const binary = window.atob(bitmap.dataBase64);
    const bytesPerRow = Math.ceil(bitmap.width / 8);
    const imageData = context.createImageData(bitmap.width, bitmap.height);

    for (let y = 0; y < bitmap.height; y += 1) {
      for (let x = 0; x < bitmap.width; x += 1) {
        const byte = binary.charCodeAt(y * bytesPerRow + Math.floor(x / 8));
        const black = (byte & (0x80 >> (x % 8))) !== 0;
        const offset = (y * bitmap.width + x) * 4;
        const channel = black ? 0 : 255;

        imageData.data[offset] = channel;
        imageData.data[offset + 1] = channel;
        imageData.data[offset + 2] = channel;
        imageData.data[offset + 3] = 255;
      }
    }

    context.putImageData(imageData, 0, 0);
  }, [bitmap]);

  return (
    <canvas
      ref={canvasRef}
      width={bitmap.width}
      height={bitmap.height}
      className="kiju-receipt-paper__bitmap"
      role="img"
      aria-label={bitmap.alt}
    />
  );
}

export function ThermalReceiptPaper({ document, className = "" }: ThermalReceiptPaperProps) {
  const receiptClassName = `kiju-receipt-paper ${className}`.trim();

  return (
    <div className={receiptClassName} role="document" aria-label="Kassenbon">
      {document.lines.map((line, index) => (
        line.bitmap ? (
          <ThermalReceiptBitmap key={`${index}-${line.bitmap.alt}`} bitmap={line.bitmap} />
        ) : (
          <div
            key={`${index}-${line.text}`}
            className={`kiju-receipt-paper__line${
              line.emphasis ? " kiju-receipt-paper__line--emphasis" : ""
            }${line.size && line.size !== "normal" ? ` kiju-receipt-paper__line--${line.size}` : ""}`}
            style={{
              textAlign: line.align ?? "left"
            }}
          >
            {line.text}
          </div>
        )
      ))}
    </div>
  );
}
