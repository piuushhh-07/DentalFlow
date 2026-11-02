CREATE TYPE "BillingInterval" AS ENUM ('MONTH', 'YEAR');
CREATE TYPE "BillingSubscriptionStatus" AS ENUM (
  'CHECKOUT_PENDING',
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'GRACE_PERIOD',
  'CANCEL_AT_PERIOD_END',
  'PAUSED',
  'CANCELLED',
  'EXPIRED',
  'FAILED'
);
CREATE TYPE "BillingPaymentStatus" AS ENUM ('SUCCEEDED', 'FAILED', 'REFUNDED');
CREATE TYPE "BillingWebhookStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'PROCESSED',
  'FAILED'
);

CREATE TABLE "billing_plan_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" VARCHAR(64) NOT NULL,
  "version" INTEGER NOT NULL,
  "displayName" VARCHAR(120) NOT NULL,
  "description" VARCHAR(500),
  "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
  "amountMinor" INTEGER NOT NULL,
  "interval" "BillingInterval" NOT NULL,
  "intervalCount" INTEGER NOT NULL DEFAULT 1,
  "totalBillingCycles" INTEGER NOT NULL,
  "trialDays" INTEGER NOT NULL DEFAULT 14,
  "graceDays" INTEGER NOT NULL DEFAULT 7,
  "entitlements" JSONB NOT NULL,
  "providerPlanId" VARCHAR(64),
  "availableForSale" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "billing_plan_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_plan_versions_code_version_key" UNIQUE ("code", "version"),
  CONSTRAINT "billing_plan_versions_providerPlanId_key" UNIQUE ("providerPlanId"),
  CONSTRAINT "billing_plan_versions_version_check" CHECK ("version" > 0),
  CONSTRAINT "billing_plan_versions_amount_check" CHECK ("amountMinor" >= 0),
  CONSTRAINT "billing_plan_versions_currency_check" CHECK ("currency" = 'INR'),
  CONSTRAINT "billing_plan_versions_interval_count_check" CHECK ("intervalCount" > 0),
  CONSTRAINT "billing_plan_versions_total_cycles_check" CHECK ("totalBillingCycles" > 0),
  CONSTRAINT "billing_plan_versions_trial_days_check" CHECK ("trialDays" BETWEEN 0 AND 365),
  CONSTRAINT "billing_plan_versions_grace_days_check" CHECK ("graceDays" BETWEEN 0 AND 30),
  CONSTRAINT "billing_plan_versions_entitlements_object_check" CHECK (jsonb_typeof("entitlements") = 'object')
);
CREATE INDEX "billing_plan_versions_availableForSale_code_idx"
  ON "billing_plan_versions"("availableForSale", "code");

CREATE TABLE "clinic_subscriptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "planVersionId" UUID NOT NULL,
  "status" "BillingSubscriptionStatus" NOT NULL DEFAULT 'CHECKOUT_PENDING',
  "providerSubscriptionId" VARCHAR(64),
  "providerCustomerId" VARCHAR(64),
  "checkoutUrl" VARCHAR(500),
  "checkoutExpiresAt" TIMESTAMPTZ(6),
  "trialStartedAt" TIMESTAMPTZ(6),
  "trialEndsAt" TIMESTAMPTZ(6),
  "currentPeriodStart" TIMESTAMPTZ(6),
  "currentPeriodEnd" TIMESTAMPTZ(6),
  "graceUntil" TIMESTAMPTZ(6),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "cancelledAt" TIMESTAMPTZ(6),
  "lastProviderEventCreatedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "clinic_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clinic_subscriptions_id_clinicId_key" UNIQUE ("id", "clinicId"),
  CONSTRAINT "clinic_subscriptions_providerSubscriptionId_key" UNIQUE ("providerSubscriptionId"),
  CONSTRAINT "clinic_subscriptions_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "clinic_subscriptions_planVersionId_fkey"
    FOREIGN KEY ("planVersionId") REFERENCES "billing_plan_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "clinic_subscriptions_trial_dates_check"
    CHECK ("trialEndsAt" IS NULL OR "trialStartedAt" IS NOT NULL AND "trialEndsAt" >= "trialStartedAt"),
  CONSTRAINT "clinic_subscriptions_period_dates_check"
    CHECK ("currentPeriodEnd" IS NULL OR "currentPeriodStart" IS NOT NULL AND "currentPeriodEnd" >= "currentPeriodStart")
);
CREATE INDEX "clinic_subscriptions_clinicId_status_createdAt_idx"
  ON "clinic_subscriptions"("clinicId", "status", "createdAt");
