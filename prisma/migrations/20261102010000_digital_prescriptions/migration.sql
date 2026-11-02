CREATE TABLE "prescription_medicine_catalogue_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "normalizedName" VARCHAR(200) NOT NULL,
  "strength" VARCHAR(120),
  "form" VARCHAR(80),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "prescription_medicine_catalogue_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "prescription_medicine_catalogue_items_id_clinicId_key"
    UNIQUE ("id", "clinicId"),
  CONSTRAINT "prescription_medicine_catalogue_items_clinicId_normalizedName_key"
    UNIQUE ("clinicId", "normalizedName"),
  CONSTRAINT "prescription_medicine_catalogue_items_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "prescription_medicine_catalogue_items_createdByUserId_clinicId_fkey"
    FOREIGN KEY ("createdByUserId", "clinicId")
    REFERENCES "clinic_memberships"("userId", "clinicId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "digital_prescriptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "visitId" UUID,
  "authorUserId" UUID NOT NULL,
  "amendsPrescriptionId" UUID,
  "amendmentReason" VARCHAR(1000),
  "prescriptionDate" DATE NOT NULL,
  "diagnosisNotes" VARCHAR(4000),
  "additionalAdvice" VARCHAR(4000),
  "followUpDate" DATE,
  "clinicNameSnapshot" VARCHAR(160) NOT NULL,
  "clinicPhoneSnapshot" VARCHAR(20),
  "clinicEmailSnapshot" VARCHAR(254),
  "clinicAddressSnapshot" VARCHAR(400),
  "authorNameSnapshot" VARCHAR(120) NOT NULL,
  "authorRegistrationSnapshot" VARCHAR(100),
  "authorConfirmedAt" TIMESTAMPTZ(6) NOT NULL,
  "finalizedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "digital_prescriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "digital_prescriptions_id_clinicId_patientId_key"
    UNIQUE ("id", "clinicId", "patientId"),
  CONSTRAINT "digital_prescriptions_amendsPrescriptionId_clinicId_patientId_key"
    UNIQUE ("amendsPrescriptionId", "clinicId", "patientId"),
  CONSTRAINT "digital_prescriptions_amendment_check"
    CHECK (
      ("amendsPrescriptionId" IS NULL AND "amendmentReason" IS NULL)
      OR (
        "amendsPrescriptionId" IS NOT NULL
        AND "amendmentReason" IS NOT NULL
        AND length(trim("amendmentReason")) > 0
      )
    ),
  CONSTRAINT "digital_prescriptions_follow_up_date_check"
    CHECK ("followUpDate" IS NULL OR "followUpDate" >= "prescriptionDate"),
  CONSTRAINT "digital_prescriptions_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "digital_prescriptions_patientId_clinicId_fkey"
    FOREIGN KEY ("patientId", "clinicId") REFERENCES "patients"("id", "clinicId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "digital_prescriptions_visitId_clinicId_patientId_fkey"
    FOREIGN KEY ("visitId", "clinicId", "patientId")
    REFERENCES "treatment_visits"("id", "clinicId", "patientId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "digital_prescriptions_authorUserId_clinicId_fkey"
    FOREIGN KEY ("authorUserId", "clinicId")
    REFERENCES "clinic_memberships"("userId", "clinicId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "digital_prescriptions_amendsPrescriptionId_clinicId_patientId_fkey"
    FOREIGN KEY ("amendsPrescriptionId", "clinicId", "patientId")
    REFERENCES "digital_prescriptions"("id", "clinicId", "patientId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "digital_prescription_medicines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "prescriptionId" UUID NOT NULL,
  "catalogueItemId" UUID,
  "position" INTEGER NOT NULL,
  "medicineName" VARCHAR(200) NOT NULL,
  "dosage" VARCHAR(160) NOT NULL,
  "route" VARCHAR(100) NOT NULL,
  "frequency" VARCHAR(160) NOT NULL,
  "duration" VARCHAR(120) NOT NULL,
  "quantity" VARCHAR(100) NOT NULL,
  "instructions" VARCHAR(1000),
  CONSTRAINT "digital_prescription_medicines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "digital_prescription_medicines_prescriptionId_position_key"
    UNIQUE ("prescriptionId", "position"),
  CONSTRAINT "digital_prescription_medicines_prescriptionId_clinicId_patientId_fkey"
    FOREIGN KEY ("prescriptionId", "clinicId", "patientId")
    REFERENCES "digital_prescriptions"("id", "clinicId", "patientId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "digital_prescription_medicines_catalogueItemId_clinicId_fkey"
    FOREIGN KEY ("catalogueItemId", "clinicId")
    REFERENCES "prescription_medicine_catalogue_items"("id", "clinicId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "digital_prescription_audits" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "prescriptionId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "action" VARCHAR(40) NOT NULL,
  "note" VARCHAR(1000),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "digital_prescription_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "digital_prescription_audits_action_check"
    CHECK ("action" IN ('CREATED', 'AMENDED')),
  CONSTRAINT "digital_prescription_audits_prescriptionId_clinicId_patientId_fkey"
    FOREIGN KEY ("prescriptionId", "clinicId", "patientId")
    REFERENCES "digital_prescriptions"("id", "clinicId", "patientId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "digital_prescription_audits_actorUserId_clinicId_fkey"
    FOREIGN KEY ("actorUserId", "clinicId")
    REFERENCES "clinic_memberships"("userId", "clinicId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "prescription_medicine_catalogue_items_clinicId_name_idx"
  ON "prescription_medicine_catalogue_items"("clinicId", "name");
CREATE INDEX "digital_prescriptions_clinicId_patientId_createdAt_idx"
  ON "digital_prescriptions"("clinicId", "patientId", "createdAt");
CREATE INDEX "digital_prescriptions_clinicId_visitId_idx"
  ON "digital_prescriptions"("clinicId", "visitId");
CREATE INDEX "digital_prescription_medicines_clinicId_patientId_prescriptionId_idx"
  ON "digital_prescription_medicines"("clinicId", "patientId", "prescriptionId");
CREATE INDEX "digital_prescription_audits_clinicId_patientId_createdAt_idx"
  ON "digital_prescription_audits"("clinicId", "patientId", "createdAt");

CREATE FUNCTION public.prevent_digital_prescription_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD."finalizedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Finalized prescriptions and their history are append-only'
      USING ERRCODE = '55000';
  END IF;

  IF NEW."finalizedAt" IS NULL
    OR (to_jsonb(NEW) - 'finalizedAt') IS DISTINCT FROM
       (to_jsonb(OLD) - 'finalizedAt')
  THEN
    RAISE EXCEPTION 'A prescription may only transition to its finalized state'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.prevent_finalized_prescription_child_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Prescription medicines and audit history are append-only'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.digital_prescriptions prescription
    WHERE prescription."id" = NEW."prescriptionId"
      AND prescription."clinicId" = NEW."clinicId"
      AND prescription."patientId" = NEW."patientId"
      AND prescription."finalizedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Cannot add rows to a finalized prescription'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.require_complete_digital_prescription()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW."finalizedAt" IS NOT NULL AND (
    NOT EXISTS (
      SELECT 1
      FROM public.digital_prescription_medicines medicine
      WHERE medicine."prescriptionId" = NEW."id"
        AND medicine."clinicId" = NEW."clinicId"
        AND medicine."patientId" = NEW."patientId"
    )
    OR NOT EXISTS (
      SELECT 1
      FROM public.digital_prescription_audits audit
      WHERE audit."prescriptionId" = NEW."id"
        AND audit."clinicId" = NEW."clinicId"
        AND audit."patientId" = NEW."patientId"
    )
  ) THEN
    RAISE EXCEPTION 'A finalized prescription requires medicine and audit rows'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "digital_prescriptions_immutable"
BEFORE UPDATE OR DELETE ON "digital_prescriptions"
FOR EACH ROW EXECUTE FUNCTION public.prevent_digital_prescription_mutation();
CREATE TRIGGER "digital_prescription_medicines_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "digital_prescription_medicines"
FOR EACH ROW EXECUTE FUNCTION public.prevent_finalized_prescription_child_mutation();
CREATE TRIGGER "digital_prescription_audits_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "digital_prescription_audits"
FOR EACH ROW EXECUTE FUNCTION public.prevent_finalized_prescription_child_mutation();
CREATE CONSTRAINT TRIGGER "digital_prescriptions_complete_before_commit"
AFTER INSERT OR UPDATE ON "digital_prescriptions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.require_complete_digital_prescription();

ALTER TABLE "prescription_medicine_catalogue_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "digital_prescriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "digital_prescription_medicines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "digital_prescription_audits" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "prescription_medicine_catalogue_items"
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE "digital_prescriptions"
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE "digital_prescription_medicines"
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE "digital_prescription_audits"
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_digital_prescription_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_finalized_prescription_child_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.require_complete_digital_prescription() FROM PUBLIC;
