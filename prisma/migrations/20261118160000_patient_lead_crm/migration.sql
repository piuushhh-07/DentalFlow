CREATE TYPE "PatientLeadStatus" AS ENUM ('NEW', 'CONTACTED', 'APPOINTMENT_BOOKED', 'LOST');
CREATE TYPE "PatientLeadSource" AS ENUM ('WALK_IN', 'PHONE_CALL', 'WEBSITE', 'REFERRAL', 'SOCIAL_MEDIA', 'OTHER');

CREATE TABLE "patient_leads" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "fullName" VARCHAR(160) NOT NULL,
  "phoneNumber" VARCHAR(20) NOT NULL,
  "normalizedPhone" VARCHAR(16) NOT NULL,
  "email" VARCHAR(254),
  "source" "PatientLeadSource" NOT NULL DEFAULT 'OTHER',
  "status" "PatientLeadStatus" NOT NULL DEFAULT 'NEW',
  "treatmentInterest" VARCHAR(160),
  "notes" TEXT,
  "whatsappOptIn" BOOLEAN NOT NULL DEFAULT false,
  "whatsappOptedInAt" TIMESTAMPTZ(6),
  "nextFollowUpAt" TIMESTAMPTZ(6),
  "lastContactedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "patient_leads_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "patient_leads_clinic_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "patient_leads_whatsapp_consent_check" CHECK (
    ("whatsappOptIn" = false AND "whatsappOptedInAt" IS NULL) OR
    ("whatsappOptIn" = true AND "whatsappOptedInAt" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "patient_leads_clinic_phone_key" ON "patient_leads"("clinicId", "normalizedPhone");
CREATE INDEX "patient_leads_clinic_status_followup_idx" ON "patient_leads"("clinicId", "status", "nextFollowUpAt");
CREATE INDEX "patient_leads_clinic_followup_idx" ON "patient_leads"("clinicId", "nextFollowUpAt");

-- Leads are accessed only through server-side Prisma after clinic owner checks.
ALTER TABLE public.patient_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.patient_leads FROM PUBLIC, anon, authenticated, service_role;
