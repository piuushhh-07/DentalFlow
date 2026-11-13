ALTER TABLE "clinics"
ADD COLUMN "workingHours" JSONB NOT NULL DEFAULT '[]'::jsonb;
