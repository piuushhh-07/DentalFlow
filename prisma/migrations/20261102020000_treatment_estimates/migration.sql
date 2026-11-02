CREATE TYPE "TreatmentEstimateStatus" AS ENUM (
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CONVERTED'
);

CREATE TABLE "treatment_estimates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "treatmentPlanId" UUID NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "revisionOfEstimateId" UUID,
  "revisionReason" VARCHAR(1000),
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "TreatmentEstimateStatus" NOT NULL DEFAULT 'DRAFT',
  "estimateDate" DATE NOT NULL,
  "validityDate" DATE NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
  "subtotal" DECIMAL(12, 2) NOT NULL,
  "discountAmount" DECIMAL(12, 2) NOT NULL,
  "taxRate" DECIMAL(5, 2) NOT NULL,
  "taxAmount" DECIMAL(12, 2) NOT NULL,
  "totalAmount" DECIMAL(12, 2) NOT NULL,
  "notes" VARCHAR(4000),
  "terms" VARCHAR(4000),
  "clinicNameSnapshot" VARCHAR(160) NOT NULL,
  "clinicPhoneSnapshot" VARCHAR(20),
  "clinicEmailSnapshot" VARCHAR(254),
  "clinicAddressSnapshot" VARCHAR(400),
  "patientNameSnapshot" VARCHAR(160) NOT NULL,
  "patientPhoneSnapshot" VARCHAR(20) NOT NULL,
  "dentistNameSnapshot" VARCHAR(120) NOT NULL,
  "dentistRegistrationSnapshot" VARCHAR(100),
  "finalizedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "treatment_estimates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "treatment_estimates_id_clinicId_patientId_key"
    UNIQUE ("id", "clinicId", "patientId"),
  CONSTRAINT "treatment_estimates_id_clinicId_patientId_treatmentPlanId_key"
    UNIQUE ("id", "clinicId", "patientId", "treatmentPlanId"),
  CONSTRAINT "treatment_estimates_treatmentPlanId_version_key"
    UNIQUE ("treatmentPlanId", "version"),
  CONSTRAINT "treatment_estimates_revisionOfEstimateId_clinicId_patientId_key"
    UNIQUE ("revisionOfEstimateId", "clinicId", "patientId"),
  CONSTRAINT "treatment_estimates_revision_check"
    CHECK (
      ("revisionOfEstimateId" IS NULL AND "revisionReason" IS NULL)
      OR (
        "revisionOfEstimateId" IS NOT NULL
        AND "revisionReason" IS NOT NULL
        AND length(trim("revisionReason")) > 0
      )
    ),
  CONSTRAINT "treatment_estimates_dates_check"
    CHECK ("validityDate" >= "estimateDate"),
  CONSTRAINT "treatment_estimates_amounts_check"
    CHECK (
      "subtotal" >= 0
      AND "discountAmount" >= 0
      AND "discountAmount" <= "subtotal"
      AND "taxRate" >= 0
      AND "taxRate" <= 100
      AND "taxAmount" >= 0
      AND "taxAmount" = round(
        ("subtotal" - "discountAmount") * "taxRate" / 100,
        2
      )
      AND "totalAmount" = "subtotal" - "discountAmount" + "taxAmount"
    ),
  CONSTRAINT "treatment_estimates_version_check" CHECK ("version" > 0),
  CONSTRAINT "treatment_estimates_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "treatment_estimates_patientId_clinicId_fkey"
    FOREIGN KEY ("patientId", "clinicId") REFERENCES "patients"("id", "clinicId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "treatment_estimates_treatmentPlanId_clinicId_patientId_fkey"
    FOREIGN KEY ("treatmentPlanId", "clinicId", "patientId")
    REFERENCES "treatment_plans"("id", "clinicId", "patientId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "treatment_estimates_createdByUserId_clinicId_fkey"
    FOREIGN KEY ("createdByUserId", "clinicId")
    REFERENCES "clinic_memberships"("userId", "clinicId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "treatment_estimates_revisionOfEstimateId_clinicId_patientId_fkey"
    FOREIGN KEY ("revisionOfEstimateId", "clinicId", "patientId", "treatmentPlanId")
    REFERENCES "treatment_estimates"("id", "clinicId", "patientId", "treatmentPlanId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "treatment_estimate_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "estimateId" UUID NOT NULL,
  "catalogueItemId" UUID,
  "position" INTEGER NOT NULL,
  "description" VARCHAR(300) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(12, 2) NOT NULL,
  "lineTotal" DECIMAL(12, 2) NOT NULL,
  CONSTRAINT "treatment_estimate_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "treatment_estimate_lines_estimateId_position_key"
    UNIQUE ("estimateId", "position"),
  CONSTRAINT "treatment_estimate_lines_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "treatment_estimate_lines_price_check"
    CHECK ("unitPrice" >= 0 AND "lineTotal" = "unitPrice" * "quantity"),
  CONSTRAINT "treatment_estimate_lines_estimateId_clinicId_patientId_fkey"
    FOREIGN KEY ("estimateId", "clinicId", "patientId")
    REFERENCES "treatment_estimates"("id", "clinicId", "patientId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "treatment_estimate_lines_catalogueItemId_clinicId_fkey"
    FOREIGN KEY ("catalogueItemId", "clinicId")
    REFERENCES "treatment_catalogue_items"("id", "clinicId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "treatment_estimate_audits" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "estimateId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "actorNameSnapshot" VARCHAR(120),
  "action" VARCHAR(40) NOT NULL,
  "fromStatus" "TreatmentEstimateStatus",
  "toStatus" "TreatmentEstimateStatus",
  "note" VARCHAR(1000),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "treatment_estimate_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "treatment_estimate_audits_action_check"
    CHECK ("action" IN ('CREATED', 'REVISED', 'STATUS_CHANGED')),
  CONSTRAINT "treatment_estimate_audits_status_check"
    CHECK (
      ("action" IN ('CREATED', 'REVISED') AND "fromStatus" IS NULL AND "toStatus" = 'DRAFT')
      OR
      ("action" = 'STATUS_CHANGED' AND "fromStatus" IS NOT NULL AND "toStatus" IS NOT NULL)
    ),
  CONSTRAINT "treatment_estimate_audits_estimateId_clinicId_patientId_fkey"
    FOREIGN KEY ("estimateId", "clinicId", "patientId")
    REFERENCES "treatment_estimates"("id", "clinicId", "patientId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "treatment_estimate_audits_actorUserId_clinicId_fkey"
    FOREIGN KEY ("actorUserId", "clinicId")
    REFERENCES "clinic_memberships"("userId", "clinicId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "treatment_estimates_clinicId_patientId_createdAt_idx"
  ON "treatment_estimates"("clinicId", "patientId", "createdAt");
CREATE INDEX "treatment_estimates_clinicId_treatmentPlanId_status_idx"
  ON "treatment_estimates"("clinicId", "treatmentPlanId", "status");
CREATE INDEX "treatment_estimate_lines_clinicId_patientId_estimateId_idx"
  ON "treatment_estimate_lines"("clinicId", "patientId", "estimateId");
CREATE INDEX "treatment_estimate_audits_clinicId_patientId_estimateId_createdAt_idx"
  ON "treatment_estimate_audits"("clinicId", "patientId", "estimateId", "createdAt");

CREATE FUNCTION public.prevent_treatment_estimate_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Treatment estimates are append-only'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."finalizedAt" IS NULL
    AND NEW."finalizedAt" IS NOT NULL
    AND (to_jsonb(NEW) - 'finalizedAt') IS NOT DISTINCT FROM
        (to_jsonb(OLD) - 'finalizedAt')
  THEN
    RETURN NEW;
  END IF;

  IF OLD."finalizedAt" IS NOT NULL
    AND NEW."finalizedAt" IS NOT DISTINCT FROM OLD."finalizedAt"
    AND (to_jsonb(NEW) - 'status') IS NOT DISTINCT FROM
        (to_jsonb(OLD) - 'status')
    AND (
      (OLD."status" = 'DRAFT' AND NEW."status" = 'SENT')
      OR (OLD."status" = 'SENT' AND NEW."status" IN ('ACCEPTED', 'REJECTED', 'EXPIRED'))
      OR (OLD."status" = 'ACCEPTED' AND NEW."status" = 'CONVERTED')
    )
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Estimate content is immutable; create a revision instead'
    USING ERRCODE = '55000';
END;
$$;

CREATE FUNCTION public.prevent_treatment_estimate_child_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  estimate_finalized TIMESTAMPTZ(6);
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Estimate line items and audit history are append-only'
      USING ERRCODE = '55000';
  END IF;

  IF TG_TABLE_NAME = 'treatment_estimate_audits' THEN
    RETURN NEW;
  END IF;

  SELECT estimate."finalizedAt" INTO estimate_finalized
  FROM public.treatment_estimates estimate
  WHERE estimate."id" = NEW."estimateId"
    AND estimate."clinicId" = NEW."clinicId"
    AND estimate."patientId" = NEW."patientId";

  IF estimate_finalized IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot add rows to a finalized estimate'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.require_complete_treatment_estimate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  line_count BIGINT;
  line_subtotal NUMERIC;
  matching_audit BOOLEAN;
  current_finalized_at TIMESTAMPTZ(6);
  current_status "TreatmentEstimateStatus";
BEGIN
  SELECT estimate."finalizedAt", estimate."status"
    INTO current_finalized_at, current_status
  FROM public.treatment_estimates estimate
  WHERE estimate."id" = NEW."id"
    AND estimate."clinicId" = NEW."clinicId"
    AND estimate."patientId" = NEW."patientId";

  IF current_finalized_at IS NULL THEN
    RAISE EXCEPTION 'Treatment estimates must be finalized before commit'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*), COALESCE(sum(line."lineTotal"), 0)
    INTO line_count, line_subtotal
  FROM public.treatment_estimate_lines line
  WHERE line."estimateId" = NEW."id"
    AND line."clinicId" = NEW."clinicId"
    AND line."patientId" = NEW."patientId";

  IF line_count = 0 OR line_subtotal <> NEW."subtotal" THEN
    RAISE EXCEPTION 'Estimate lines must match the saved subtotal'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' OR OLD."finalizedAt" IS NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.treatment_estimate_audits audit
      WHERE audit."estimateId" = NEW."id"
        AND audit."clinicId" = NEW."clinicId"
        AND audit."patientId" = NEW."patientId"
        AND audit."action" = CASE
          WHEN NEW."revisionOfEstimateId" IS NULL THEN 'CREATED'
          ELSE 'REVISED'
        END
        AND audit."fromStatus" IS NULL
        AND audit."toStatus" = current_status
    ) INTO matching_audit;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.treatment_estimate_audits audit
      WHERE audit."estimateId" = NEW."id"
        AND audit."clinicId" = NEW."clinicId"
        AND audit."patientId" = NEW."patientId"
        AND audit."action" = 'STATUS_CHANGED'
        AND audit."fromStatus" = OLD."status"
        AND audit."toStatus" = current_status
    ) INTO matching_audit;
  END IF;

  IF NOT matching_audit THEN
    RAISE EXCEPTION 'Every estimate creation and status change requires an audit row'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "treatment_estimates_immutable"
BEFORE UPDATE OR DELETE ON "treatment_estimates"
FOR EACH ROW EXECUTE FUNCTION public.prevent_treatment_estimate_mutation();
CREATE TRIGGER "treatment_estimate_lines_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "treatment_estimate_lines"
FOR EACH ROW EXECUTE FUNCTION public.prevent_treatment_estimate_child_mutation();
CREATE TRIGGER "treatment_estimate_audits_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "treatment_estimate_audits"
FOR EACH ROW EXECUTE FUNCTION public.prevent_treatment_estimate_child_mutation();
CREATE CONSTRAINT TRIGGER "treatment_estimates_complete_before_commit"
AFTER INSERT OR UPDATE ON "treatment_estimates"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.require_complete_treatment_estimate();

ALTER TABLE "treatment_estimates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "treatment_estimate_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "treatment_estimate_audits" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "treatment_estimates" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE "treatment_estimate_lines" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE "treatment_estimate_audits" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_treatment_estimate_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_treatment_estimate_child_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.require_complete_treatment_estimate() FROM PUBLIC;
