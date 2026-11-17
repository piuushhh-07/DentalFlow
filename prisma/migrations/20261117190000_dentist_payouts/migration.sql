CREATE TYPE "DentistPayoutStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID');

CREATE TABLE "dentist_payouts" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "dentistId" UUID NOT NULL,
  "recordedByUserId" UUID NOT NULL,
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "description" VARCHAR(240) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "status" "DentistPayoutStatus" NOT NULL DEFAULT 'OPEN',
  "notes" VARCHAR(1000),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "dentist_payouts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dentist_payouts_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "dentist_payouts_dentistId_clinicId_fkey" FOREIGN KEY ("dentistId","clinicId") REFERENCES "clinic_dentists"("id","clinicId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "dentist_payouts_recordedByUserId_clinicId_fkey" FOREIGN KEY ("recordedByUserId","clinicId") REFERENCES "clinic_memberships"("userId","clinicId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "dentist_payouts_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "dentist_payouts_period_valid" CHECK ("periodEnd" >= "periodStart")
);
CREATE UNIQUE INDEX "dentist_payouts_id_clinicId_key" ON "dentist_payouts"("id","clinicId");
CREATE UNIQUE INDEX "dentist_payouts_clinicId_dentistId_periodStart_periodEnd_key" ON "dentist_payouts"("clinicId","dentistId","periodStart","periodEnd");
CREATE INDEX "dentist_payouts_clinicId_status_periodEnd_idx" ON "dentist_payouts"("clinicId","status","periodEnd");
CREATE INDEX "dentist_payouts_clinicId_periodStart_periodEnd_idx" ON "dentist_payouts"("clinicId","periodStart","periodEnd");

CREATE TABLE "dentist_payout_payments" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "payoutId" UUID NOT NULL,
  "recordedByUserId" UUID NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL,
  "paidAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reference" VARCHAR(120),
  "notes" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dentist_payout_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dentist_payout_payments_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "dentist_payout_payments_payoutId_clinicId_fkey" FOREIGN KEY ("payoutId","clinicId") REFERENCES "dentist_payouts"("id","clinicId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "dentist_payout_payments_recordedByUserId_clinicId_fkey" FOREIGN KEY ("recordedByUserId","clinicId") REFERENCES "clinic_memberships"("userId","clinicId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "dentist_payout_payments_amount_positive" CHECK ("amount" > 0)
);
CREATE INDEX "dentist_payout_payments_clinicId_paidAt_idx" ON "dentist_payout_payments"("clinicId","paidAt");
CREATE INDEX "dentist_payout_payments_payoutId_clinicId_paidAt_idx" ON "dentist_payout_payments"("payoutId","clinicId","paidAt");
