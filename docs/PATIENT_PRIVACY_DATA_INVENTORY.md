# Patient privacy data inventory and lifecycle decisions

**Status:** engineering inventory for review; not a legal privacy notice or an approved retention policy.

This document records the patient-related data currently represented in DentalFlow, where the application handles it, and the decisions that must be made before clinics use real patient data at scale. It intentionally does not invent retention periods or authorize automatic deletion.

## 1. Data inventory

| Data group                     | Current records / examples                                                                                            | Why the application uses it                            | Sensitivity and handling                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Patient identity and contact   | Patient name, phone, email, normalized contact values, notes                                                          | Patient lookup, clinic communication and care workflow | Personal data; clinic-scoped; do not expose across clinics                                                                          |
| Consent and portal preferences | WhatsApp opt-in and timestamp; patient portal access and timestamp                                                    | Gate permitted communication and portal access         | Consent state must remain attributable and timestamped; changing a preference must not silently rewrite historical message evidence |
| Clinical history               | Medical/dental history, allergies, complaints, examination, diagnosis, recommendations, clinical notes                | Dentist's clinical workflow                            | Highly sensitive health information; restrict to authorized clinic roles and minimum necessary access                               |
| Dental chart and treatment     | Odontogram findings, tooth surfaces, treatment plans, visits and completion notes                                     | Treatment planning and continuity of care              | Health information; preserve correction/amendment history                                                                           |
| Prescriptions                  | Prescription date, diagnosis/advice, medicines, dosage, route, frequency, duration, author and amendment history      | Clinical prescribing and historical reference          | Highly sensitive; finalized prescriptions are historical records; amendments link to originals                                      |
| Appointments and recalls       | Appointment times, dentist/chair, status, recall type/due date/notes                                                  | Scheduling and preventive follow-up                    | Personal data; public booking requests can contain names, phone numbers and requested care details                                  |
| Financial records              | Estimates, line items, payments, discounts, refunds, expenses, receipt/reference data                                 | Patient quotations and clinic accounting               | Financial/personal data; immutable estimate snapshots and audit trails may be needed for disputes                                   |
| Insurance                      | Provider, policy/member references, claims, pre-authorizations, payments, decisions and activity                      | Insurance administration                               | Highly sensitive identity, health and financial data; restrict access and minimize free-text collection                             |
| Insurance documents            | Document metadata, extraction results/issues/model, private Storage object path                                       | Claim evidence and staff review                        | Uploaded files may contain health/identity/financial data; private bucket only; never expose object paths in patient export         |
| Communications                 | Message templates, recipient phone snapshot, message snapshot, sender, opened/manual sent state and delivery metadata | Follow-up and communication traceability               | Message body may reveal care details; consent-gated; opening WhatsApp is not proof of sending or delivery                           |
| Staff and access               | User profile, clinic membership, role, permissions, invitations, staff audit history                                  | Authentication and authorization                       | Personal/staff data; access must be clinic-scoped and revocable                                                                     |
| Audit and accountability       | Clinical, prescription, estimate, staff, insurance and patient-export audit records                                   | Accountability, dispute resolution and security review | May contain personal data; access restricted; retention and deletion exceptions need explicit approval                              |
| Clinic operations              | Clinic contact details, dentists, chairs, inventory, expenses and subscriptions                                       | Clinic operations and billing                          | Business and staff personal data; keep separate from patient exports where unrelated                                                |

The authoritative field definitions are in `prisma/schema.prisma`. This table groups the current model and is not a guarantee that every field is appropriate or necessary to collect.

## 2. System and data-flow inventory

