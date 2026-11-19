ALTER TABLE "patient_leads"
  ADD COLUMN "convertedPatientId" UUID;

ALTER TABLE "patient_leads"
  ADD CONSTRAINT "patient_leads_converted_patient_fkey"
  FOREIGN KEY ("convertedPatientId", "clinicId")
  REFERENCES "patients"("id", "clinicId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "patient_leads"
  ADD CONSTRAINT "patient_leads_conversion_state_check" CHECK (
    ("status" = 'CONVERTED' AND "convertedPatientId" IS NOT NULL) OR
    ("status" <> 'CONVERTED' AND "convertedPatientId" IS NULL)
  );

CREATE INDEX "patient_leads_clinic_converted_patient_idx"
  ON "patient_leads"("clinicId", "convertedPatientId");
