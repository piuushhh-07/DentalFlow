-- Add covering indexes for composite foreign keys reported by the
-- production Supabase database linter. These indexes support FK checks and
-- parent-row updates/deletes without changing application query semantics.

CREATE INDEX IF NOT EXISTS clinic_staff_attendance_recorder_clinic_idx
  ON public.clinic_staff_attendance ("recordedByUserId", "clinicId");

CREATE INDEX IF NOT EXISTS clinic_staff_leave_user_clinic_fk_idx
  ON public.clinic_staff_leave_requests ("userId", "clinicId");

CREATE INDEX IF NOT EXISTS dentist_payout_payments_recorder_clinic_idx
  ON public.dentist_payout_payments ("recordedByUserId", "clinicId");

CREATE INDEX IF NOT EXISTS dentist_payouts_dentist_clinic_fk_idx
  ON public.dentist_payouts ("dentistId", "clinicId");

CREATE INDEX IF NOT EXISTS dentist_payouts_recorder_clinic_fk_idx
  ON public.dentist_payouts ("recordedByUserId", "clinicId");

CREATE INDEX IF NOT EXISTS equipment_maintenance_equipment_clinic_idx
  ON public.equipment_maintenance_records ("equipmentId", "clinicId");

CREATE INDEX IF NOT EXISTS inventory_batches_item_clinic_fk_idx
  ON public.inventory_batches ("itemId", "clinicId");

CREATE INDEX IF NOT EXISTS inventory_batches_supplier_clinic_fk_idx
  ON public.inventory_batches ("supplierId", "clinicId");

CREATE INDEX IF NOT EXISTS inventory_po_lines_item_clinic_fk_idx
  ON public.inventory_purchase_order_lines ("itemId", "clinicId");

CREATE INDEX IF NOT EXISTS inventory_po_lines_order_clinic_fk_idx
  ON public.inventory_purchase_order_lines ("orderId", "clinicId");

CREATE INDEX IF NOT EXISTS inventory_po_supplier_clinic_fk_idx
  ON public.inventory_purchase_orders ("supplierId", "clinicId");

CREATE INDEX IF NOT EXISTS pacr_appointment_clinic_patient_fk_idx
  ON public.patient_appointment_cancellation_requests ("appointmentId", "clinicId", "patientId");

CREATE INDEX IF NOT EXISTS pacr_patient_clinic_fk_idx
  ON public.patient_appointment_cancellation_requests ("patientId", "clinicId");

CREATE INDEX IF NOT EXISTS pacr_reviewer_clinic_fk_idx
  ON public.patient_appointment_cancellation_requests ("reviewedByUserId", "clinicId");

CREATE INDEX IF NOT EXISTS patient_lead_activities_lead_clinic_fk_idx
  ON public.patient_lead_activities ("leadId", "clinicId");

CREATE INDEX IF NOT EXISTS patient_leads_converted_patient_clinic_fk_idx
  ON public.patient_leads ("convertedPatientId", "clinicId");

CREATE INDEX IF NOT EXISTS vendor_bill_payments_recorder_clinic_fk_idx
  ON public.vendor_bill_payments ("recordedByUserId", "clinicId");

CREATE INDEX IF NOT EXISTS vendor_bills_recorder_clinic_fk_idx
  ON public.vendor_bills ("recordedByUserId", "clinicId");
