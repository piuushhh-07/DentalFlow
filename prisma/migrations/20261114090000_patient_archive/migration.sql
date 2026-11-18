ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS "patients_clinicId_archivedAt_fullName_idx"
ON "patients"("clinicId", "archivedAt", "fullName");
