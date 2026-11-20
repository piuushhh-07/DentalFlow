-- Keep clinic operational data accessible only through the authenticated,
-- clinic-scoped server-side Prisma paths. These tables are not queried directly
-- through the Supabase Data API in the application.
--
-- RLS is enabled as defense in depth. No client-role policies are created:
-- anon/authenticated/service_role must not bypass the application's membership
-- and permission checks. The application database connection uses the
-- server-side database role, not the Supabase Data API roles.

ALTER TABLE "dental_lab_partners" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dental_lab_orders" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "inventory_suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_purchase_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_purchase_order_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_batches" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "sterilisation_cycles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "instrument_pouches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "infection_control_logs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "clinic_equipment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "equipment_maintenance_records" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "dentist_payouts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dentist_payout_payments" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "dental_lab_partners" FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE "dental_lab_orders" FROM anon, authenticated, service_role;

REVOKE ALL ON TABLE "inventory_suppliers" FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE "inventory_purchase_orders" FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE "inventory_purchase_order_lines" FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE "inventory_batches" FROM anon, authenticated, service_role;

REVOKE ALL ON TABLE "sterilisation_cycles" FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE "instrument_pouches" FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE "infection_control_logs" FROM anon, authenticated, service_role;

REVOKE ALL ON TABLE "clinic_equipment" FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE "equipment_maintenance_records" FROM anon, authenticated, service_role;

REVOKE ALL ON TABLE "dentist_payouts" FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE "dentist_payout_payments" FROM anon, authenticated, service_role;
