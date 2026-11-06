CREATE TYPE "AppointmentRequestStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED'
);
CREATE TYPE "ClinicInvitationStatus" AS ENUM (
  'PENDING',
  'ACCEPTED',
  'REVOKED'
);
ALTER TYPE "MessageLogStatus" ADD VALUE 'AUTOMATIC_SEND_PENDING';
ALTER TYPE "MessageLogStatus" ADD VALUE 'SENT_AUTOMATICALLY';
ALTER TYPE "MessageLogStatus" ADD VALUE 'AUTOMATIC_SEND_FAILED';

ALTER TABLE "clinics"
  ADD COLUMN "automatedWhatsAppEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_profiles"
  ADD COLUMN "email" VARCHAR(254),
  ADD COLUMN "normalizedEmail" VARCHAR(254);
CREATE UNIQUE INDEX "user_profiles_normalizedEmail_key"
  ON "user_profiles"("normalizedEmail");

ALTER TABLE "clinics"
  ADD COLUMN "publicBookingSlug" VARCHAR(180),
  ADD COLUMN "publicBookingEnabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "clinics"
SET "publicBookingSlug" =
  COALESCE(
    NULLIF(trim(both '-' from lower(regexp_replace("name", '[^a-zA-Z0-9]+', '-', 'g'))), ''),
    'clinic'
  ) || '-' || left("id"::text, 8);

ALTER TABLE "clinics"
  ALTER COLUMN "publicBookingSlug" SET NOT NULL;
CREATE UNIQUE INDEX "clinics_publicBookingSlug_key"
  ON "clinics"("publicBookingSlug");

ALTER TABLE "patients"
  ADD COLUMN "email" VARCHAR(254),
  ADD COLUMN "normalizedEmail" VARCHAR(254),
  ADD COLUMN "portalAccessEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "portalAccessEnabledAt" TIMESTAMPTZ(6);
CREATE UNIQUE INDEX "patients_clinicId_normalizedEmail_key"
  ON "patients"("clinicId", "normalizedEmail");

CREATE TABLE "patient_data_export_audits" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "patient_data_export_audits_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "patient_data_export_audits_clinicId_patientId_createdAt_idx"
  ON "patient_data_export_audits"("clinicId", "patientId", "createdAt");
CREATE INDEX "patient_data_export_audits_clinicId_actorUserId_createdAt_idx"
  ON "patient_data_export_audits"("clinicId", "actorUserId", "createdAt");
