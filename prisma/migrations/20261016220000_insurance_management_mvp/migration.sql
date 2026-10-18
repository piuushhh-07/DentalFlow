-- CreateEnum
CREATE TYPE "InsuranceProviderKind" AS ENUM ('INSURER', 'TPA', 'BOTH');

-- CreateEnum
CREATE TYPE "InsuranceClaimType" AS ENUM ('CASHLESS', 'REIMBURSEMENT');

-- CreateEnum
CREATE TYPE "InsuranceClaimStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_DOCUMENTS', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID', 'CLOSED');

-- CreateEnum
CREATE TYPE "InsurancePreAuthorizationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'NEEDS_DOCUMENTS', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InsuranceDocumentType" AS ENUM ('POLICY_COPY', 'TREATMENT_ESTIMATE', 'TREATMENT_PLAN', 'CLAIM_FORM', 'INVOICE', 'PRESCRIPTION', 'DIAGNOSTIC_REPORT', 'DISCHARGE_SUMMARY', 'OTHER');

-- CreateEnum
CREATE TYPE "InsuranceDocumentStatus" AS ENUM ('REQUIRED', 'RECEIVED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InsurancePaymentKind" AS ENUM ('PATIENT_PAYMENT', 'INSURER_PAYMENT');

-- CreateEnum
CREATE TYPE "InsuranceActivityType" AS ENUM ('CLAIM_CREATED', 'STATUS_CHANGED', 'CLAIM_UPDATED', 'FOLLOW_UP_SCHEDULED', 'PREAUTH_CREATED', 'PREAUTH_STATUS_CHANGED', 'DOCUMENT_REQUIRED', 'DOCUMENT_RECEIVED', 'DOCUMENT_VERIFIED', 'DOCUMENT_REJECTED', 'PAYMENT_RECORDED', 'NOTE_ADDED');

-- CreateTable
CREATE TABLE "insurance_providers" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "kind" "InsuranceProviderKind" NOT NULL,
    "phoneNumber" VARCHAR(20),
    "email" VARCHAR(254),
    "website" VARCHAR(400),
    "claimInstructions" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "insurance_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_policies" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "policyNumber" VARCHAR(120) NOT NULL,
    "memberReference" VARCHAR(120),
    "validFrom" DATE NOT NULL,
    "validUntil" DATE NOT NULL,
    "coverageLimit" DECIMAL(12,2),
    "deductible" DECIMAL(12,2),
    "coPaymentPercent" DECIMAL(5,2),
    "exclusions" TEXT,
    "coverageNotes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "insurance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_claims" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "policyId" UUID NOT NULL,
    "treatmentPlanId" UUID,
    "preAuthorizationId" UUID,
    "type" "InsuranceClaimType" NOT NULL,
    "status" "InsuranceClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "treatmentDetails" VARCHAR(2000) NOT NULL,
    "treatmentDate" DATE NOT NULL,
    "estimatedCost" DECIMAL(12,2) NOT NULL,
    "amountClaimed" DECIMAL(12,2) NOT NULL,
    "amountApproved" DECIMAL(12,2),
    "claimReference" VARCHAR(120),
    "submittedAt" TIMESTAMPTZ(6),
    "insurerRespondedAt" TIMESTAMPTZ(6),
    "followUpAt" TIMESTAMPTZ(6),
    "rejectionReason" TEXT,
    "notes" TEXT,
    "resubmissionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "insurance_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_pre_authorizations" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "policyId" UUID NOT NULL,
    "treatmentPlanId" UUID,
    "status" "InsurancePreAuthorizationStatus" NOT NULL DEFAULT 'DRAFT',
    "proposedTreatment" VARCHAR(2000) NOT NULL,
    "estimatedCost" DECIMAL(12,2) NOT NULL,
    "requestReference" VARCHAR(120),
    "submittedAt" TIMESTAMPTZ(6),
    "decidedAt" TIMESTAMPTZ(6),
    "approvedAmount" DECIMAL(12,2),
    "conditions" TEXT,
    "expiresAt" TIMESTAMPTZ(6),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "insurance_pre_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_payments" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "claimId" UUID NOT NULL,
    "recordedById" UUID NOT NULL,
    "kind" "InsurancePaymentKind" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAt" TIMESTAMPTZ(6) NOT NULL,
    "reference" VARCHAR(120),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insurance_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_documents" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "claimId" UUID NOT NULL,
    "type" "InsuranceDocumentType" NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "status" "InsuranceDocumentStatus" NOT NULL DEFAULT 'REQUIRED',
    "storagePath" VARCHAR(500),
    "receivedAt" TIMESTAMPTZ(6),
    "verifiedAt" TIMESTAMPTZ(6),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "insurance_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_activities" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "claimId" UUID,
    "preAuthorizationId" UUID,
    "actorUserId" UUID NOT NULL,
    "type" "InsuranceActivityType" NOT NULL,
    "summary" VARCHAR(240) NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insurance_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "insurance_providers_clinicId_archivedAt_name_idx" ON "insurance_providers"("clinicId", "archivedAt", "name");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_providers_id_clinicId_key" ON "insurance_providers"("id", "clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_providers_clinicId_name_key" ON "insurance_providers"("clinicId", "name");

-- CreateIndex
CREATE INDEX "insurance_policies_clinicId_patientId_validUntil_idx" ON "insurance_policies"("clinicId", "patientId", "validUntil");

-- CreateIndex
CREATE INDEX "insurance_policies_clinicId_providerId_idx" ON "insurance_policies"("clinicId", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_policies_id_clinicId_patientId_key" ON "insurance_policies"("id", "clinicId", "patientId");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_claims_preAuthorizationId_key" ON "insurance_claims"("preAuthorizationId");

-- CreateIndex
CREATE INDEX "insurance_claims_clinicId_status_createdAt_idx" ON "insurance_claims"("clinicId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "insurance_claims_clinicId_type_status_idx" ON "insurance_claims"("clinicId", "type", "status");

-- CreateIndex
CREATE INDEX "insurance_claims_clinicId_followUpAt_idx" ON "insurance_claims"("clinicId", "followUpAt");

-- CreateIndex
CREATE INDEX "insurance_claims_clinicId_patientId_createdAt_idx" ON "insurance_claims"("clinicId", "patientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_claims_id_clinicId_key" ON "insurance_claims"("id", "clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_claims_id_clinicId_patientId_key" ON "insurance_claims"("id", "clinicId", "patientId");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_claims_preAuthorizationId_clinicId_patientId_key" ON "insurance_claims"("preAuthorizationId", "clinicId", "patientId");

-- CreateIndex
CREATE INDEX "insurance_pre_authorizations_clinicId_status_createdAt_idx" ON "insurance_pre_authorizations"("clinicId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "insurance_pre_authorizations_clinicId_expiresAt_idx" ON "insurance_pre_authorizations"("clinicId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_pre_authorizations_id_clinicId_patientId_key" ON "insurance_pre_authorizations"("id", "clinicId", "patientId");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_pre_authorizations_id_clinicId_key" ON "insurance_pre_authorizations"("id", "clinicId");

-- CreateIndex
CREATE INDEX "insurance_payments_clinicId_claimId_kind_paidAt_idx" ON "insurance_payments"("clinicId", "claimId", "kind", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_documents_storagePath_key" ON "insurance_documents"("storagePath");

-- CreateIndex
CREATE INDEX "insurance_documents_clinicId_claimId_status_idx" ON "insurance_documents"("clinicId", "claimId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_documents_id_clinicId_claimId_key" ON "insurance_documents"("id", "clinicId", "claimId");

-- CreateIndex
CREATE INDEX "insurance_activities_clinicId_claimId_createdAt_idx" ON "insurance_activities"("clinicId", "claimId", "createdAt");

-- CreateIndex
CREATE INDEX "insurance_activities_clinicId_preAuthorizationId_createdAt_idx" ON "insurance_activities"("clinicId", "preAuthorizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "insurance_providers" ADD CONSTRAINT "insurance_providers_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_patientId_clinicId_fkey" FOREIGN KEY ("patientId", "clinicId") REFERENCES "patients"("id", "clinicId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_providerId_clinicId_fkey" FOREIGN KEY ("providerId", "clinicId") REFERENCES "insurance_providers"("id", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_patientId_clinicId_fkey" FOREIGN KEY ("patientId", "clinicId") REFERENCES "patients"("id", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_policyId_clinicId_patientId_fkey" FOREIGN KEY ("policyId", "clinicId", "patientId") REFERENCES "insurance_policies"("id", "clinicId", "patientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_treatmentPlanId_clinicId_patientId_fkey" FOREIGN KEY ("treatmentPlanId", "clinicId", "patientId") REFERENCES "treatment_plans"("id", "clinicId", "patientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_preAuthorizationId_clinicId_patientId_fkey" FOREIGN KEY ("preAuthorizationId", "clinicId", "patientId") REFERENCES "insurance_pre_authorizations"("id", "clinicId", "patientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_pre_authorizations" ADD CONSTRAINT "insurance_pre_authorizations_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_pre_authorizations" ADD CONSTRAINT "insurance_pre_authorizations_patientId_clinicId_fkey" FOREIGN KEY ("patientId", "clinicId") REFERENCES "patients"("id", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_pre_authorizations" ADD CONSTRAINT "insurance_pre_authorizations_policyId_clinicId_patientId_fkey" FOREIGN KEY ("policyId", "clinicId", "patientId") REFERENCES "insurance_policies"("id", "clinicId", "patientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_pre_authorizations" ADD CONSTRAINT "insurance_pre_authorizations_treatmentPlanId_clinicId_pati_fkey" FOREIGN KEY ("treatmentPlanId", "clinicId", "patientId") REFERENCES "treatment_plans"("id", "clinicId", "patientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_payments" ADD CONSTRAINT "insurance_payments_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_payments" ADD CONSTRAINT "insurance_payments_claimId_clinicId_fkey" FOREIGN KEY ("claimId", "clinicId") REFERENCES "insurance_claims"("id", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_payments" ADD CONSTRAINT "insurance_payments_recordedById_clinicId_fkey" FOREIGN KEY ("recordedById", "clinicId") REFERENCES "clinic_memberships"("userId", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_documents" ADD CONSTRAINT "insurance_documents_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_documents" ADD CONSTRAINT "insurance_documents_claimId_clinicId_fkey" FOREIGN KEY ("claimId", "clinicId") REFERENCES "insurance_claims"("id", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_activities" ADD CONSTRAINT "insurance_activities_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_activities" ADD CONSTRAINT "insurance_activities_claimId_clinicId_fkey" FOREIGN KEY ("claimId", "clinicId") REFERENCES "insurance_claims"("id", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_activities" ADD CONSTRAINT "insurance_activities_preAuthorizationId_clinicId_fkey" FOREIGN KEY ("preAuthorizationId", "clinicId") REFERENCES "insurance_pre_authorizations"("id", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_activities" ADD CONSTRAINT "insurance_activities_actorUserId_clinicId_fkey" FOREIGN KEY ("actorUserId", "clinicId") REFERENCES "clinic_memberships"("userId", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "insurance_providers"
ADD CONSTRAINT "insurance_providers_name_not_blank_check"
CHECK (length(btrim("name")) > 0);

ALTER TABLE "insurance_policies"
ADD CONSTRAINT "insurance_policies_validity_check"
CHECK ("validFrom" <= "validUntil");

ALTER TABLE "insurance_policies"
ADD CONSTRAINT "insurance_policies_financial_values_check"
CHECK (
  ("coverageLimit" IS NULL OR "coverageLimit" >= 0) AND
  ("deductible" IS NULL OR "deductible" >= 0) AND
  ("coPaymentPercent" IS NULL OR "coPaymentPercent" BETWEEN 0 AND 100)
);

ALTER TABLE "insurance_claims"
ADD CONSTRAINT "insurance_claims_amounts_check"
CHECK (
  "estimatedCost" > 0 AND
  "amountClaimed" > 0 AND
  ("amountApproved" IS NULL OR
    ("amountApproved" >= 0 AND "amountApproved" <= "amountClaimed"))
);

ALTER TABLE "insurance_claims"
ADD CONSTRAINT "insurance_claims_decision_consistency_check"
CHECK (
  ("status" <> 'APPROVED' OR
    ("amountApproved" IS NOT NULL AND "amountApproved" = "amountClaimed")) AND
  ("status" <> 'PARTIALLY_APPROVED' OR
    ("amountApproved" IS NOT NULL AND
     "amountApproved" > 0 AND "amountApproved" < "amountClaimed")) AND
  ("status" <> 'REJECTED' OR length(btrim(COALESCE("rejectionReason", ''))) > 0) AND
  ("status" <> 'PAID' OR
    ("amountApproved" IS NOT NULL AND "amountApproved" > 0))
);

ALTER TABLE "insurance_claims"
ADD CONSTRAINT "insurance_claims_resubmission_count_check"
CHECK ("resubmissionCount" >= 0);

ALTER TABLE "insurance_pre_authorizations"
ADD CONSTRAINT "insurance_pre_authorizations_amounts_check"
CHECK (
  "estimatedCost" > 0 AND
  ("approvedAmount" IS NULL OR
    ("approvedAmount" >= 0 AND "approvedAmount" <= "estimatedCost"))
);

ALTER TABLE "insurance_pre_authorizations"
ADD CONSTRAINT "insurance_pre_authorizations_decision_consistency_check"
CHECK (
  ("status" NOT IN ('APPROVED', 'PARTIALLY_APPROVED') OR
    ("approvedAmount" IS NOT NULL AND "approvedAmount" > 0)) AND
  ("status" <> 'APPROVED' OR
    ("approvedAmount" IS NOT NULL AND "approvedAmount" = "estimatedCost")) AND
  ("status" <> 'PARTIALLY_APPROVED' OR
    ("approvedAmount" IS NOT NULL AND "approvedAmount" < "estimatedCost")) AND
  ("status" <> 'REJECTED' OR length(btrim(COALESCE("rejectionReason", ''))) > 0)
);

ALTER TABLE "insurance_payments"
ADD CONSTRAINT "insurance_payments_positive_amount_check"
CHECK ("amount" > 0);

ALTER TABLE "insurance_documents"
ADD CONSTRAINT "insurance_documents_state_consistency_check"
CHECK (
  ("status" = 'REQUIRED' AND "storagePath" IS NULL AND "receivedAt" IS NULL AND "verifiedAt" IS NULL AND "rejectionReason" IS NULL) OR
  ("status" = 'RECEIVED' AND "storagePath" IS NOT NULL AND "receivedAt" IS NOT NULL AND "verifiedAt" IS NULL AND "rejectionReason" IS NULL) OR
  ("status" = 'VERIFIED' AND "storagePath" IS NOT NULL AND "receivedAt" IS NOT NULL AND "verifiedAt" IS NOT NULL AND "rejectionReason" IS NULL) OR
  ("status" = 'REJECTED' AND "storagePath" IS NOT NULL AND "receivedAt" IS NOT NULL AND "rejectionReason" IS NOT NULL AND length(btrim("rejectionReason")) > 0)
);

ALTER TABLE "insurance_activities"
ADD CONSTRAINT "insurance_activities_one_parent_check"
CHECK (("claimId" IS NOT NULL) <> ("preAuthorizationId" IS NOT NULL));

ALTER TABLE "insurance_providers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "insurance_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "insurance_claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "insurance_pre_authorizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "insurance_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "insurance_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "insurance_activities" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.prevent_insurance_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Insurance audit and payment records are immutable';
END;
$$;

CREATE TRIGGER "insurance_activities_immutable"
BEFORE UPDATE OR DELETE ON "insurance_activities"
FOR EACH ROW EXECUTE FUNCTION public.prevent_insurance_audit_mutation();

CREATE TRIGGER "insurance_payments_immutable"
BEFORE UPDATE OR DELETE ON "insurance_payments"
FOR EACH ROW EXECUTE FUNCTION public.prevent_insurance_audit_mutation();

CREATE OR REPLACE FUNCTION public.guard_insurance_payment_amount()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  approved_amount numeric(12, 2);
  claimed_amount numeric(12, 2);
  already_paid numeric(12, 2);
BEGIN
  SELECT c."amountApproved", c."amountClaimed"
  INTO approved_amount, claimed_amount
  FROM public.insurance_claims c
  WHERE c."id" = NEW."claimId"
    AND c."clinicId" = NEW."clinicId"
  FOR UPDATE;

  IF claimed_amount IS NULL THEN
    RAISE EXCEPTION 'Payment claim does not exist in this clinic';
  END IF;

  SELECT COALESCE(SUM(p."amount"), 0)
  INTO already_paid
  FROM public.insurance_payments p
  WHERE p."claimId" = NEW."claimId"
    AND p."clinicId" = NEW."clinicId"
    AND p."kind" = NEW."kind";

  IF NEW."kind" = 'INSURER_PAYMENT' THEN
    IF approved_amount IS NULL THEN
      RAISE EXCEPTION 'Insurer payments require a recorded approved amount';
    END IF;
    IF already_paid + NEW."amount" > approved_amount THEN
      RAISE EXCEPTION 'Insurer payments cannot exceed the approved amount';
    END IF;
  ELSIF already_paid + NEW."amount" > claimed_amount THEN
    RAISE EXCEPTION 'Patient payments cannot exceed the amount claimed';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "insurance_payments_amount_guard"
BEFORE INSERT ON "insurance_payments"
FOR EACH ROW EXECUTE FUNCTION public.guard_insurance_payment_amount();

CREATE OR REPLACE FUNCTION public.guard_insurance_claim_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  amount_paid numeric(12, 2);
BEGIN
  IF NEW."status" = 'SUBMITTED' THEN
    IF EXISTS (
      SELECT 1
      FROM public.insurance_documents document
      WHERE document."clinicId" = NEW."clinicId"
        AND document."claimId" = NEW."id"
        AND document."status" IN ('REQUIRED', 'REJECTED')
    ) THEN
      RAISE EXCEPTION 'All required claim documents must be received before submission';
    END IF;

    IF NEW."type" = 'REIMBURSEMENT' THEN
      SELECT COALESCE(SUM(payment."amount"), 0)
      INTO amount_paid
      FROM public.insurance_payments payment
      WHERE payment."clinicId" = NEW."clinicId"
        AND payment."claimId" = NEW."id"
        AND payment."kind" = 'PATIENT_PAYMENT';

      IF amount_paid < NEW."amountClaimed" THEN
        RAISE EXCEPTION 'Reimbursement claims require patient payment before submission';
      END IF;
    END IF;
  ELSIF NEW."status" = 'PAID' THEN
    IF NEW."amountApproved" IS NULL THEN
      RAISE EXCEPTION 'A claim cannot be marked paid before approval';
    END IF;

    SELECT COALESCE(SUM(payment."amount"), 0)
    INTO amount_paid
    FROM public.insurance_payments payment
    WHERE payment."clinicId" = NEW."clinicId"
      AND payment."claimId" = NEW."id"
      AND payment."kind" = 'INSURER_PAYMENT';

    IF amount_paid < NEW."amountApproved" THEN
      RAISE EXCEPTION 'Insurer payments must cover the approved amount before marking paid';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "insurance_claim_status_guard"
BEFORE UPDATE OF "status", "type", "amountClaimed", "amountApproved"
ON "insurance_claims"
FOR EACH ROW EXECUTE FUNCTION public.guard_insurance_claim_status();

INSERT INTO storage.buckets (
  "id",
  "name",
  "public",
  "file_size_limit",
  "allowed_mime_types"
)
VALUES (
  'dentalflow-insurance-private',
  'dentalflow-insurance-private',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
);

CREATE OR REPLACE FUNCTION public.can_access_insurance_storage_object(
  object_name text,
  access_mode text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  clinic_folder text := split_part(object_name, '/', 1);
  claim_folder text := split_part(object_name, '/', 2);
  document_folder text := split_part(object_name, '/', 3);
BEGIN
  IF array_length(string_to_array(object_name, '/'), 1) <> 4
    OR clinic_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR claim_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR document_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR split_part(object_name, '/', 4) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$'
  THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.clinic_memberships membership
    JOIN public.insurance_claims claim
      ON claim."clinicId" = membership."clinicId"
     AND claim."id" = claim_folder::uuid
    JOIN public.insurance_documents document
      ON document."clinicId" = claim."clinicId"
     AND document."claimId" = claim."id"
     AND document."id" = document_folder::uuid
    WHERE membership."userId" = auth.uid()
      AND membership."clinicId" = clinic_folder::uuid
      AND CASE access_mode
        WHEN 'read' THEN document."storagePath" = object_name
        WHEN 'upload' THEN document."status" IN ('REQUIRED', 'REJECTED')
        WHEN 'delete' THEN true
        ELSE false
      END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_insurance_storage_object(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_insurance_storage_object(text, text) TO authenticated;

CREATE POLICY "insurance_documents_private_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  "bucket_id" = 'dentalflow-insurance-private'
  AND public.can_access_insurance_storage_object("name", 'read')
);

CREATE POLICY "insurance_documents_private_upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  "bucket_id" = 'dentalflow-insurance-private'
  AND public.can_access_insurance_storage_object("name", 'upload')
);

CREATE POLICY "insurance_documents_private_cleanup"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  "bucket_id" = 'dentalflow-insurance-private'
  AND public.can_access_insurance_storage_object("name", 'delete')
);
