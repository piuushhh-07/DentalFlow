-- Create enums
CREATE TYPE "TreatmentCatalogStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER');
CREATE TYPE "FinancialEntryType" AS ENUM ('PAYMENT', 'DISCOUNT', 'REFUND');

-- Add finance columns to treatment plans
ALTER TABLE "treatment_plans"
  ADD COLUMN "catalogItemId" UUID,
  ADD COLUMN "estimatedAmount" DECIMAL(12,2),
  ADD COLUMN "finalAmount" DECIMAL(12,2),
  ADD COLUMN "discountAmount" DECIMAL(12,2),
  ADD COLUMN "currency" VARCHAR(16) NOT NULL DEFAULT 'INR';

-- Create treatment catalogue
CREATE TABLE "treatment_catalogue_items" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "defaultPrice" DECIMAL(12,2),
    "status" "TreatmentCatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "treatment_catalogue_items_pkey" PRIMARY KEY ("id")
);

-- Create financial entries
CREATE TABLE "treatment_financial_entries" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "treatmentPlanId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "entryType" "FinancialEntryType" NOT NULL,
    "paymentMethod" "PaymentMethod",
    "amount" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2),
    "reference" VARCHAR(120),
    "notes" TEXT,
    "receiptNumber" VARCHAR(40),
    "requestKey" UUID NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "paidAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "treatment_financial_entries_pkey" PRIMARY KEY ("id")
);

-- Unique indexes
CREATE UNIQUE INDEX "treatment_catalogue_items_id_clinicId_key"
  ON "treatment_catalogue_items"("id", "clinicId");
CREATE UNIQUE INDEX "treatment_catalogue_items_clinicId_name_key"
  ON "treatment_catalogue_items"("clinicId", "name");
CREATE UNIQUE INDEX "treatment_financial_entries_id_clinicId_key"
  ON "treatment_financial_entries"("id", "clinicId");
CREATE UNIQUE INDEX "treatment_financial_entries_clinicId_requestKey_key"
  ON "treatment_financial_entries"("clinicId", "requestKey");
CREATE UNIQUE INDEX "treatment_financial_entries_clinicId_receiptNumber_key"
  ON "treatment_financial_entries"("clinicId", "receiptNumber");

-- Query indexes
CREATE INDEX "treatment_catalogue_items_clinicId_status_name_idx"
  ON "treatment_catalogue_items"("clinicId", "status", "name");
CREATE INDEX "treatment_financial_entries_clinicId_treatmentPlanId_paidAt_idx"
  ON "treatment_financial_entries"("clinicId", "treatmentPlanId", "paidAt");
CREATE INDEX "treatment_financial_entries_clinicId_patientId_paidAt_idx"
  ON "treatment_financial_entries"("clinicId", "patientId", "paidAt");

-- Foreign keys
ALTER TABLE "treatment_plans"
  ADD CONSTRAINT "treatment_plans_catalogItemId_clinicId_fkey"
  FOREIGN KEY ("catalogItemId", "clinicId") REFERENCES "treatment_catalogue_items"("id", "clinicId") ON DELETE RESTRICT;

ALTER TABLE "treatment_financial_entries"
  ADD CONSTRAINT "treatment_financial_entries_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "treatment_financial_entries_patientId_clinicId_fkey"
  FOREIGN KEY ("patientId", "clinicId") REFERENCES "patients"("id", "clinicId") ON DELETE RESTRICT,
  ADD CONSTRAINT "treatment_financial_entries_treatmentPlanId_clinicId_fkey"
  FOREIGN KEY ("treatmentPlanId", "clinicId") REFERENCES "treatment_plans"("id", "clinicId") ON DELETE CASCADE,
  ADD CONSTRAINT "treatment_financial_entries_createdByUserId_clinicId_fkey"
  FOREIGN KEY ("createdByUserId", "clinicId") REFERENCES "clinic_memberships"("userId", "clinicId") ON DELETE RESTRICT;
