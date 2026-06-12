CREATE TABLE "OperationalState" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OperationalState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransactionRecord" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "actorId" TEXT,
    "kind" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "operation" JSONB NOT NULL,
    "confirmation" JSONB NOT NULL,
    "stateVersion" INTEGER NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransactionRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransmissionAttempt" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "actorId" TEXT,
    "kind" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "response" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "TransmissionAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UndoCheckpoint" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "actorId" TEXT,
    "state" JSONB NOT NULL,
    "stateVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    CONSTRAINT "UndoCheckpoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrinterConfig" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PrinterConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrintJob" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "printedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TransactionRecord_transactionId_key"
ON "TransactionRecord"("transactionId");
CREATE INDEX "TransactionRecord_deviceId_createdAt_idx"
ON "TransactionRecord"("deviceId", "createdAt");
CREATE INDEX "TransactionRecord_kind_createdAt_idx"
ON "TransactionRecord"("kind", "createdAt");
CREATE INDEX "TransmissionAttempt_transactionId_createdAt_idx"
ON "TransmissionAttempt"("transactionId", "createdAt");
CREATE INDEX "TransmissionAttempt_status_createdAt_idx"
ON "TransmissionAttempt"("status", "createdAt");
CREATE UNIQUE INDEX "UndoCheckpoint_transactionId_key"
ON "UndoCheckpoint"("transactionId");
CREATE INDEX "UndoCheckpoint_kind_createdAt_idx"
ON "UndoCheckpoint"("kind", "createdAt");
CREATE UNIQUE INDEX "PrintJob_transactionId_requestHash_key"
ON "PrintJob"("transactionId", "requestHash");
CREATE INDEX "PrintJob_status_createdAt_idx"
ON "PrintJob"("status", "createdAt");
