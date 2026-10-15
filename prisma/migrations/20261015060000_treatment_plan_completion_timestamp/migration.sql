ALTER TABLE "treatment_plans"
ADD COLUMN "completedAt" TIMESTAMPTZ(6);

UPDATE "treatment_plans"
SET "completedAt" = "updatedAt"
WHERE "status" = 'COMPLETED';

ALTER TABLE "treatment_plans"
ADD CONSTRAINT "treatment_plans_completion_timestamp_check"
CHECK (
  ("status" = 'COMPLETED') = ("completedAt" IS NOT NULL)
);