CREATE UNIQUE INDEX "clinic_subscriptions_one_current_per_clinic_idx"
  ON "clinic_subscriptions"("clinicId")
  WHERE "status" IN (
    'CHECKOUT_PENDING',
    'TRIALING',
    'ACTIVE',
    'PAST_DUE',
    'GRACE_PERIOD',
    'CANCEL_AT_PERIOD_END',
    'PAUSED'
  );
CREATE UNIQUE INDEX "clinic_subscriptions_one_trial_per_clinic_idx"
  ON "clinic_subscriptions"("clinicId")
  WHERE "trialStartedAt" IS NOT NULL;

CREATE TABLE "billing_payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId" UUID NOT NULL,
  "subscriptionId" UUID NOT NULL,
  "providerPaymentId" VARCHAR(64) NOT NULL,
  "providerInvoiceId" VARCHAR(64),
  "amountMinor" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "status" "BillingPaymentStatus" NOT NULL,
  "failureCode" VARCHAR(120),
  "paidAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_payments_providerPaymentId_key" UNIQUE ("providerPaymentId"),
  CONSTRAINT "billing_payments_providerPaymentId_clinicId_key" UNIQUE ("providerPaymentId", "clinicId"),
  CONSTRAINT "billing_payments_amount_check" CHECK ("amountMinor" >= 0),
  CONSTRAINT "billing_payments_currency_check" CHECK ("currency" = 'INR'),
  CONSTRAINT "billing_payments_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "billing_payments_subscriptionId_clinicId_fkey"
    FOREIGN KEY ("subscriptionId", "clinicId")
    REFERENCES "clinic_subscriptions"("id", "clinicId")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "billing_payments_clinicId_createdAt_idx"
  ON "billing_payments"("clinicId", "createdAt");
CREATE INDEX "billing_payments_subscriptionId_createdAt_idx"
  ON "billing_payments"("subscriptionId", "createdAt");

CREATE TABLE "billing_webhook_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "providerEventId" VARCHAR(120) NOT NULL,
  "eventType" VARCHAR(120) NOT NULL,
  "eventCreatedAt" TIMESTAMPTZ(6) NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "BillingWebhookStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "processingStartedAt" TIMESTAMPTZ(6),
  "processedAt" TIMESTAMPTZ(6),
  "lastError" VARCHAR(500),
  "receivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_webhook_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_webhook_events_providerEventId_key" UNIQUE ("providerEventId"),
  CONSTRAINT "billing_webhook_events_attempt_count_check" CHECK ("attemptCount" >= 0),
  CONSTRAINT "billing_webhook_events_payload_object_check" CHECK (jsonb_typeof("payload") = 'object')
);
CREATE INDEX "billing_webhook_events_status_receivedAt_idx"
  ON "billing_webhook_events"("status", "receivedAt");
CREATE INDEX "billing_webhook_events_eventType_eventCreatedAt_idx"
  ON "billing_webhook_events"("eventType", "eventCreatedAt");

ALTER TABLE "billing_plan_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clinic_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_webhook_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_plan_versions_read_available"
  ON "billing_plan_versions"
  FOR SELECT
  TO authenticated
  USING ("availableForSale" = true);

CREATE POLICY "clinic_subscriptions_read_owner"
  ON "clinic_subscriptions"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM "clinic_memberships" membership
      WHERE membership."clinicId" = "clinic_subscriptions"."clinicId"
        AND membership."userId" = auth.uid()
        AND membership."role" = 'OWNER'
    )
  );

CREATE POLICY "billing_payments_read_owner"
  ON "billing_payments"
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM "clinic_memberships" membership
      WHERE membership."clinicId" = "billing_payments"."clinicId"
        AND membership."userId" = auth.uid()
        AND membership."role" = 'OWNER'
    )
  );
