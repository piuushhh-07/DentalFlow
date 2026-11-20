-- These tables already have RLS enabled and intentionally have no Data API
-- policies. Application data access is performed through server-side Prisma,
-- while Supabase clients are used for Auth and Storage only.
--
-- Remove inherited/broad Data API privileges so anon, authenticated, and
-- service_role cannot access clinic records through PostgREST. The dedicated
-- insurance Storage authorization function is not changed by this migration.

REVOKE ALL PRIVILEGES ON TABLE
  public.appointment_requests,
  public.appointments,
  public.billing_webhook_events,
  public.clinic_dentists,
  public.clinic_invitations,
  public.clinic_memberships,
  public.clinics,
  public.insurance_activities,
  public.insurance_claims,
  public.insurance_documents,
  public.insurance_payments,
  public.insurance_policies,
  public.insurance_pre_authorizations,
  public.insurance_providers,
  public.message_logs,
  public.message_templates,
  public.patient_data_export_audits,
  public.patients,
  public.preventive_recalls,
  public.treatment_catalogue_items,
  public.treatment_chairs,
  public.treatment_financial_entries,
  public.treatment_plans,
  public.treatment_visits,
  public.user_profiles
FROM anon, authenticated, service_role;
