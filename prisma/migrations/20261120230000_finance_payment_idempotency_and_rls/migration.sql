ALTER TABLE "vendor_bill_payments"
  ADD COLUMN "idempotencyKey" UUID;

CREATE UNIQUE INDEX "vendor_bill_payments_clinicId_idempotencyKey_key"
  ON "vendor_bill_payments"("clinicId", "idempotencyKey");

ALTER TABLE "vendor_bills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vendor_bill_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cash_register_closes" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "vendor_bills" FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE "vendor_bill_payments" FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE "cash_register_closes" FROM anon, authenticated, service_role;
