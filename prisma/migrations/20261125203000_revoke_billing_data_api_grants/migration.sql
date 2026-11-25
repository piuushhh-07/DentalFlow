-- Billing records are accessed through server-side Prisma only.
-- Supabase browser/server clients are used for Auth and Storage, not the
-- public Data API. Keep the billing RLS policies as defense in depth, but
-- remove Data API table privileges from all API roles.
REVOKE ALL PRIVILEGES ON TABLE
  public.billing_plan_versions,
  public.clinic_subscriptions,
  public.billing_payments
FROM anon, authenticated, service_role;
