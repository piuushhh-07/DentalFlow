CREATE TYPE "AppointmentStatus" AS ENUM (
  'SCHEDULED',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW'
);

CREATE TABLE "appointments" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "treatmentVisitId" UUID,
  "scheduledAt" TIMESTAMPTZ(6) NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "dentistName" VARCHAR(120) NOT NULL,
  "chairLabel" VARCHAR(80) NOT NULL,
  "type" VARCHAR(160) NOT NULL,
  "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "appointments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "appointments_duration_check" CHECK ("durationMinutes" BETWEEN 5 AND 480)
);

CREATE UNIQUE INDEX "appointments_id_clinicId_key"
  ON "appointments"("id", "clinicId");
CREATE INDEX "appointments_clinicId_scheduledAt_status_idx"
  ON "appointments"("clinicId", "scheduledAt", "status");
CREATE INDEX "appointments_clinicId_patientId_scheduledAt_idx"
  ON "appointments"("clinicId", "patientId", "scheduledAt");
CREATE INDEX "appointments_clinicId_treatmentVisitId_idx"
  ON "appointments"("clinicId", "treatmentVisitId");

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "appointments_patientId_clinicId_fkey"
    FOREIGN KEY ("patientId", "clinicId") REFERENCES "patients"("id", "clinicId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "appointments_treatmentVisitId_clinicId_patientId_fkey"
    FOREIGN KEY ("treatmentVisitId", "clinicId", "patientId")
    REFERENCES "treatment_visits"("id", "clinicId", "patientId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "appointments" ENABLE ROW LEVEL SECURITY;
