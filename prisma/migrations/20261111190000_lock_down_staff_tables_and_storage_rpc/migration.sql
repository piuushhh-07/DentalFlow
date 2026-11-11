-- Keep staff authorization data and Prisma's internal migration history
-- inaccessible through the Supabase Data API. Application access uses the
-- server-only Prisma connection after verified clinic membership checks.

ALTER TABLE public.clinic_staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_permission_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_staff_audits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.clinic_staff_profiles
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.clinic_permission_grants
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.clinic_staff_audits
  FROM PUBLIC, anon, authenticated, service_role;

-- Prisma Migrate accesses this table through the server-side database owner,
-- never through Supabase client roles.
ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."_prisma_migrations"
  FROM PUBLIC, anon, authenticated, service_role;

-- The insurance Storage policies invoke this helper as authenticated users.
-- The function validates auth.uid() and clinic membership itself. Anonymous
-- and service-role RPC execution is not required.
REVOKE ALL ON FUNCTION public.can_access_insurance_storage_object(text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_insurance_storage_object(text, text)
  TO authenticated;
