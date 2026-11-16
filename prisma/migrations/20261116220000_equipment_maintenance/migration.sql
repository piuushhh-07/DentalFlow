CREATE TYPE "ClinicEquipmentType" AS ENUM ('DENTAL_CHAIR', 'AUTOCLAVE', 'COMPRESSOR', 'X_RAY', 'INTRAORAL_SCANNER', 'ULTRASONIC_SCALER', 'OTHER');
CREATE TYPE "ClinicEquipmentStatus" AS ENUM ('ACTIVE', 'OUT_OF_SERVICE', 'RETIRED');
CREATE TYPE "EquipmentMaintenanceType" AS ENUM ('SERVICE', 'REPAIR', 'CALIBRATION', 'INSPECTION', 'AMC_RENEWAL');

CREATE TABLE "clinic_equipment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "equipmentType" "ClinicEquipmentType" NOT NULL,
  "brand" VARCHAR(120),
  "model" VARCHAR(120),
  "serialNumber" VARCHAR(120),
  "location" VARCHAR(120),
  "purchaseDate" DATE,
  "warrantyUntil" DATE,
  "amcUntil" DATE,
  "nextServiceDue" DATE,
  "nextCalibrationDue" DATE,
  "status" "ClinicEquipmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes" VARCHAR(1000),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "clinic_equipment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "clinic_equipment_id_clinicId_key" ON "clinic_equipment"("id","clinicId");
CREATE UNIQUE INDEX "clinic_equipment_clinicId_serialNumber_key" ON "clinic_equipment"("clinicId","serialNumber");
CREATE INDEX "clinic_equipment_clinicId_status_name_idx" ON "clinic_equipment"("clinicId","status","name");
CREATE INDEX "clinic_equipment_clinicId_nextServiceDue_nextCalibrationDue_idx" ON "clinic_equipment"("clinicId","nextServiceDue","nextCalibrationDue");
ALTER TABLE "clinic_equipment" ADD CONSTRAINT "clinic_equipment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "equipment_maintenance_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "equipmentId" UUID NOT NULL,
  "recordedByUserId" UUID NOT NULL,
  "maintenanceType" "EquipmentMaintenanceType" NOT NULL,
  "serviceDate" DATE NOT NULL,
  "vendor" VARCHAR(160),
  "description" VARCHAR(2000) NOT NULL,
  "cost" DECIMAL(12,2),
  "reference" VARCHAR(120),
  "nextServiceDue" DATE,
  "nextCalibrationDue" DATE,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "equipment_maintenance_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "equipment_maintenance_records_clinicId_serviceDate_idx" ON "equipment_maintenance_records"("clinicId","serviceDate");
CREATE INDEX "equipment_maintenance_records_clinicId_equipmentId_serviceDate_idx" ON "equipment_maintenance_records"("clinicId","equipmentId","serviceDate");
CREATE INDEX "emr_recorder_clinic_idx" ON "equipment_maintenance_records"("recordedByUserId","clinicId");
ALTER TABLE "equipment_maintenance_records" ADD CONSTRAINT "equipment_maintenance_records_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "equipment_maintenance_records" ADD CONSTRAINT "equipment_maintenance_records_equipmentId_clinicId_fkey" FOREIGN KEY ("equipmentId","clinicId") REFERENCES "clinic_equipment"("id","clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "equipment_maintenance_records" ADD CONSTRAINT "equipment_maintenance_records_recordedByUserId_clinicId_fkey" FOREIGN KEY ("recordedByUserId","clinicId") REFERENCES "clinic_memberships"("userId","clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;
