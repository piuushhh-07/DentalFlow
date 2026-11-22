# DentalFlow commercial billing plans

This setup uses the existing `BillingPlanVersion`, `ClinicSubscription`,
`BillingPayment`, and `BillingWebhookEvent` tables. It does not add duplicate
billing tables or require a database migration.

## Commercial catalogue

| Plan | Monthly | Annual | Dentists | Staff seats | Patient records |
| --- | ---: | ---: | ---: | ---: | ---: |
| Starter | ₹499 | ₹4,999 | 1 | 2 | 300 |
| Professional | ₹999 | ₹9,999 | 3 | 5 | 1,500 |
| Clinic Plus | ₹1,499 | ₹14,999 | 10 | 15 | 5,000 |

Annual prices are the proposed launch prices and should be confirmed before
publishing. All plans currently allow one clinic location. Multi-location
features are not included in this launch catalogue. Patient and team limits are
enforced by server-side billing entitlement checks; monthly appointment limits
are not configured.

The launch catalogue starts with no free trial. A seven-day payment grace
period is configured. Existing clinical records remain readable when paid
entitlements expire; paid creation and module actions follow the existing
server-side enforcement.

## Create Razorpay plans

Create six plans in the Razorpay Dashboard (Subscriptions → Plans), using INR:

| Environment variable | Frequency | Amount |
| --- | --- | ---: |
| `RAZORPAY_PLAN_STARTER_MONTHLY_ID` | Monthly | ₹499 |
| `RAZORPAY_PLAN_STARTER_ANNUAL_ID` | Yearly | ₹4,999 |
| `RAZORPAY_PLAN_PROFESSIONAL_MONTHLY_ID` | Monthly | ₹999 |
| `RAZORPAY_PLAN_PROFESSIONAL_ANNUAL_ID` | Yearly | ₹9,999 |
| `RAZORPAY_PLAN_CLINIC_PLUS_MONTHLY_ID` | Monthly | ₹1,499 |
| `RAZORPAY_PLAN_CLINIC_PLUS_ANNUAL_ID` | Yearly | ₹14,999 |

Use the exact corresponding amount and frequency. Add the returned `plan_...`
ID to the matching environment variable for the database environment being
seeded. Do not use live Razorpay plan IDs with test API credentials or vice
versa.

The application passes a long finite subscription duration (100 years) to
Razorpay, avoiding an early automatic end to a recurring clinic subscription.
Razorpay requires a plan to exist before a subscription can be created.

## Seed the database

1. Set `DATABASE_URL` and `DIRECT_URL` to the intended database.
2. Set any Razorpay plan ID environment variables you have created. Missing IDs
   leave the matching plan unavailable for checkout.
3. Run `npm run db:seed:billing-plans`.
4. Open the clinic Billing page and verify that only plans with a provider plan
   ID are purchasable.

The seed is versioned and idempotent. It updates version 1 of each catalogue
entry. When a provider ID is not supplied on a later run, an existing provider
ID and its sale status are preserved. Do not change prices or entitlements on a
version already used by customers; create a new plan version for future sales.

## Launch safety

Keep checkout disabled until Razorpay test-mode subscriptions and webhooks have
been exercised end to end. Configure the webhook URL and secret separately.
Do not onboard clinics with real patient records until production security,
backup/restore, privacy, and provider-account checks are complete.
