ALTER TABLE "clinic_subscriptions"
  ADD COLUMN "pendingPlanVersionId" UUID,
  ADD COLUMN "pendingPlanChangeAt" TIMESTAMPTZ(6);

CREATE INDEX "cs_pending_plan_version_idx"
  ON "clinic_subscriptions"("pendingPlanVersionId");

ALTER TABLE "clinic_subscriptions"
  ADD CONSTRAINT "clinic_subscriptions_pendingPlanVersionId_fkey"
  FOREIGN KEY ("pendingPlanVersionId")
  REFERENCES "billing_plan_versions"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
