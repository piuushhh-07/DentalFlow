ALTER TABLE "preventive_recalls"
ADD COLUMN "completedAt" TIMESTAMPTZ(6);

UPDATE "preventive_recalls"
SET "completedAt" = "updatedAt"
WHERE "status" = 'COMPLETED';

UPDATE "preventive_recalls"
SET "intervalMonths" = 6
WHERE "type" = 'SIX_MONTH_CHECKUP'
  AND "intervalMonths" IS NULL;

ALTER TABLE "preventive_recalls"
ADD CONSTRAINT "preventive_recalls_intervalMonths_check"
CHECK (
  "intervalMonths" IS NULL OR
  "intervalMonths" BETWEEN 1 AND 120
);

ALTER TABLE "preventive_recalls"
ADD CONSTRAINT "preventive_recalls_custom_fields_check"
CHECK (
  "type" <> 'CUSTOM' OR (
    "customName" IS NOT NULL AND
    length(btrim("customName")) >= 2 AND
    "intervalMonths" IS NOT NULL AND
    "intervalMonths" BETWEEN 1 AND 120
  )
);

ALTER TABLE "preventive_recalls"
ADD CONSTRAINT "preventive_recalls_six_month_interval_check"
CHECK (
  "type" <> 'SIX_MONTH_CHECKUP' OR
  ("intervalMonths" IS NOT NULL AND "intervalMonths" = 6)
);

ALTER TABLE "preventive_recalls"
ADD CONSTRAINT "preventive_recalls_completion_timestamp_check"
CHECK (
  ("status" = 'COMPLETED') = ("completedAt" IS NOT NULL)
);

CREATE UNIQUE INDEX "preventive_recalls_active_cycle_key"
ON "preventive_recalls" (
  "clinicId",
  "patientId",
  "type",
  lower(COALESCE("customName", '')),
  "dueDate"
)
WHERE "status" = 'ACTIVE';
