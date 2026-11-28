# Tenant Access Surface Catalog

**Baseline:** `master` after PR #213 (2026-11-28)  
**Purpose:** Enumerate the currently visible Server Action modules and API route handlers as the first step of the tenant-isolation audit. This is a static catalog, not an authorization review or tenant-isolation certification.

## Snapshot

The recursive Git tree for the baseline commit returned `truncated: false` and contained:

- **23** feature `actions.ts` modules.
- **91** exported action functions across those modules.
- **3** API route files with **5** HTTP handler exports (WhatsApp cron GET/POST, health GET, Razorpay webhook POST).

The export list below was extracted from the checked-in files. Guard markers were also searched statically, but their presence in a file does not prove that every exported action is guarded correctly. Each export still needs a per-action trace and positive/negative two-clinic test.

## Server Action module catalog

### Scheduling, access, and clinic setup

- `src/features/appointments/actions.ts` — 11 exports: `createScheduleResourceAction`, `renameScheduleResourceAction`, `setScheduleResourceActiveAction`, `createPublicBookingRequestAction`, `updatePublicBookingEnabledAction`, `approveAppointmentRequestAction`, `rejectAppointmentRequestAction`, `createAppointmentAction`, `updateAppointmentAction`, `updateAppointmentStatusAction`, `loadAppointmentOptionsAction`. Static guard markers: `requireClinicMembership`, `requireClinicRole`.
- `src/features/auth/actions.ts` — 5 exports: `signIn`, `signOut`, `inviteClinicStaffAction`, `removeClinicStaffAction`, `revokeClinicInvitationAction`. Static guard marker: `requireClinicRole` (staff administration); authentication actions use Supabase Auth.
- `src/features/onboarding/actions.ts` — 1 export: `createClinic`. Uses `getAuthenticatedUser` and checks existing memberships before onboarding; no `requireClinic*` marker is expected for a user who has not yet joined a clinic.
- `src/features/clinic-settings/actions.ts` — 1 export: `updateClinicProfile`. Static guard marker: `requireClinicRole`.
- `src/features/clinic-groups/actions.ts` — 4 exports: `createClinicGroup`, `addClinicGroupBranch`, `removeClinicGroupBranch`, `dissolveClinicGroup`. Static guard marker: `requireClinicRole`.
- `src/features/team/actions.ts` — 2 exports: `changeClinicMemberRole`, `removeClinicMember`. Static guard marker: `requireClinicRole`.

### Patient, clinical, and treatment workflows

- `src/features/patients/actions.ts` — 7 exports: `createPatient`, `updatePatient`, `deletePatient`, `archivePatient`, `restorePatient`, `requestPatientPortalMagicLink`, `signOutPatientPortal`. Static guard markers: `requireClinicMembership`, `requireClinicRole`; portal actions require separate session/ownership review.
- `src/features/clinical-records/actions.ts` — 1 export: `saveDentalClinicalRecordAction`. Static guard marker: `requireClinicMembership`.
- `src/features/odontogram/actions.ts` — 1 export: `recordOdontogramEntry`. Static guard marker: `requireClinicMembership`.
- `src/features/prescriptions/actions.ts` — 1 export: `createDigitalPrescriptionAction`. Static guard marker: `requireClinicRole`.
- `src/features/treatments/actions.ts` — 9 exports: `createTreatmentPlan`, `updateTreatmentPlan`, `updateTreatmentVisitStatus`, `rescheduleTreatmentVisit`, `cancelTreatmentPlan`, `recordFinancialEntry`, `saveTreatmentCatalogueItem`, `setTreatmentCatalogueStatus`, `updateTreatmentPlanFinancialDetails`. Static guard markers: `requireClinicMembership`, `requireClinicRole`.
- `src/features/estimates/actions.ts` — 2 exports: `createTreatmentEstimateAction`, `transitionTreatmentEstimateAction`. Static guard marker: `requireClinicRole`.
- `src/features/recalls/actions.ts` — 4 exports: `createRecall`, `updateRecall`, `rescheduleRecall`, `updateRecallStatus`. Static guard marker: `requireClinicMembership`.

### Insurance, finance, and business operations

