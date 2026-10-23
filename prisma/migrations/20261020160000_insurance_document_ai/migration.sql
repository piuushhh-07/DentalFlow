CREATE TYPE "InsuranceDocumentExtractionStatus" AS ENUM (
  'NOT_STARTED',
  'PROCESSING',
  'NEEDS_REVIEW',
  'FAILED'
);

ALTER TYPE "InsuranceActivityType" ADD VALUE 'DOCUMENT_EXTRACTION_COMPLETED';
ALTER TYPE "InsuranceActivityType" ADD VALUE 'DOCUMENT_EXTRACTION_FAILED';
ALTER TYPE "InsuranceActivityType" ADD VALUE 'CLAIM_SUMMARY_UPDATED';
ALTER TYPE "InsuranceActivityType" ADD VALUE 'CLAIM_SUMMARY_REVIEWED';
ALTER TYPE "InsuranceActivityType" ADD VALUE 'POLICY_QUESTION_ANSWERED';

ALTER TABLE "insurance_documents"
ADD COLUMN "extractionStatus" "InsuranceDocumentExtractionStatus"
  NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN "extractionData" JSONB,
ADD COLUMN "extractionIssues" JSONB,
ADD COLUMN "extractionCompletedAt" TIMESTAMPTZ(6),
ADD COLUMN "extractionModel" VARCHAR(120);

ALTER TABLE "insurance_claims"
ADD COLUMN "claimSummary" TEXT,
ADD COLUMN "claimSummaryFields" JSONB,
ADD COLUMN "claimSummarySources" JSONB,
ADD COLUMN "summaryReviewedAt" TIMESTAMPTZ(6),
ADD COLUMN "summaryReviewedById" UUID;

CREATE INDEX "insurance_documents_clinicId_extractionStatus_idx"
ON "insurance_documents"("clinicId", "extractionStatus");

ALTER TABLE "insurance_claims"
ADD CONSTRAINT "insurance_claims_summary_reviewer_clinicId_fkey"
FOREIGN KEY ("summaryReviewedById", "clinicId")
REFERENCES "clinic_memberships"("userId", "clinicId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "insurance_claims"
ADD CONSTRAINT "insurance_claims_summary_review_consistency_check"
CHECK (
  (
    "summaryReviewedAt" IS NULL
    AND "summaryReviewedById" IS NULL
  )
  OR (
    "summaryReviewedAt" IS NOT NULL
    AND "summaryReviewedById" IS NOT NULL
    AND length(btrim(COALESCE("claimSummary", ''))) > 0
  )
);
