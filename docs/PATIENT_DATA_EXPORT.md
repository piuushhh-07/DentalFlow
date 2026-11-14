# Patient data export scope

The owner-only patient export is a clinic-scoped JSON snapshot. The export
route requires an active clinic OWNER membership and returns a private,
non-cacheable attachment. Each successful export records a
`PatientDataExportAudit` row. A missing patient in the requested clinic
returns 404; staff members do not receive export access.

## Included structured records

- Patient profile and consent timestamps.
- Treatment plans and visits; estimates, estimate lines and estimate audits;
  financial entries; appointments; preventive recalls; and message logs.
- Insurance policies and minimal provider identity (name and provider kind),
  claims, pre-authorizations, claim payments, and related insurance activity.
- Insurance document metadata and extraction results, excluding the private
  Storage object path.
- Odontogram entries, dental clinical records with findings and audit history,
  and digital prescriptions with medicines and audit history.

## Explicit exclusions and limitations

- Private Supabase Storage file contents and internal object paths are not
  included. A JSON export is not a file backup.
- The export audit history itself is not embedded in the downloaded snapshot;
  the successful export is recorded separately in the clinic database.
- Clinic-wide provider master details and unrelated clinic records are not
  exported.
- The export does not erase data, prove that every legal access-request
  requirement is satisfied, or cover backups, logs, caches, or subprocessors.
- This implementation does not define a retention period or automated
  deletion behavior.

## Required verification before formal use

Test with synthetic records in an isolated clinic and verify every included
relation, clinic boundary, OWNER/STAFF authorization result, audit event, and
download headers. Separately define and approve Storage-file handling,
retention, erasure exceptions, backup lifecycle, and applicable legal
requirements with qualified reviewers. Do not delete linked clinical,
financial, insurance, message, or audit history as part of an unapproved
retention assumption.