- `src/features/insurance/actions.ts` — 17 exports: `createInsuranceProviderAction`, `updateInsuranceProviderAction`, `archiveInsuranceProviderAction`, `createInsurancePolicyAction`, `createInsuranceClaimAction`, `updateInsuranceClaimDetailsAction`, `updateInsuranceClaimStatusAction`, `scheduleInsuranceFollowUpAction`, `createInsurancePaymentAction`, `createInsurancePreAuthorizationAction`, `updateInsurancePreAuthorizationStatusAction`, `createInsuranceDocumentRequirementAction`, `registerInsuranceDocumentUploadAction`, `authorizeInsuranceDocumentUploadAction`, `completeInsuranceDocumentStorageCleanupAction`, `updateInsuranceDocumentStatusAction`, `getInsuranceDocumentPathAction`. Static guard markers: `requireClinicMembership`, `requireClinicRole`; document path and Storage operations require independent object-level review.
- `src/features/billing/actions.ts` — 3 exports: `startBillingCheckoutAction`, `cancelBillingSubscriptionAction`, `scheduleBillingPlanChangeAction`. Static guard marker: `requireClinicRole`.
- `src/features/finance/actions.ts` — 1 export: `closeCashRegister`. Static guard marker: `requireClinicRole`.
- `src/features/expenses/actions.ts` — 1 export: `createClinicExpense`. Static guard marker: `requireClinicRole`.
- `src/features/inventory/actions.ts` — 2 exports: `createInventoryItem`, `recordInventoryMovement`. Static guard marker: `requireClinicRole`.
- `src/features/leads/actions.ts` — 4 exports: `createPatientLead`, `updatePatientLead`, `convertPatientLeadToPatient`, `addPatientLeadActivity`. Static guard marker: `requireClinicRole`.

### Messaging and clinic support modules

- `src/features/messages/actions.ts` — 3 exports: `saveWhatsAppReminderTemplate`, `updateAutomatedWhatsAppAction`, `recordManuallySentWhatsAppReminder`. Static guard markers: `requireClinicMembership`, `requireClinicRole`.
- `src/features/dental-lab/actions.ts` — 3 exports: `createDentalLabPartner`, `createDentalLabOrder`, `updateDentalLabOrderStatus`. Static guard marker: `requireClinicRole`.
- `src/features/equipment/actions.ts` — 3 exports: `createClinicEquipment`, `recordEquipmentMaintenance`, `updateClinicEquipmentStatus`. Static guard marker: `requireClinicRole`.
- `src/features/sterilisation/actions.ts` — 5 exports: `createSterilisationCycle`, `recordSterilisationCycleResult`, `createInstrumentPouch`, `updateInstrumentPouchStatus`, `createInfectionControlLog`. Static guard marker: `requireClinicRole`.

## API route catalog

- `src/app/api/cron/whatsapp-reminders/route.ts` — `GET`, `POST`. The handler authenticates a bearer token before validating provider configuration; GET uses `CRON_SECRET`, POST uses `WHATSAPP_CRON_SECRET`. Verify scheduling, secret configuration, tenant ownership revalidation, retry semantics, and that live sends remain disabled in tests.
- `src/app/api/health/route.ts` — `GET`. Public read-only readiness probe using Prisma `SELECT 1`; it reports database readiness only and is not a full dependency-health check.
- `src/app/api/webhooks/razorpay/route.ts` — `POST`. Verifies Razorpay webhook signature and processes an event ID. Review signature/body handling, replay/idempotency, event-to-subscription tenant association, and provider reconciliation. PR #152 is still open and must not be treated as merged.

## Required audit work — not yet completed by this catalog

For **each of the 91 Server Action exports**:

1. Record the authenticated identity source and how the selected clinic ID is derived.
2. Record the exact guard and allowed role; distinguish authentication-only actions, public actions, and clinic-member actions.
3. Trace every form/query identifier to the final Prisma/SQL/Storage operation. Client-supplied clinic and record IDs are untrusted.
4. Review read, create, update, delete, aggregate, nested relation, and transaction predicates.
5. Add positive same-clinic and negative cross-clinic tests at the action boundary, including forged IDs and revoked/downgraded membership.
6. Record the exact test name and passing CI run; do not infer coverage from a guard import or a neighboring repository test.

For the **3 API routes**:

1. Verify authentication and authorization are appropriate to the route's trust model.
2. Verify clinic ownership is derived from trusted event/database state, not caller-supplied clinic IDs.
3. Test replay, duplicate delivery, timeout, retry, oversized/malformed input, and failure recovery.
4. Confirm provider side effects are mocked or disabled in automated tests.

Then extend the catalog to server-rendered pages/loaders, Prisma repositories, raw SQL, browser Supabase table/RPC access, Storage operations, and background jobs. The existing `docs/TENANT_ISOLATION_AUDIT_INVENTORY.md` remains the canonical exit-criteria document.

## Limitations

This document is a file/export inventory from a static repository snapshot. It does not prove that all runtime entry points are included, that every listed export has the correct guard, that every database query is tenant-scoped, or that hosted Supabase RLS/Storage policies behave as expected. It does not certify tenant isolation. The guarded disposable Supabase suite and production-equivalent role/policy inspection are still required.
