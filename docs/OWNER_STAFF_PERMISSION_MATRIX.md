# OWNER / STAFF permission matrix

This matrix defines the least-privilege baseline for clinic membership roles. Authorization must be enforced in Server Actions and server-side data access; hiding a button is not authorization. A submitted `role`, `userId`, or `clinicId` is never proof of permission.

## Role definitions

- **OWNER**: clinic administrator and accountable owner. Can perform ordinary clinic workflows and owner-only administration.
- **STAFF**: clinic operator. Can perform routine patient, scheduling, clinical, follow-up, and claim-processing work, but cannot administer clinic access, subscription settings, or irreversible patient deletion.

## Permission matrix

| Capability                                                              | OWNER | STAFF | Enforcement notes                                                                                                                                                     |
|-----------------------------------------------------------------------|----:|----:|---------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Open clinic workspace and read clinic records                           | Allow | Allow | Require an active membership for the requested clinic on every server read.                                                                                           |
| Create and update patient demographics / contact details                | Allow | Allow | Scope every query by the verified clinic ID.                                                                                                                          |
| Delete a patient                                                        | Allow | Deny  | OWNER-only. This is now enforced in `deletePatient`; retain clinical-history safeguards. Prefer archival/retention workflows over deletion for real clinical records. |
| Read/update medical history and odontogram                              | Allow | Allow | Membership required; preserve actor attribution and record history.                                                                                                   |
| Create/update treatment plans and visits; reschedule/cancel visits      | Allow | Allow | Membership required; verify patient, plan, and visit all belong to the same clinic.                                                                                   |
| Create and amend prescriptions                                          | Allow | Allow | Existing action explicitly requires OWNER or STAFF; retain author identity and amendment history.                                                                     |
| Create/update estimates and record financial entries                    | Allow | Allow | Existing estimate action accepts OWNER/STAFF; financial operations need immutable/auditable corrections.                                                              |
| Create/update appointments and status                                   | Allow | Allow | Membership required; patient and linked visit must be clinic-scoped.                                                                                                  |
| Manage recalls and follow-ups                                           | Allow | Allow | Membership required; prevent cross-clinic patient/recall IDs.                                                                                                         |
| Process insurance policies, claims, documents, and payments             | Allow | Allow | Membership required; private document access must independently enforce clinic and document ownership.                                                                |
| Record consent-gated manual WhatsApp reminders                          | Allow | Allow | Membership required; never represent a manual confirmation as provider-verified delivery.                                                                             |
| Edit/reset clinic WhatsApp templates                                    | Allow | Deny  | Existing action is OWNER-only.                                                                                                                                        |
| Manage clinic treatment catalogue / activate or archive catalogue items | Allow | Deny  | Existing catalogue status action is OWNER-only.                                                                                                                       |
| Manage staff membership, role assignments, invitations, and offboarding | Allow | Deny  | Owner-only when implemented; protect last-owner and self-removal cases. No assumption that a UI-only control is secure.                                               |
| Manage subscription, plan, and billing settings                         | Allow | Deny  | Existing billing actions are designed as OWNER-only. Webhooks remain server-to-server and are not clinic-role actions.                                                |
| Platform-wide administration or support access                          | Deny  | Deny  | Neither clinic role grants platform-operator privileges. Use a separate audited support identity/workflow if introduced.                                              |

## Implementation status and guardrails

- The shared server guards are `requireClinicMembership` and `requireClinicRole`. Use the latter for owner-only actions.
- Patient deletion previously used membership-only authorization. The current security branch changes this action to `requireClinicRole(clinicId, [ClinicRole.OWNER])`.
- Keep ordinary clinical and operational workflows available to both roles; do not accidentally make STAFF unable to perform normal clinic work.
- Never trust a role supplied in FormData, URL parameters, client state, or a cached page. Re-read membership server-side for each mutation.
- A user can have different roles in different clinics. Authorization must be evaluated for the specific clinic on every request.
- Treat access denial as a hard stop. Do not catch and downgrade authorization failures into a successful/no-op mutation.

## Required automated checks

1. OWNER can perform every OWNER/STAFF capability.
2. STAFF can perform routine clinic workflows but is denied patient deletion, template administration, catalogue administration, membership administration, and billing administration.
3. A STAFF user cannot elevate their role by submitting `role=OWNER`.
4. A user who is OWNER in clinic A but STAFF (or not a member) in clinic B receives only clinic B's permissions.
5. Membership removal or role downgrade takes effect on the next server action.
6. The last OWNER cannot be removed or demoted without first assigning another OWNER.
7. Tests call Server Actions or their authorization boundary, not only UI visibility.

This matrix is the intended baseline. Before launch, reconcile every exported Server Action and route against it and add automated action-level tests for any operation not yet covered.