| System / boundary                             | Current role                                             | Review required                                                                                                                                                    |
| --------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Supabase Auth                                 | User authentication and session identity                 | Confirm account lifecycle, identity deletion behavior, support access and relevant subprocessors                                                                   |
| PostgreSQL via Supabase                       | Application records, clinic membership and audit history | Confirm region, backups/PITR retention, restore procedures, access logging and deletion propagation                                                                |
| Supabase private Storage                      | Insurance document objects                               | Confirm bucket access policies, object lifecycle, backup/version behavior and how objects are removed when a record is lawfully erased                             |
| Vercel                                        | Hosts the application and server-side execution          | Confirm deployment region, runtime/log retention, support access and whether logs can contain patient data                                                         |
| WhatsApp / Meta, when configured              | External communication channel                           | Confirm the actual provider, opt-in evidence, template approval, message payload, delivery metadata, retention and processor terms before enabling automation      |
| Payment provider, when configured             | Subscription billing                                     | Identify provider and map only clinic billing data; do not send patient clinical data                                                                              |
| Document extraction / AI provider, if enabled | Potential processing of insurance document content       | Identify exact provider/model and region, data retention/training terms, subprocessors and transfer mechanism; do not enable real patient documents until approved |

Only systems actually configured for a deployment should be treated as active processors. The presence of a code integration or schema field does not prove that a provider is enabled or that a message was delivered.

## 3. Current lifecycle behavior

- Patient records support archive and restore. Archiving is not erasure.
- Patient deletion is guarded when linked clinical, appointment, financial, insurance, recall, message, prescription or export history exists.
- Patient JSON export is OWNER-only and clinic-scoped, records a successful export audit event, and includes selected structured records.
- Patient export intentionally excludes private Storage file contents and object paths, export audit history, unrelated clinic records and a complete backup of logs/backups/subprocessors.
- Insurance document files are stored separately in private Supabase Storage; deleting a database row alone must not be assumed to delete its object.
- Consent timestamps and communication snapshots support auditability; they do not by themselves establish that every applicable consent or notice requirement has been met.
- No approved retention schedule or automated retention deletion job is currently defined.

## 4. Decisions required before real-patient launch

The clinic operator and qualified privacy/legal reviewer must decide and document:

1. **Roles and purposes:** who determines purposes and means (clinic, DentalFlow operator, or both), who acts as processor/service provider, and the purpose for each data group.
2. **Notices and rights:** patient-facing notice, access/correction/export request handling, objection/withdrawal handling where applicable, identity verification and response ownership.
3. **Retention schedule:** a justified period or event-based rule for each data group, including clinical, financial, insurance, communication, audit, account, support and security logs. Record the legal/business basis and reviewer for each rule.
4. **Erasure exceptions:** which records must be retained for care continuity, legal/accounting duties, claims, disputes or security, who approves exceptions, and how restricted records are handled.
5. **Storage and backups:** object deletion, database backups/PITR, replicas, caches, exports downloaded by clinics, logs and restore-from-backup behavior.
6. **Subprocessors and transfers:** exact providers, data categories shared, processing regions, contractual terms, onward subprocessors and international transfer assessment where applicable.
7. **Security and incidents:** access review cadence, privileged support access, breach triage, notification decision owner, evidence preservation and incident communications.
8. **Communication controls:** proof of opt-in/withdrawal, suppression behavior, approved templates, provider delivery status and handling of mistaken recipients.
9. **AI/document processing:** whether extraction is necessary at all, data minimization/redaction, provider retention/training settings, human review and a documented disable/incident path.

Do not fill the retention schedule with generic durations. The correct rule depends on applicable law, clinic obligations, the record type and the approved operating model.

## 5. Safe implementation sequence

1. Approve the data map, controller/processor roles, notices and retention schedule with qualified reviewers.
2. Implement a **read-only dry-run** that reports candidate records and linked Storage objects by clinic, category and proposed rule; include counts and reasons, not document contents.
3. Have an OWNER review and explicitly approve a proposed action list. Keep dry-run output private and audit the review.
4. Test archive, export, erasure exceptions, object deletion and backup restoration only with synthetic data in a disposable environment.
5. Implement narrowly scoped deletion only after policy approval, with idempotency, authorization, audit evidence, object cleanup, retry handling and backup/restore reconciliation.
6. Verify tenant isolation, revoked consent, staff permissions and incident procedures before enabling the workflow in production.

**Production safety rule:** this inventory does not authorize deletion, retention automation, production data scans that expose patient details, or changes to backup/storage lifecycle. No destructive production operation should run until the policy and implementation are separately approved.
