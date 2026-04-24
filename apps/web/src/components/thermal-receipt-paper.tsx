import type { ThermalPrintDocument } from "@kiju/domain";

type ThermalReceiptPaperProps = {
  document: ThermalPrintDocument;
  className?: string;
};

export function ThermalReceiptPaper({ document, className = "" }: ThermalReceiptPaperProps) {
  const receiptClassName = `kiju-receipt-paper ${className}`.trim();

  return (
    <div className={receiptClassName} role="document" aria-label="Kassenbon">
      {document.lines.map((line, index) => (
        <div
          key={`${index}-${line.text}`}
          className={`kiju-receipt-paper__line${line.emphasis ? " kiju-receipt-paper__line--emphasis" : ""}`}
          style={{
            textAlign: line.align ?? "left"
          }}
        >
          {line.text}
        </div>
      ))}
    </div>
  );
}
