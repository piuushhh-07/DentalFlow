-- Add India-specific policy metadata without inventing insurer benefits.
-- Existing policies remain NOT_VERIFIED until clinic staff review the actual policy wording.
ALTER TABLE "insurance_policies"
  ADD COLUMN "productName" VARCHAR(180),
  ADD COLUMN "uin" VARCHAR(80),
  ADD COLUMN "dentalCoverageStatus" VARCHAR(32) NOT NULL DEFAULT 'NOT_VERIFIED',
  ADD COLUMN "policyWordingReference" VARCHAR(500),
  ADD COLUMN "customerInformationSheetReceived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "preExistingWaitingMonths" SMALLINT,
  ADD COLUMN "specificWaitingMonths" SMALLINT;

ALTER TABLE "insurance_policies"
  ADD CONSTRAINT "insurance_policies_dental_coverage_status_check"
    CHECK ("dentalCoverageStatus" IN (
      'NOT_VERIFIED',
      'COVERED',
      'ACCIDENT_ONLY',
      'HOSPITALIZATION_ONLY',
      'OPD_ADDON',
      'EXCLUDED'
    )),
  ADD CONSTRAINT "insurance_policies_pre_existing_waiting_months_check"
    CHECK ("preExistingWaitingMonths" IS NULL OR "preExistingWaitingMonths" BETWEEN 0 AND 36),
  ADD CONSTRAINT "insurance_policies_specific_waiting_months_check"
    CHECK ("specificWaitingMonths" IS NULL OR "specificWaitingMonths" BETWEEN 0 AND 36);
