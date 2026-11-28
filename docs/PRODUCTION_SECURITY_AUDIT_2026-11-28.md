# DentalFlow Production Security Snapshot — 2026-11-28

**Environment inspected:** Supabase project `dentalflow-production`  
**Inspection type:** Read-only project metadata, role/grant catalog, RLS/policy catalog, migration ledger, Storage metadata, and security-advisor queries  
**Production changes:** None. No SQL writes, migrations, grants, policies, Auth settings, Storage objects, provider calls, or user records were modified or accessed.

## 1. Project and schema snapshot

- Project status: `ACTIVE_HEALTHY`.
- PostgreSQL: 17.12.
- Public tables returned by Supabase metadata: **69**.
- Tables with RLS enabled: **69 / 69**.
- Tables with RLS disabled: **0**.
- Public-schema policies: **3**.
- Storage-schema policies: **3**.
- Applied Prisma migration rows: **53**.
- Latest completed Prisma migration: `20261121150000_revoke_remaining_clinic_api_grants`.

The Supabase security advisor reports 66 `rls_enabled_no_policy` informational findings. These need to be interpreted together with effective table grants. No-policy tables are expected to be inaccessible through the Data API when the API roles have no table privileges; RLS enabled alone is not proof of isolation.

## 2. Billing Data API grants — **P0 BLOCKER**

A read-only effective-privilege check across the 28 clinic-data tables found that exactly three tables still have table-level privileges for all three Data API roles:

- `public.billing_plan_versions`
- `public.billing_payments`
- `public.clinic_subscriptions`

For each of these tables, `anon`, `authenticated`, and `service_role` have effective `SELECT`, `INSERT`, `UPDATE`, `DELETE`, and `TRUNCATE` privileges. The table ACLs also include `REFERENCES`, `TRIGGER`, and PostgreSQL 17 `MAINTAIN`.

The three public RLS policies in production are SELECT-only:

- `billing_plan_versions_read_available`: authenticated users may read rows where `availableForSale = true`.
- `billing_payments_read_owner`: authenticated owners may read payments belonging to their clinic.
- `clinic_subscriptions_read_owner`: authenticated owners may read subscriptions belonging to their clinic.

No public INSERT/UPDATE/DELETE policies were present for these tables in the inspected snapshot. This means the browser roles remain subject to RLS, but the table grants are broader than the server-only Prisma architecture requires. The `service_role` has `BYPASSRLS` and table privileges; it must remain server-only and secret.

The current master repository contains:

`prisma/migrations/20261125203000_revoke_billing_data_api_grants/migration.sql`

It revokes all privileges on these three tables from `anon`, `authenticated`, and `service_role`. The production Prisma migration ledger does **not** contain that migration: the latest completed migration is `20261121150000_revoke_remaining_clinic_api_grants`.

**Required action:** this migration is pending in production. Do not apply it automatically. Review it against the deployed application's actual Prisma connection role and any intended direct Data API use, then obtain explicit approval for a production migration window. After approval and application, rerun the exact grant query, billing browser-RLS tests, and guarded integration suite. Until then, the no-grants state is not verified in production.

This is an observed production configuration gap relative to current master, not evidence that a cross-clinic row read or write has already succeeded. RLS policies and the lack of write policies still constrain browser roles. The grant drift must nevertheless be closed before the P0 launch gate can pass.

## 3. Role and connection limitations

The read-only Supabase SQL tool session reported `current_user = postgres` and `session_user = postgres`. The role catalog showed:

- `anon` and `authenticated`: no superuser or BYPASSRLS attribute.
- `service_role`: BYPASSRLS, no login.
- `postgres`: BYPASSRLS, login.
- `authenticator`: login, no BYPASSRLS.

This describes the inspection session and database role catalog only. It does **not** establish which database role or connection path the deployed DentalFlow Prisma runtime uses. That must be verified separately from deployment configuration without exposing secrets.

## 4. Insurance Storage snapshot

The private bucket `dentalflow-insurance-private` exists in production:

- `public = false`.
- File-size limit: 10 MiB.
- Allowed MIME types: PDF, JPEG, PNG.

Three Storage policies were found on `storage.objects`: SELECT/read, INSERT/upload, and DELETE/cleanup, each gated by `can_access_insurance_storage_object`.

The helper `public.can_access_insurance_storage_object(object_name text, access_mode text)` is `SECURITY DEFINER`, sets an empty `search_path`, validates the four-part UUID/file path, and checks the caller's active non-revoked clinic membership and matching claim/document ownership. It is executable by `authenticated`, not `anon`; the Supabase security advisor flags it because authenticated users can call this SECURITY DEFINER function through the public RPC endpoint.

The helper appears to support the Storage policies, but direct RPC exposure needs a focused security review. Do not revoke or change it blindly because the Storage policies currently depend on it. No Storage objects were accessed or changed.

## 5. Supabase security-advisor findings

- **66** RLS-enabled tables with no policy (INFO): reconcile with the effective grants.
- **1** authenticated-executable SECURITY DEFINER function warning: `can_access_insurance_storage_object`.
- The same leaked-password protection warning was not present in the returned production security-advisor result.

## 6. Follow-up and safety boundary

1. Review the pending `20261125203000_revoke_billing_data_api_grants` migration and the deployed Prisma runtime role.
2. Obtain explicit approval before applying any production migration. Until approval, leave production unchanged.
3. Re-run effective grants and billing RLS tests after an approved migration.
4. Verify the actual deployed Prisma runtime role and connection path using configuration metadata, not secret values.
5. Test the Storage authorization helper through Storage and direct RPC paths with same-clinic, cross-clinic, malformed-path, revoked-member, and unknown-object cases.
6. Keep production payments, refunds, WhatsApp sends, scheduled live delivery, and production environment changes disabled without separate explicit approval.

This snapshot is read-only evidence, not a production tenant-isolation certification. The guarded two-clinic integration suite and independent review remain outstanding.
