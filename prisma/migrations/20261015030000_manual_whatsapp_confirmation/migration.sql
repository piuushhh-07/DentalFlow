ALTER TYPE "MessageLogStatus"
ADD VALUE 'MANUALLY_RECORDED_SENT';

ALTER TABLE "message_logs"
ADD COLUMN "clientRequestId" UUID,
ADD COLUMN "manuallyConfirmedSentAt" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX "message_logs_clinicId_clientRequestId_key"
ON "message_logs" ("clinicId", "clientRequestId");
