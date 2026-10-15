-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ClinicRole" AS ENUM ('OWNER', 'STAFF');

-- CreateEnum
CREATE TYPE "TreatmentType" AS ENUM ('ROOT_CANAL', 'CROWN', 'IMPLANT', 'BRACES', 'SCALING', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TreatmentPlanStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TreatmentVisitStatus" AS ENUM ('PENDING', 'REMINDER_SENT', 'CONFIRMED', 'RESCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_RESPONSE');

-- CreateEnum
CREATE TYPE "PreventiveRecallType" AS ENUM ('SIX_MONTH_CHECKUP', 'CLEANING', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PreventiveRecallStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('WHATSAPP');

-- CreateEnum
CREATE TYPE "MessageLogStatus" AS ENUM ('OPENED_IN_WHATSAPP');

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" UUID NOT NULL,
    "displayName" VARCHAR(120),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinics" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "phoneNumber" VARCHAR(20),
    "contactEmail" VARCHAR(254),
    "address" VARCHAR(400),
    "timeZone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    "onboardingUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "clinics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_memberships" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "ClinicRole" NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "clinic_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "fullName" VARCHAR(160) NOT NULL,
    "phoneNumber" VARCHAR(20) NOT NULL,
    "normalizedPhone" VARCHAR(16) NOT NULL,
    "whatsappOptIn" BOOLEAN NOT NULL DEFAULT false,
    "whatsappOptedInAt" TIMESTAMPTZ(6),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_plans" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "type" "TreatmentType" NOT NULL,
    "status" "TreatmentPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "totalVisits" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "treatment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_visits" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "treatmentPlanId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "visitNumber" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "TreatmentVisitStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMPTZ(6),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "treatment_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preventive_recalls" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "type" "PreventiveRecallType" NOT NULL,
    "customName" VARCHAR(160),
    "intervalMonths" INTEGER,
    "dueDate" DATE NOT NULL,
    "status" "PreventiveRecallStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "preventive_recalls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_logs" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "treatmentVisitId" UUID,
    "preventiveRecallId" UUID,
    "messageTemplateId" UUID,
    "senderUserId" UUID NOT NULL,
    "channel" "MessageChannel" NOT NULL DEFAULT 'WHATSAPP',
    "status" "MessageLogStatus" NOT NULL DEFAULT 'OPENED_IN_WHATSAPP',
    "recipientPhoneSnapshot" VARCHAR(20) NOT NULL,
    "templateNameSnapshot" VARCHAR(120),
    "messageSnapshot" TEXT NOT NULL,
    "openedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clinics_onboardingUserId_key" ON "clinics"("onboardingUserId");

-- CreateIndex
CREATE INDEX "clinics_name_idx" ON "clinics"("name");

-- CreateIndex
CREATE INDEX "clinic_memberships_clinicId_role_idx" ON "clinic_memberships"("clinicId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "clinic_memberships_userId_clinicId_key" ON "clinic_memberships"("userId", "clinicId");

-- CreateIndex
CREATE INDEX "patients_clinicId_fullName_idx" ON "patients"("clinicId", "fullName");

-- CreateIndex
CREATE UNIQUE INDEX "patients_id_clinicId_key" ON "patients"("id", "clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "patients_clinicId_normalizedPhone_key" ON "patients"("clinicId", "normalizedPhone");

-- CreateIndex
CREATE INDEX "treatment_plans_clinicId_status_idx" ON "treatment_plans"("clinicId", "status");

-- CreateIndex
CREATE INDEX "treatment_plans_clinicId_patientId_idx" ON "treatment_plans"("clinicId", "patientId");

-- CreateIndex
CREATE UNIQUE INDEX "treatment_plans_id_clinicId_key" ON "treatment_plans"("id", "clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "treatment_plans_id_clinicId_patientId_key" ON "treatment_plans"("id", "clinicId", "patientId");

-- CreateIndex
CREATE INDEX "treatment_visits_clinicId_status_dueDate_idx" ON "treatment_visits"("clinicId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "treatment_visits_clinicId_dueDate_idx" ON "treatment_visits"("clinicId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "treatment_visits_id_clinicId_key" ON "treatment_visits"("id", "clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "treatment_visits_id_clinicId_patientId_key" ON "treatment_visits"("id", "clinicId", "patientId");

-- CreateIndex
CREATE UNIQUE INDEX "treatment_visits_treatmentPlanId_visitNumber_key" ON "treatment_visits"("treatmentPlanId", "visitNumber");

-- CreateIndex
CREATE INDEX "preventive_recalls_clinicId_status_dueDate_idx" ON "preventive_recalls"("clinicId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "preventive_recalls_clinicId_patientId_idx" ON "preventive_recalls"("clinicId", "patientId");

-- CreateIndex
CREATE UNIQUE INDEX "preventive_recalls_id_clinicId_key" ON "preventive_recalls"("id", "clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "preventive_recalls_id_clinicId_patientId_key" ON "preventive_recalls"("id", "clinicId", "patientId");

-- CreateIndex
CREATE INDEX "message_templates_clinicId_isActive_idx" ON "message_templates"("clinicId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_id_clinicId_key" ON "message_templates"("id", "clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_clinicId_name_key" ON "message_templates"("clinicId", "name");

-- CreateIndex
CREATE INDEX "message_logs_clinicId_openedAt_idx" ON "message_logs"("clinicId", "openedAt");

-- CreateIndex
CREATE INDEX "message_logs_clinicId_patientId_openedAt_idx" ON "message_logs"("clinicId", "patientId", "openedAt");

-- CreateIndex
CREATE INDEX "message_logs_clinicId_senderUserId_openedAt_idx" ON "message_logs"("clinicId", "senderUserId", "openedAt");

-- AddForeignKey
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_onboardingUserId_fkey" FOREIGN KEY ("onboardingUserId") REFERENCES "user_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_memberships" ADD CONSTRAINT "clinic_memberships_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_memberships" ADD CONSTRAINT "clinic_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_patientId_clinicId_fkey" FOREIGN KEY ("patientId", "clinicId") REFERENCES "patients"("id", "clinicId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_visits" ADD CONSTRAINT "treatment_visits_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_visits" ADD CONSTRAINT "treatment_visits_treatmentPlanId_clinicId_patientId_fkey" FOREIGN KEY ("treatmentPlanId", "clinicId", "patientId") REFERENCES "treatment_plans"("id", "clinicId", "patientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preventive_recalls" ADD CONSTRAINT "preventive_recalls_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preventive_recalls" ADD CONSTRAINT "preventive_recalls_patientId_clinicId_fkey" FOREIGN KEY ("patientId", "clinicId") REFERENCES "patients"("id", "clinicId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_patientId_clinicId_fkey" FOREIGN KEY ("patientId", "clinicId") REFERENCES "patients"("id", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_treatmentVisitId_clinicId_patientId_fkey" FOREIGN KEY ("treatmentVisitId", "clinicId", "patientId") REFERENCES "treatment_visits"("id", "clinicId", "patientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_preventiveRecallId_clinicId_patientId_fkey" FOREIGN KEY ("preventiveRecallId", "clinicId", "patientId") REFERENCES "preventive_recalls"("id", "clinicId", "patientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_messageTemplateId_clinicId_fkey" FOREIGN KEY ("messageTemplateId", "clinicId") REFERENCES "message_templates"("id", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_senderUserId_clinicId_fkey" FOREIGN KEY ("senderUserId", "clinicId") REFERENCES "clinic_memberships"("userId", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep onboarding details and other business invariants valid independently
-- of the server-side form validation.
ALTER TABLE "clinics"
ADD CONSTRAINT "clinics_name_not_blank_check"
CHECK (length(trim("name")) > 0);

ALTER TABLE "clinics"
ADD CONSTRAINT "clinics_phone_india_check"
CHECK ("phoneNumber" IS NULL OR "phoneNumber" ~ '^\+91[6-9][0-9]{9}$');

ALTER TABLE "patients"
ADD CONSTRAINT "patients_whatsapp_consent_timestamp_check"
CHECK (NOT "whatsappOptIn" OR "whatsappOptedInAt" IS NOT NULL);

ALTER TABLE "patients"
ADD CONSTRAINT "patients_normalized_phone_india_check"
CHECK ("normalizedPhone" ~ '^\+91[0-9]{8,10}$');

ALTER TABLE "treatment_plans"
ADD CONSTRAINT "treatment_plans_total_visits_positive_check"
CHECK ("totalVisits" > 0);

ALTER TABLE "treatment_visits"
ADD CONSTRAINT "treatment_visits_visit_number_positive_check"
CHECK ("visitNumber" > 0);

ALTER TABLE "preventive_recalls"
ADD CONSTRAINT "preventive_recalls_interval_positive_check"
CHECK ("intervalMonths" IS NULL OR "intervalMonths" > 0);

ALTER TABLE "preventive_recalls"
ADD CONSTRAINT "preventive_recalls_custom_details_check"
CHECK (
    "type" <> 'CUSTOM'
    OR (
        "customName" IS NOT NULL
        AND length(trim("customName")) > 0
        AND "intervalMonths" IS NOT NULL
    )
);

ALTER TABLE "message_logs"
ADD CONSTRAINT "message_logs_exactly_one_related_record_check"
CHECK (("treatmentVisitId" IS NOT NULL) <> ("preventiveRecallId" IS NOT NULL));

-- Supabase browser roles receive no table access until explicit policies are
-- added. Application data access is server-only through Prisma.
ALTER TABLE "user_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clinics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clinic_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "patients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "treatment_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "treatment_visits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "preventive_recalls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_logs" ENABLE ROW LEVEL SECURITY;
