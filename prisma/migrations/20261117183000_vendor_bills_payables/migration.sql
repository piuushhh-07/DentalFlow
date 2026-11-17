CREATE TYPE "VendorBillStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'VOID');

CREATE TABLE "vendor_bills" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "recordedByUserId" UUID NOT NULL,
  "vendorName" VARCHAR(160) NOT NULL,
  "invoiceNumber" VARCHAR(80),
  "description" VARCHAR(300) NOT NULL,
  "category" VARCHAR(80) NOT NULL,
  "billDate" DATE NOT NULL,
  "dueDate" DATE NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "status" "VendorBillStatus" NOT NULL DEFAULT 'OPEN',
  "notes" VARCHAR(1000),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "vendor_bills_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vendor_bills_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "vendor_bills_recordedByUserId_clinicId_fkey" FOREIGN KEY ("recordedByUserId","clinicId") REFERENCES "clinic_memberships"("userId","clinicId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "vendor_bills_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "vendor_bills_due_after_bill" CHECK ("dueDate" >= "billDate")
);
CREATE UNIQUE INDEX "vendor_bills_id_clinicId_key" ON "vendor_bills"("id","clinicId");
CREATE UNIQUE INDEX "vendor_bills_clinicId_vendorName_invoiceNumber_key" ON "vendor_bills"("clinicId","vendorName","invoiceNumber");
CREATE INDEX "vendor_bills_clinicId_status_dueDate_idx" ON "vendor_bills"("clinicId","status","dueDate");
CREATE INDEX "vendor_bills_clinicId_billDate_idx" ON "vendor_bills"("clinicId","billDate");

CREATE TABLE "vendor_bill_payments" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "billId" UUID NOT NULL,
  "recordedByUserId" UUID NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL,
  "paidAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reference" VARCHAR(120),
  "notes" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vendor_bill_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vendor_bill_payments_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "vendor_bill_payments_billId_clinicId_fkey" FOREIGN KEY ("billId","clinicId") REFERENCES "vendor_bills"("id","clinicId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "vendor_bill_payments_recordedByUserId_clinicId_fkey" FOREIGN KEY ("recordedByUserId","clinicId") REFERENCES "clinic_memberships"("userId","clinicId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "vendor_bill_payments_amount_positive" CHECK ("amount" > 0)
);
CREATE INDEX "vendor_bill_payments_clinicId_paidAt_idx" ON "vendor_bill_payments"("clinicId","paidAt");
CREATE INDEX "vendor_bill_payments_billId_clinicId_paidAt_idx" ON "vendor_bill_payments"("billId","clinicId","paidAt");
