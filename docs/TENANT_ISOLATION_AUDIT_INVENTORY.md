# Tenant isolation audit inventory

## Purpose

Provide a repeatable review plan for proving that one clinic cannot read or mutate another clinic's data. This is an audit worklist, not a claim that tenant isolation has been fully verified.

## Current evidence already present in the repository

- Shared server-side membership and role guards are documented in `docs/OWNER_STAFF_PERMISSION_MATRIX.md` and implemented through `requireClinicMembership` / `requireClinicRole`.
- `tests/integration/database-workflows.test.ts` contains synthetic two-clinic checks using authenticated Supabase clients and Prisma verification. It covers multiple patient, clinical, prescription, insurance, financial, and reporting paths.
- The integration test file explicitly refuses to run unless `DENTALFLOW_INTEGRATION_RUNNER=verified-disposable-supabase-target`; the supported entry point is `npm run test:integration`.
- Raw SQL has been identified in at least these repositories: `src/features/finance/lib/financial-report-repository.ts`, `src/features/follow-ups/lib/follow-up-repository.ts`, `src/features/reports/lib/report-repository.ts`, and `src/features/treatments/lib/treatment-finance.ts`. These require query-by-query review for clinic predicates and joins.
- Insurance document access also uses the private Supabase Storage bucket `dentalflow-insurance-private`; database row isolation alone does not prove object isolation.

## Audit inventory — complete before launch

| Surface | Required inventory | Required proof | Current state |
| --- | --- | --- | --- |
| Server Actions | Every exported action under `src/features/**/actions.ts`; record its clinic source, guard, role, and repository calls | Cross-clinic read/write tests at the action boundary, including forged clinic and record IDs | Not yet exhaustively inventoried |
| Server-rendered pages and loaders | Every clinic page and server component that reads tenant data | A user from clinic B cannot load clinic A records by changing route/query identifiers | Not yet exhaustively inventoried |
| Route handlers / API endpoints | Every `src/app/api/**/route.ts` handler, including cron and webhook routes | Correct authentication model; tenant scope derived from trusted server context, not caller-supplied clinic IDs | Not yet exhaustively inventoried |
| Prisma repositories | Every read, create, update, delete, aggregate, nested relation, and transaction | Clinic scope on the parent and all linked records; composite relations prevent cross-clinic links | Partially covered by integration tests |
| Raw SQL | Every `$queryRaw` / `$executeRaw` call, including CTEs, unions, joins, and subqueries | Clinic predicate applied to every tenant-owned source; adversarial two-clinic fixture returns only the selected clinic | Identified examples; not fully reviewed |
| Supabase browser / REST access | Every browser-client table operation and RPC | Authenticated Clinic B cannot select, insert, update, or delete Clinic A rows; policy behavior verified on disposable hosted Supabase | Partially covered; expand table/action matrix |
| Supabase Storage | Every bucket, upload/download/list/delete/sign operation and path builder | Cross-clinic object read/write/delete denied; malformed paths, wrong claim/document IDs, MIME/size constraints, and cleanup failures tested | Insurance bucket has targeted coverage; full inventory pending |
| Background jobs and integrations | Cron, WhatsApp, payment webhooks, scheduled tasks, and retries | Authentication before work; clinic ownership revalidated at execution; idempotency and stale-claim behavior tested | Selected WhatsApp and Razorpay cases covered |
| Membership lifecycle | Invite, role change, revoke, clinic switch, multi-clinic membership | Revocation and downgrade take effect on the next request; role is re-read server-side | Some focused tests exist; full action-level matrix pending |
| Database roles and RLS | Actual production-equivalent runtime role, grants, policies, and owner/bypass attributes | Two-clinic tests run with the same role and connection path used by the deployed app; direct REST and Prisma behavior both recorded | Production-equivalent role/policy verification outstanding |

## Review procedure

1. Enumerate files and exported entry points for each surface above. Keep a path, operation, clinic-identity source, authorization guard, and test reference for every entry.
2. Trace the clinic ID from the authenticated membership to the final database or Storage operation. Treat IDs from form data, URL parameters, client state, and cached objects as untrusted.
3. For every tenant-owned record, test both positive access within the clinic and negative access from a second clinic. Include read, create, update, and delete where the operation exists.
4. For linked records, attempt mismatched combinations (for example, a Clinic A patient with a Clinic B plan, claim, document, appointment, or payment).
5. Review every raw SQL statement independently. Parameterization prevents injection; it does not provide tenant isolation.
6. Run the disposable Supabase integration target with two independent authenticated clinic users and the production-equivalent runtime role. Record the exact environment/role characteristics without recording secrets.
7. Verify Storage policies against real bucket configuration and object paths. Do not infer object isolation from database RLS.
8. Record failures as blocking defects. Do not weaken assertions to accept silent no-ops unless the API contract explicitly defines that behavior.

## Exit criteria

- Every exported Server Action, route handler, server-side tenant read, raw SQL statement, browser table operation, and Storage operation has an inventory entry.
- Every tenant-owned operation has an explicit authorization/scope explanation and an appropriate two-clinic test or a documented reason it is not applicable.
- The disposable hosted integration suite passes with production-equivalent credentials and roles.
- RLS policies, grants, and runtime-role attributes have been inspected in the target environment.
- Independent review confirms that the inventory is complete and that no production migration or policy change was required merely to make the tests pass.

## Important limitations

This document records the current review plan and known evidence only. It does not certify production tenant isolation, prove that all routes/actions have been enumerated, or replace a production-equivalent integration run. No production database, policy, role, or environment setting is changed by this document.