ALTER TABLE "patient_data_export_audits"
  ADD CONSTRAINT "patient_data_export_audits_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "patient_data_export_audits_patientId_clinicId_fkey"
    FOREIGN KEY ("patientId", "clinicId") REFERENCES "patients"("id", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "patient_data_export_audits_actorUserId_clinicId_fkey"
    FOREIGN KEY ("actorUserId", "clinicId") REFERENCES "clinic_memberships"("userId", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "clinic_invitations" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "normalizedEmail" VARCHAR(254) NOT NULL,
  "role" "ClinicRole" NOT NULL DEFAULT 'STAFF',
  "status" "ClinicInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "invitedByUserId" UUID NOT NULL,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "acceptedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "clinic_invitations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "clinic_invitations_clinicId_status_expiresAt_idx"
  ON "clinic_invitations"("clinicId", "status", "expiresAt");
CREATE INDEX "clinic_invitations_normalizedEmail_status_expiresAt_idx"
  ON "clinic_invitations"("normalizedEmail", "status", "expiresAt");
CREATE UNIQUE INDEX "clinic_invitations_one_pending_email_per_clinic"
  ON "clinic_invitations"("clinicId", "normalizedEmail")
  WHERE "status" = 'PENDING';
ALTER TABLE "clinic_invitations"
  ADD CONSTRAINT "clinic_invitations_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "clinic_invitations_invitedByUserId_clinicId_fkey"
    FOREIGN KEY ("invitedByUserId", "clinicId") REFERENCES "clinic_memberships"("userId", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "clinic_dentists" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "clinic_dentists_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "clinic_dentists_id_clinicId_key"
  ON "clinic_dentists"("id", "clinicId");
CREATE UNIQUE INDEX "clinic_dentists_clinicId_name_key"
  ON "clinic_dentists"("clinicId", "name");
CREATE INDEX "clinic_dentists_clinicId_active_name_idx"
  ON "clinic_dentists"("clinicId", "active", "name");

CREATE TABLE "treatment_chairs" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "label" VARCHAR(80) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "treatment_chairs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "treatment_chairs_id_clinicId_key"
  ON "treatment_chairs"("id", "clinicId");
CREATE UNIQUE INDEX "treatment_chairs_clinicId_label_key"
  ON "treatment_chairs"("clinicId", "label");
CREATE INDEX "treatment_chairs_clinicId_active_label_idx"
  ON "treatment_chairs"("clinicId", "active", "label");

INSERT INTO "clinic_dentists" ("id", "clinicId", "name", "updatedAt")
SELECT gen_random_uuid(), "clinicId", "dentistName", CURRENT_TIMESTAMP
FROM "appointments"
GROUP BY "clinicId", "dentistName"
ON CONFLICT ("clinicId", "name") DO NOTHING;

INSERT INTO "treatment_chairs" ("id", "clinicId", "label", "updatedAt")
SELECT gen_random_uuid(), "clinicId", "chairLabel", CURRENT_TIMESTAMP
FROM "appointments"
GROUP BY "clinicId", "chairLabel"
ON CONFLICT ("clinicId", "label") DO NOTHING;

ALTER TABLE "appointments"
  ADD COLUMN "dentistId" UUID,
  ADD COLUMN "chairId" UUID;
CREATE UNIQUE INDEX "appointments_id_clinicId_patientId_key"
  ON "appointments"("id", "clinicId", "patientId");

UPDATE "appointments" AS a
SET "dentistId" = d."id"
FROM "clinic_dentists" AS d
WHERE d."clinicId" = a."clinicId" AND d."name" = a."dentistName";

UPDATE "appointments" AS a
SET "chairId" = c."id"
FROM "treatment_chairs" AS c
WHERE c."clinicId" = a."clinicId" AND c."label" = a."chairLabel";

CREATE INDEX "appointments_clinicId_dentistId_scheduledAt_idx"
  ON "appointments"("clinicId", "dentistId", "scheduledAt");
CREATE INDEX "appointments_clinicId_chairId_scheduledAt_idx"
  ON "appointments"("clinicId", "chairId", "scheduledAt");

ALTER TABLE "message_logs"
  ALTER COLUMN "senderUserId" DROP NOT NULL,
  ADD COLUMN "appointmentId" UUID,
  ADD COLUMN "automatedReminderKey" VARCHAR(180),
  ADD COLUMN "providerMessageId" VARCHAR(120),
  ADD COLUMN "deliveryFailureCode" VARCHAR(120),
  ADD COLUMN "deliveryAttemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastDeliveryAttemptAt" TIMESTAMPTZ(6);
CREATE UNIQUE INDEX "message_logs_clinicId_automatedReminderKey_key"
  ON "message_logs"("clinicId", "automatedReminderKey");
CREATE INDEX "message_logs_clinicId_appointmentId_idx"
  ON "message_logs"("clinicId", "appointmentId");
ALTER TABLE "message_logs"
  ADD CONSTRAINT "message_logs_appointmentId_clinicId_patientId_fkey"
    FOREIGN KEY ("appointmentId", "clinicId", "patientId")
    REFERENCES "appointments"("id", "clinicId", "patientId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "appointment_requests" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "patientName" VARCHAR(160) NOT NULL,
  "phoneNumber" VARCHAR(20) NOT NULL,
  "requestedAt" TIMESTAMPTZ(6) NOT NULL,
  "durationMinutes" INTEGER NOT NULL DEFAULT 30,
  "type" VARCHAR(160) NOT NULL,
  "dentistId" UUID,
  "chairId" UUID,
  "status" "AppointmentRequestStatus" NOT NULL DEFAULT 'PENDING',
  "notes" VARCHAR(1000),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "appointment_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "appointment_requests_duration_check" CHECK ("durationMinutes" BETWEEN 5 AND 480)
);

CREATE UNIQUE INDEX "appointment_requests_id_clinicId_key"
  ON "appointment_requests"("id", "clinicId");
CREATE INDEX "appointment_requests_clinicId_status_requestedAt_idx"
  ON "appointment_requests"("clinicId", "status", "requestedAt");

ALTER TABLE "clinic_dentists"
  ADD CONSTRAINT "clinic_dentists_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "treatment_chairs"
  ADD CONSTRAINT "treatment_chairs_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_dentistId_clinicId_fkey"
    FOREIGN KEY ("dentistId", "clinicId") REFERENCES "clinic_dentists"("id", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "appointments_chairId_clinicId_fkey"
    FOREIGN KEY ("chairId", "clinicId") REFERENCES "treatment_chairs"("id", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointment_requests"
  ADD CONSTRAINT "appointment_requests_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "appointment_requests_dentistId_clinicId_fkey"
    FOREIGN KEY ("dentistId", "clinicId") REFERENCES "clinic_dentists"("id", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "appointment_requests_chairId_clinicId_fkey"
    FOREIGN KEY ("chairId", "clinicId") REFERENCES "treatment_chairs"("id", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "clinic_dentists" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "treatment_chairs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "appointment_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "patient_data_export_audits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clinic_invitations" ENABLE ROW LEVEL SECURITY;
