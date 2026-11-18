CREATE TYPE "PatientLeadActivityType" AS ENUM ('CALL', 'WHATSAPP', 'NOTE', 'APPOINTMENT', 'OTHER');

CREATE UNIQUE INDEX "patient_leads_id_clinic_id_key"
  ON "patient_leads"("id", "clinicId");

CREATE TABLE "patient_lead_activities" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "leadId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "type" "PatientLeadActivityType" NOT NULL,
  "summary" VARCHAR(240) NOT NULL,
  "details" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "patient_lead_activities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "patient_lead_activities_lead_fkey"
    FOREIGN KEY ("leadId", "clinicId")
    REFERENCES "patient_leads"("id", "clinicId")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "patient_lead_activities_clinic_lead_created_idx"
  ON "patient_lead_activities"("clinicId", "leadId", "createdAt");
CREATE INDEX "patient_lead_activities_clinic_actor_created_idx"
  ON "patient_lead_activities"("clinicId", "actorUserId", "createdAt");

-- Activity records are accessed only through server-side Prisma after clinic owner checks.
ALTER TABLE public.patient_lead_activities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.patient_lead_activities FROM PUBLIC, anon, authenticated, service_role;
