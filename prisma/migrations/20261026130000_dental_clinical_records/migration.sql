CREATE TYPE "ClinicalRecordAuditAction" AS ENUM (
  'CREATED',
  'UPDATED',
  'REVIEWED',
  'RECOMMENDATION'
);

CREATE TABLE "dental_clinical_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "visitId" UUID,
  "createdByUserId" UUID NOT NULL,
  "medicalHistory" TEXT,
  "dentalHistory" TEXT,
  "allergies" TEXT,
  "chiefComplaints" TEXT,
  "clinicalExamination" TEXT,
  "diagnosis" TEXT,
  "treatmentRecommendations" TEXT,
  "clinicalNotes" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dental_clinical_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dental_clinical_records_id_clinicId_patientId_key"
    UNIQUE ("id", "clinicId", "patientId"),
  CONSTRAINT "dental_clinical_records_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "dental_clinical_records_patientId_clinicId_fkey"
    FOREIGN KEY ("patientId", "clinicId") REFERENCES "patients"("id", "clinicId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "dental_clinical_records_visitId_clinicId_patientId_fkey"
    FOREIGN KEY ("visitId", "clinicId", "patientId") REFERENCES "treatment_visits"("id", "clinicId", "patientId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "dental_clinical_records_createdByUserId_clinicId_fkey"
    FOREIGN KEY ("createdByUserId", "clinicId")
    REFERENCES "clinic_memberships"("userId", "clinicId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "dental_clinical_record_findings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "recordId" UUID NOT NULL,
  "toothNumber" INTEGER,
  "dentition" "OdontogramDentition",
  "toothFindingLabel" VARCHAR(160),
  "summary" TEXT,
  "surfaces" "OdontogramSurface"[] NOT NULL DEFAULT ARRAY[]::"OdontogramSurface"[],
  "notes" TEXT,
  "relatedOdontogramEntryId" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dental_clinical_record_findings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dental_clinical_record_findings_id_clinicId_patientId_key"
    UNIQUE ("id", "clinicId", "patientId"),
  CONSTRAINT "dental_clinical_record_findings_recordId_clinicId_patientId_fkey"
    FOREIGN KEY ("recordId", "clinicId", "patientId")
    REFERENCES "dental_clinical_records"("id", "clinicId", "patientId")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "dental_clinical_record_findings_relatedOdontogramEntryId_clinicId_patientId_fkey"
    FOREIGN KEY ("relatedOdontogramEntryId", "clinicId", "patientId")
    REFERENCES "odontogram_entries"("id", "clinicId", "patientId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "dental_clinical_record_findings_surfaces_count_check"
    CHECK (cardinality("surfaces") <= 7)
);

CREATE TABLE "dental_clinical_record_audits" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "recordId" UUID NOT NULL,
  "action" "ClinicalRecordAuditAction" NOT NULL,
  "changedByUserId" UUID NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dental_clinical_record_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dental_clinical_record_audits_recordId_clinicId_patientId_fkey"
    FOREIGN KEY ("recordId", "clinicId", "patientId")
    REFERENCES "dental_clinical_records"("id", "clinicId", "patientId")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "dental_clinical_record_audits_changedByUserId_clinicId_fkey"
    FOREIGN KEY ("changedByUserId", "clinicId")
    REFERENCES "clinic_memberships"("userId", "clinicId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "dental_clinical_records_clinicId_patientId_createdAt_idx"
  ON "dental_clinical_records"("clinicId", "patientId", "createdAt");
CREATE INDEX "dental_clinical_records_clinicId_visitId_idx"
  ON "dental_clinical_records"("clinicId", "visitId");
CREATE INDEX "dental_clinical_record_findings_clinicId_patientId_toothNumber_idx"
  ON "dental_clinical_record_findings"("clinicId", "patientId", "toothNumber");
CREATE INDEX "dental_clinical_record_audits_clinicId_patientId_createdAt_idx"
  ON "dental_clinical_record_audits"("clinicId", "patientId", "createdAt");

ALTER TABLE "dental_clinical_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dental_clinical_record_findings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dental_clinical_record_audits" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "dental_clinical_records" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE "dental_clinical_record_findings" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE "dental_clinical_record_audits" FROM PUBLIC, anon, authenticated, service_role;
