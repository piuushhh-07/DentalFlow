DROP INDEX "treatment_plans_clinicId_status_idx";

CREATE INDEX "treatment_plans_clinicId_status_completedAt_idx"
ON "treatment_plans" ("clinicId", "status", "completedAt");

CREATE INDEX "message_logs_clinicId_status_manuallyConfirmedSentAt_idx"
ON "message_logs" ("clinicId", "status", "manuallyConfirmedSentAt");
