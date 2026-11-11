CREATE TABLE "clinic_expenses" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "recordedByUserId" UUID NOT NULL,
  "description" VARCHAR(200) NOT NULL,
  "category" VARCHAR(80) NOT NULL,
  "vendor" VARCHAR(160),
  "amount" DECIMAL(12,2) NOT NULL,
  "expenseDate" DATE NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'OTHER',
  "reference" VARCHAR(120),
  "notes" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clinic_expenses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinic_expenses_amount_positive_check" CHECK ("amount" > 0),
  CONSTRAINT "clinic_expenses_clinicId_fkey" FOREIGN KEY ("clinicId")
    REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "clinic_expenses_recordedByUserId_clinicId_fkey" FOREIGN KEY ("recordedByUserId", "clinicId")
    REFERENCES "clinic_memberships"("userId", "clinicId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "clinic_expenses_clinicId_expenseDate_idx" ON "clinic_expenses"("clinicId", "expenseDate");
CREATE INDEX "clinic_expenses_clinicId_category_expenseDate_idx" ON "clinic_expenses"("clinicId", "category", "expenseDate");
CREATE INDEX "fk_clinic_expenses_recorder_2c" ON "clinic_expenses"("recordedByUserId", "clinicId");

ALTER TABLE "clinic_expenses" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "clinic_expenses" FROM anon, authenticated, service_role;
