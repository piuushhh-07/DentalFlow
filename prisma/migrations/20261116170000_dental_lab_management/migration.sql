CREATE TYPE "DentalLabOrderStatus" AS ENUM (
  'DRAFT',
  'SENT_TO_LAB',
  'ACCEPTED',
  'IN_PROGRESS',
  'READY',
  'DISPATCHED',
  'RECEIVED',
  'FITTED',
  'REMAKE_REQUESTED',
  'CANCELLED'
);

CREATE TABLE "dental_lab_partners" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "contactName" VARCHAR(120),
  "phone" VARCHAR(20),
  "email" VARCHAR(254),
  "address" VARCHAR(500),
  "notes" VARCHAR(1000),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "dental_lab_partners_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dental_lab_orders" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "partnerId" UUID NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "workType" VARCHAR(100) NOT NULL,
  "toothNumbers" VARCHAR(120),
  "material" VARCHAR(120),
  "shade" VARCHAR(40),
  "instructions" VARCHAR(2000),
  "status" "DentalLabOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "dueDate" DATE NOT NULL,
  "sentAt" TIMESTAMPTZ(6),
  "receivedAt" TIMESTAMPTZ(6),
  "quotedAmount" DECIMAL(12,2),
  "actualCost" DECIMAL(12,2),
  "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
  "trackingReference" VARCHAR(120),
  "remakeReason" VARCHAR(1000),
  "notes" VARCHAR(1000),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "dental_lab_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dental_lab_partners_id_clinicId_key" ON "dental_lab_partners"("id", "clinicId");
CREATE UNIQUE INDEX "dental_lab_partners_clinicId_name_key" ON "dental_lab_partners"("clinicId", "name");
CREATE INDEX "dental_lab_partners_clinicId_active_name_idx" ON "dental_lab_partners"("clinicId", "active", "name");
CREATE UNIQUE INDEX "dental_lab_orders_id_clinicId_key" ON "dental_lab_orders"("id", "clinicId");
CREATE INDEX "dental_lab_orders_clinicId_status_dueDate_idx" ON "dental_lab_orders"("clinicId", "status", "dueDate");
CREATE INDEX "dental_lab_orders_clinicId_patientId_createdAt_idx" ON "dental_lab_orders"("clinicId", "patientId", "createdAt");
CREATE INDEX "dental_lab_orders_clinicId_partnerId_status_idx" ON "dental_lab_orders"("clinicId", "partnerId", "status");
CREATE INDEX "dlo_patient_clinic_idx" ON "dental_lab_orders"("patientId", "clinicId");
CREATE INDEX "dlo_partner_clinic_idx" ON "dental_lab_orders"("partnerId", "clinicId");
CREATE INDEX "dlo_creator_clinic_idx" ON "dental_lab_orders"("createdByUserId", "clinicId");

ALTER TABLE "dental_lab_partners"
  ADD CONSTRAINT "dental_lab_partners_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dental_lab_orders"
  ADD CONSTRAINT "dental_lab_orders_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "dental_lab_orders_patientId_clinicId_fkey"
  FOREIGN KEY ("patientId", "clinicId") REFERENCES "patients"("id", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "dental_lab_orders_partnerId_clinicId_fkey"
  FOREIGN KEY ("partnerId", "clinicId") REFERENCES "dental_lab_partners"("id", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "dental_lab_orders_createdByUserId_clinicId_fkey"
  FOREIGN KEY ("createdByUserId", "clinicId") REFERENCES "clinic_memberships"("userId", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE;
