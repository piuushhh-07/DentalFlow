CREATE TYPE "DentistWorkingStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ON_LEAVE');
CREATE TYPE "StaffJobTitle" AS ENUM (
  'DENTIST',
  'RECEPTIONIST',
  'DENTAL_ASSISTANT',
  'CLINIC_MANAGER',
  'BILLING_STAFF'
);
CREATE TYPE "ClinicPermission" AS ENUM (
  'PATIENT_VIEW',
  'PATIENT_EDIT',
  'APPOINTMENT_MANAGE',
  'CLINICAL_RECORDS',
  'PRESCRIPTIONS',
  'TREATMENT_PLANS',
  'FINANCIAL_RECORDS',
  'INSURANCE',
  'INVENTORY',
  'REPORTS',
  'STAFF_MANAGE',
  'CLINIC_SETTINGS'
);

ALTER TABLE "clinic_memberships"
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "permissionsConfigured" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "clinic_invitations"
  ADD COLUMN "jobTitle" "StaffJobTitle" NOT NULL DEFAULT 'RECEPTIONIST';

CREATE TABLE "clinic_staff_profiles" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "jobTitle" "StaffJobTitle" NOT NULL DEFAULT 'RECEPTIONIST',
  "phoneNumber" VARCHAR(20),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "clinic_staff_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinic_staff_profiles_userId_clinicId_fkey"
    FOREIGN KEY ("userId", "clinicId")
    REFERENCES "clinic_memberships"("userId", "clinicId")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "clinic_staff_profiles_userId_clinicId_key"
  ON "clinic_staff_profiles"("userId", "clinicId");
CREATE INDEX "clinic_staff_profiles_clinicId_active_jobTitle_idx"
  ON "clinic_staff_profiles"("clinicId", "active", "jobTitle");

CREATE TABLE "clinic_permission_grants" (
  "clinicId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "permission" "ClinicPermission" NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinic_permission_grants_pkey"
    PRIMARY KEY ("userId", "clinicId", "permission"),
  CONSTRAINT "clinic_permission_grants_userId_clinicId_fkey"
    FOREIGN KEY ("userId", "clinicId")
    REFERENCES "clinic_memberships"("userId", "clinicId")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "clinic_permission_grants_clinicId_permission_idx"
  ON "clinic_permission_grants"("clinicId", "permission");

CREATE TABLE "clinic_staff_audits" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "targetUserId" UUID,
  "targetEmail" VARCHAR(254),
  "action" VARCHAR(40) NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinic_staff_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinic_staff_audits_actorUserId_clinicId_fkey"
    FOREIGN KEY ("actorUserId", "clinicId")
    REFERENCES "clinic_memberships"("userId", "clinicId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "clinic_staff_audits_targetUserId_clinicId_fkey"
    FOREIGN KEY ("targetUserId", "clinicId")
    REFERENCES "clinic_memberships"("userId", "clinicId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "clinic_staff_audits_clinicId_targetUserId_createdAt_idx"
  ON "clinic_staff_audits"("clinicId", "targetUserId", "createdAt");
CREATE INDEX "clinic_staff_audits_clinicId_actorUserId_createdAt_idx"
  ON "clinic_staff_audits"("clinicId", "actorUserId", "createdAt");

ALTER TABLE "clinic_dentists"
  ADD COLUMN "profilePhotoUrl" VARCHAR(500),
  ADD COLUMN "email" VARCHAR(254),
  ADD COLUMN "phoneNumber" VARCHAR(20),
  ADD COLUMN "qualifications" VARCHAR(500),
  ADD COLUMN "specialization" VARCHAR(160),
  ADD COLUMN "registrationNumber" VARCHAR(120),
  ADD COLUMN "registrationCouncil" VARCHAR(160),
  ADD COLUMN "yearsExperience" INTEGER,
  ADD COLUMN "biography" VARCHAR(3000),
  ADD COLUMN "consultationFee" DECIMAL(10, 2),
  ADD COLUMN "workingStatus" "DentistWorkingStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "weeklyAvailability" JSONB;

UPDATE "clinic_dentists"
SET "workingStatus" = CASE WHEN "active" THEN 'ACTIVE'::"DentistWorkingStatus" ELSE 'INACTIVE'::"DentistWorkingStatus" END;

CREATE INDEX "clinic_dentists_clinicId_workingStatus_name_idx"
  ON "clinic_dentists"("clinicId", "workingStatus", "name");
