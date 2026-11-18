CREATE TYPE "PatientAppointmentCancellationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "patient_appointment_cancellation_requests" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "appointmentId" UUID NOT NULL,
  "reason" VARCHAR(500),
  "status" "PatientAppointmentCancellationStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedByUserId" UUID,
  "reviewedAt" TIMESTAMPTZ(6),
  "reviewerNotes" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "patient_appointment_cancellation_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pacr_clinic_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "pacr_patient_fkey"
    FOREIGN KEY ("patientId", "clinicId") REFERENCES "patients" ("id", "clinicId")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "pacr_appointment_fkey"
    FOREIGN KEY ("appointmentId", "clinicId", "patientId")
    REFERENCES "appointments" ("id", "clinicId", "patientId")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "pacr_reviewer_fkey"
    FOREIGN KEY ("reviewedByUserId", "clinicId")
    REFERENCES "clinic_memberships" ("userId", "clinicId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pacr_review_check"
    CHECK (
      ("status" = 'PENDING' AND "reviewedByUserId" IS NULL AND "reviewedAt" IS NULL)
      OR ("status" IN ('APPROVED', 'REJECTED') AND "reviewedByUserId" IS NOT NULL AND "reviewedAt" IS NOT NULL)
    )
);

CREATE INDEX "pacr_clinic_status_created_idx"
  ON "patient_appointment_cancellation_requests" ("clinicId", "status", "createdAt");
CREATE INDEX "pacr_clinic_appointment_idx"
  ON "patient_appointment_cancellation_requests" ("clinicId", "appointmentId");
CREATE UNIQUE INDEX "pacr_one_pending_per_appointment_idx"
  ON "patient_appointment_cancellation_requests" ("appointmentId")
  WHERE "status" = 'PENDING';

ALTER TABLE public.patient_appointment_cancellation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.patient_appointment_cancellation_requests
  FROM PUBLIC, anon, authenticated, service_role;
