ALTER TABLE "patients" ADD COLUMN "archivedAt" TIMESTAMPTZ(6);

CREATE INDEX "patients_clinicId_archivedAt_fullName_idx"
ON "patients"("clinicId", "archivedAt", "fullName");
