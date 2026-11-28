# DentalFlow Staging Security Snapshot — 2026-11-28

**Environment inspected:** Supabase project `dentalflow-staging` only  
**Inspection type:** Read-only metadata, advisor, and SQL catalog queries  
**Production impact:** None. The production project was not inspected or modified.  
**Purpose:** Record observed staging configuration and migration drift for the P0 tenant-isolation and database-readiness gates.

## 1. Project and schema snapshot

- Project status: `ACTIVE_HEALTHY`.
- PostgreSQL: 17.11.
- Public tables returned by Supabase metadata: **69**.
- Tables with RLS enabled: **69 / 69**.
- Tables with RLS disabled: **0**.
- Public-schema policies returned by `pg_policies`: **3**.
- Storage-schema policies returned by `pg_policies`: **3**.
- Applied Prisma migration rows: **53**.
- Latest completed Prisma migration in staging: `20261121150000_revoke_remaining_clinic_api_grants`.

The Supabase security advisor reports 66 tables with RLS enabled but no policies. This is not automatically a vulnerability when the Data API has no table privileges and application access is server-side Prisma. It must be interpreted together with effective grants and runtime-role access, not treated as proof of security by itself.

## 2. Billing Data API grant drift — **ACTION REQUIRED**

A read-only `has_table_privilege` check against the 28 clinic-data tables found that exactly three tables still have table-level privileges for all three API roles:

- `public.billing_plan_versions`
- `public.billing_payments`
- `public.clinic_subscriptions`

For each of those three tables, the staging ACL grants `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`, and the PostgreSQL 17 `MAINTAIN` privilege to `anon`, `authenticated`, and `service_role`.

The current public RLS policies on those tables are SELECT-only:

- `billing_plan_versions_read_available`: authenticated users may read rows where `availableForSale = true`.
- `billing_payments_read_owner`: authenticated owners may read payments belonging to a clinic where they have an OWNER membership.
- `clinic_subscriptions_read_owner`: authenticated owners may read subscriptions belonging to a clinic where they have an OWNER membership.

There are no public INSERT/UPDATE/DELETE policies on those three tables in the inspected staging snapshot. RLS therefore still constrains the browser roles, but the table-level grants are broader than the intended server-only Data API design. The `service_role` role has `BYPASSRLS` and direct privileges, as expected for the Supabase privileged role; it must remain server-only and secret.

The master repository contains:

`prisma/migrations/20261125203000_revoke_billing_data_api_grants/migration.sql`

That migration revokes all privileges on these three billing tables from `anon`, `authenticated`, and `service_role`. It is **not applied in staging**: the latest applied Prisma migration there is `20261121150000_revoke_remaining_clinic_api_grants`.

**Required next step:** review the pending migration and the expected server-side Prisma access model, then obtain explicit approval before applying it to staging. After an approved staging migration, rerun the exact grant query and the guarded disposable integration suite. Do not apply it to production as part of this audit.

This explains why the PR #213 test expectation has not yet been demonstrated against the current staging database. PR #213 remains completed test coverage; it is not hosted tenant-isolation verification.

## 3. Insurance Storage snapshot

The bucket `dentalflow-insurance-private` exists in staging and is configured:

- Private bucket (`public = false`).
- File-size limit: 10 MiB.
- Allowed MIME types: `application/pdf`, `image/jpeg`, `image/png`.

Three Storage policies were found on `storage.objects`:

- SELECT: bucket match plus `can_access_insurance_storage_object(name, 'read')`.
- INSERT: bucket match plus `can_access_insurance_storage_object(name, 'upload')`.
- DELETE: bucket match plus `can_access_insurance_storage_object(name, 'delete')`.

The helper function `public.can_access_insurance_storage_object(object_name text, access_mode text)` is `SECURITY DEFINER`, uses an empty `search_path`, validates the expected four-part UUID/file path, and checks the authenticated user's active, non-revoked clinic membership plus matching claim/document ownership. The function is executable by `authenticated`, not by `anon`, and the Supabase advisor reports it as a SECURITY DEFINER function callable through the public Data API RPC endpoint.

This function appears to support the Storage policies, but its direct RPC exposure should receive an explicit security review. Verify that callers can learn no more than a boolean access decision for paths they are already authorized to use. Do not revoke or change it blindly, because Storage policy evaluation currently depends on it.

The Storage metadata and policies were inspected; no real file was uploaded, downloaded, modified, or deleted.

## 4. Supabase advisor findings

Security advisor snapshot:

- **66** `rls_enabled_no_policy` informational findings. Reconcile with the table-grant inventory above.
- **1** `authenticated_security_definer_function_executable` warning for `public.can_access_insurance_storage_object`. Review the intentional Storage-policy dependency and public RPC surface.
- **1** `auth_leaked_password_protection` warning: leaked-password protection is disabled. Decide and configure this through the Auth dashboard only after reviewing product policy; no Auth setting was changed.

The performance advisor returned a large set of unused-index findings. Staging contains only a small amount of data, so these findings are not sufficient reason to drop indexes. Use production query statistics and representative load tests before any index removal.

## 5. What this snapshot does not prove

- It does not establish the actual Prisma runtime role or connection attributes used by the deployed application.
- It does not prove production schema, grants, RLS policies, Storage settings, or migration state.
- It does not execute the app through browser `anon` or `authenticated` JWTs.
- It does not run the guarded two-clinic disposable integration suite.
- It does not verify backups, restore, Storage-object recovery, or live provider behavior.
- It does not authorize applying any migration or changing any project setting.

## 6. Follow-up checklist

1. Review `20261125203000_revoke_billing_data_api_grants` and confirm it matches the server-only Prisma architecture.
2. Obtain approval before applying that migration to staging; verify effective grants afterward.
3. Run the guarded two-clinic integration suite against a verified disposable target with production-equivalent runtime roles.
4. Test the insurance Storage helper via Storage operations and direct RPC calls for same-clinic, cross-clinic, malformed-path, revoked-member, and unknown-object cases.
5. Decide whether the Storage authorization function should remain in the exposed `public` schema or move behind a safer non-exposed interface without breaking policy evaluation.
6. Review Auth leaked-password protection with product/security owners.
7. Repeat the same evidence collection against production only under a separately approved read-only audit; do not apply changes as part of that review.
