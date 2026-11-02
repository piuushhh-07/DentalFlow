CREATE TYPE "OdontogramDentition" AS ENUM ('PERMANENT', 'PRIMARY');
CREATE TYPE "OdontogramEntryType" AS ENUM ('FINDING', 'TREATMENT');
CREATE TYPE "OdontogramFinding" AS ENUM (
  'HEALTHY',
  'DECAYED',
  'MISSING',
  'EXTRACTED',
  'RESTORED',
  'FRACTURED',
  'WORN',
  'IMPACTED',
  'SENSITIVE',
  'OTHER'
);
CREATE TYPE "OdontogramTreatmentStatus" AS ENUM (
  'EXISTING',
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED'
);
CREATE TYPE "OdontogramSurface" AS ENUM (
  'MESIAL',
  'DISTAL',
  'OCCLUSAL',
  'BUCCAL',
  'LINGUAL',
  'PALATAL',
  'INCISAL'
);

CREATE TABLE "odontogram_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "toothNumber" INTEGER NOT NULL,
  "dentition" "OdontogramDentition" NOT NULL,
  "entryType" "OdontogramEntryType" NOT NULL,
  "finding" "OdontogramFinding",
  "treatmentName" VARCHAR(160),
  "treatmentStatus" "OdontogramTreatmentStatus",
  "surfaces" "OdontogramSurface"[] NOT NULL DEFAULT ARRAY[]::"OdontogramSurface"[],
  "notes" VARCHAR(2000),
  "treatmentPlanId" UUID,
  "supersedesEntryId" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "odontogram_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "odontogram_entries_id_clinicId_patientId_key"
    UNIQUE ("id", "clinicId", "patientId"),
  CONSTRAINT "odontogram_entries_supersedesEntryId_clinicId_patientId_key"
    UNIQUE ("supersedesEntryId", "clinicId", "patientId"),
  CONSTRAINT "odontogram_entries_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "odontogram_entries_patientId_clinicId_fkey"
    FOREIGN KEY ("patientId", "clinicId") REFERENCES "patients"("id", "clinicId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "odontogram_entries_createdByUserId_clinicId_fkey"
    FOREIGN KEY ("createdByUserId", "clinicId")
    REFERENCES "clinic_memberships"("userId", "clinicId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "odontogram_entries_treatmentPlanId_clinicId_patientId_fkey"
    FOREIGN KEY ("treatmentPlanId", "clinicId", "patientId")
    REFERENCES "treatment_plans"("id", "clinicId", "patientId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "odontogram_entries_supersedesEntryId_clinicId_patientId_fkey"
    FOREIGN KEY ("supersedesEntryId", "clinicId", "patientId")
    REFERENCES "odontogram_entries"("id", "clinicId", "patientId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "odontogram_entries_fdi_tooth_check"
    CHECK (
      (
        "dentition" = 'PERMANENT'
        AND (
          "toothNumber" BETWEEN 11 AND 18
          OR "toothNumber" BETWEEN 21 AND 28
          OR "toothNumber" BETWEEN 31 AND 38
          OR "toothNumber" BETWEEN 41 AND 48
        )
      )
      OR (
        "dentition" = 'PRIMARY'
        AND (
          "toothNumber" BETWEEN 51 AND 55
          OR "toothNumber" BETWEEN 61 AND 65
          OR "toothNumber" BETWEEN 71 AND 75
          OR "toothNumber" BETWEEN 81 AND 85
        )
      )
    ),
  CONSTRAINT "odontogram_entries_entry_details_check"
    CHECK (
      (
        "entryType" = 'FINDING'
        AND "finding" IS NOT NULL
        AND "treatmentName" IS NULL
        AND "treatmentStatus" IS NULL
      )
      OR (
        "entryType" = 'TREATMENT'
        AND "finding" IS NULL
        AND "treatmentName" IS NOT NULL
        AND length(trim("treatmentName")) > 0
        AND "treatmentStatus" IS NOT NULL
      )
    ),
  CONSTRAINT "odontogram_entries_surfaces_count_check"
    CHECK (cardinality("surfaces") <= 7)
);

CREATE INDEX "odontogram_entries_clinicId_patientId_createdAt_idx"
  ON "odontogram_entries"("clinicId", "patientId", "createdAt");
CREATE INDEX "odontogram_entries_clinicId_patientId_toothNumber_createdAt_idx"
  ON "odontogram_entries"("clinicId", "patientId", "toothNumber", "createdAt");
CREATE INDEX "odontogram_entries_clinicId_treatmentPlanId_idx"
  ON "odontogram_entries"("clinicId", "treatmentPlanId");

ALTER TABLE "odontogram_entries" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "odontogram_entries"
  FROM PUBLIC, anon, authenticated, service_role;
