ALTER TABLE "message_logs"
ADD CONSTRAINT "message_logs_manual_sent_timestamp_check"
CHECK (
  ("status" = 'MANUALLY_RECORDED_SENT') =
  ("manuallyConfirmedSentAt" IS NOT NULL)
);
