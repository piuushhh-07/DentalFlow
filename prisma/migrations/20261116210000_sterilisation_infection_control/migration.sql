CREATE TYPE "SterilisationCycleResult" AS ENUM ('PENDING', 'PASS', 'FAIL');
CREATE TYPE "InstrumentPouchStatus" AS ENUM ('STERILE', 'USED', 'EXPIRED', 'QUARANTINED');
CREATE TYPE "InfectionControlRecordType" AS ENUM ('SURFACE_DISINFECTION', 'HAND_HYGIENE', 'PPE_CHECK', 'BIOMEDICAL_WASTE', 'SHARPS_DISPOSAL', 'INCIDENT', 'OTHER');

CREATE TABLE "sterilisation_cycles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "operatorUserId" UUID NOT NULL,
  "loadReference" VARCHAR(80) NOT NULL,
  "sterilizerName" VARCHAR(120) NOT NULL,
  "loadDescription" VARCHAR(500) NOT NULL,
  "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(6),
  "temperatureC" DECIMAL(5,2),
  "pressureBar" DECIMAL(5,2),
  "durationMinutes" INTEGER,
  "chemicalIndicatorPass" BOOLEAN,
  "biologicalIndicatorPass" BOOLEAN,
  "result" "SterilisationCycleResult" NOT NULL DEFAULT 'PENDING',
  "notes" VARCHAR(1000),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sterilisation_cycles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sterilisation_cycles_id_clinicId_key" ON "sterilisation_cycles"("id","clinicId");
CREATE UNIQUE INDEX "sterilisation_cycles_clinicId_loadReference_key" ON "sterilisation_cycles"("clinicId","loadReference");
CREATE INDEX "sterilisation_cycles_clinicId_result_startedAt_idx" ON "sterilisation_cycles"("clinicId","result","startedAt");
CREATE INDEX "sc_operator_clinic_idx" ON "sterilisation_cycles"("operatorUserId","clinicId");
ALTER TABLE "sterilisation_cycles" ADD CONSTRAINT "sterilisation_cycles_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sterilisation_cycles" ADD CONSTRAINT "sterilisation_cycles_operatorUserId_clinicId_fkey" FOREIGN KEY ("operatorUserId","clinicId") REFERENCES "clinic_memberships"("userId","clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "instrument_pouches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "cycleId" UUID NOT NULL,
  "usedByUserId" UUID,
  "pouchCode" VARCHAR(80) NOT NULL,
  "contents" VARCHAR(500) NOT NULL,
  "sterilisedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" DATE NOT NULL,
  "status" "InstrumentPouchStatus" NOT NULL DEFAULT 'STERILE',
  "usedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "instrument_pouches_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "instrument_pouches_clinicId_pouchCode_key" ON "instrument_pouches"("clinicId","pouchCode");
CREATE INDEX "instrument_pouches_clinicId_status_expiresAt_idx" ON "instrument_pouches"("clinicId","status","expiresAt");
CREATE INDEX "ip_cycle_clinic_idx" ON "instrument_pouches"("cycleId","clinicId");
CREATE INDEX "ip_user_clinic_idx" ON "instrument_pouches"("usedByUserId","clinicId");
ALTER TABLE "instrument_pouches" ADD CONSTRAINT "instrument_pouches_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "instrument_pouches" ADD CONSTRAINT "instrument_pouches_cycleId_clinicId_fkey" FOREIGN KEY ("cycleId","clinicId") REFERENCES "sterilisation_cycles"("id","clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "instrument_pouches" ADD CONSTRAINT "instrument_pouches_usedByUserId_clinicId_fkey" FOREIGN KEY ("usedByUserId","clinicId") REFERENCES "clinic_memberships"("userId","clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "infection_control_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "recordedByUserId" UUID NOT NULL,
  "recordType" "InfectionControlRecordType" NOT NULL,
  "area" VARCHAR(120) NOT NULL,
  "details" VARCHAR(2000) NOT NULL,
  "outcome" VARCHAR(500),
  "performedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "infection_control_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "infection_control_logs_clinicId_recordType_performedAt_idx" ON "infection_control_logs"("clinicId","recordType","performedAt");
CREATE INDEX "icl_recorder_clinic_idx" ON "infection_control_logs"("recordedByUserId","clinicId");
ALTER TABLE "infection_control_logs" ADD CONSTRAINT "infection_control_logs_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "infection_control_logs" ADD CONSTRAINT "infection_control_logs_recordedByUserId_clinicId_fkey" FOREIGN KEY ("recordedByUserId","clinicId") REFERENCES "clinic_memberships"("userId","clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;
