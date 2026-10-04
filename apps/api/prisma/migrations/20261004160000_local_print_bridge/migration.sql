ALTER TABLE "PrintJob"
ADD COLUMN "bridgeClaimId" TEXT,
ADD COLUMN "bridgeLeaseExpiresAt" TIMESTAMP(3);

CREATE INDEX "PrintJob_status_bridgeLeaseExpiresAt_idx"
ON "PrintJob"("status", "bridgeLeaseExpiresAt");

ALTER TABLE "PrinterConfig"
ADD COLUMN "bridgeLastSeenAt" TIMESTAMP(3);

ALTER TABLE "PrinterConfig"
ADD COLUMN "bridgePrinterReachable" BOOLEAN,
ADD COLUMN "bridgePrinterCheckedAt" TIMESTAMP(3),
ADD COLUMN "bridgePrinterError" TEXT;
