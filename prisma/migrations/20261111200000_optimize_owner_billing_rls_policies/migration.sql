-- Cache auth.uid() once per statement instead of reevaluating it for every row.
-- Authorization remains restricted to authenticated clinic owners.

DROP POLICY IF EXISTS "billing_payments_read_owner"
ON public.billing_payments;

CREATE POLICY "billing_payments_read_owner"
ON public.billing_payments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.clinic_memberships AS membership
    WHERE membership."clinicId" = billing_payments."clinicId"
      AND membership."userId" = (SELECT auth.uid())
      AND membership.role = 'OWNER'::"ClinicRole"
  )
);

DROP POLICY IF EXISTS "clinic_subscriptions_read_owner"
ON public.clinic_subscriptions;

CREATE POLICY "clinic_subscriptions_read_owner"
ON public.clinic_subscriptions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.clinic_memberships AS membership
    WHERE membership."clinicId" = clinic_subscriptions."clinicId"
      AND membership."userId" = (SELECT auth.uid())
      AND membership.role = 'OWNER'::"ClinicRole"
  )
);
