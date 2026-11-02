"use client";

import { useState } from "react";

import {
  cancelBillingSubscriptionAction,
  startBillingCheckoutAction,
} from "@/features/billing/actions";

type BillingPlan = Readonly<{
  id: string;
  code: string;
  version: number;
  displayName: string;
  description: string | null;
  currency: string;
  amountMinor: number;
  interval: "MONTH" | "YEAR";
  intervalCount: number;
  trialDays: number;
}>;

type BillingPortalData = Readonly<{
  status: string;
  checkoutUrl: string | null;
  checkoutExpired: boolean;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  graceUntil: Date | null;
  cancelAtPeriodEnd: boolean;
  planVersion: Readonly<{
    displayName: string;
    code: string;
    version: number;
    currency: string;
    amountMinor: number;
    interval: "MONTH" | "YEAR";
    intervalCount: number;
  }>;
  payments: readonly Readonly<{
    id: string;
    providerPaymentId: string;
    amountMinor: number;
    currency: string;
    status: string;
    failureCode: string | null;
    paidAt: Date | null;
    createdAt: Date;
  }>[];
}>;

type BillingPortalProps = Readonly<{
  clinicId: string;
  plans: readonly BillingPlan[];
  subscription: BillingPortalData | null;
}>;

function formatPrice(amountMinor: number, currency: string): string {
  return `${currency} ${(amountMinor / 100).toFixed(2)}`;
}

function formatDate(date: Date | null): string | null {
  return date
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeZone: "Asia/Kolkata",
      }).format(date)
    : null;
}

function humanizeStatus(status: string): string {
  return status.toLowerCase().replaceAll("_", " ");
}

export function BillingPortal({
  clinicId,
  plans,
  subscription,
}: BillingPortalProps) {
  const [isPending, setIsPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [confirmCancellation, setConfirmCancellation] = useState(false);

  async function beginCheckout(planVersionId: string) {
    setIsPending(true);
    setNotice(null);
    setError(null);
    setCheckoutUrl(null);
    try {
      const result = await startBillingCheckoutAction(clinicId, planVersionId);
      setCheckoutUrl(result.checkoutUrl ?? null);
      setError(result.error ?? null);
      setNotice(result.success ?? null);
    } catch {
      setError("We couldn't connect to billing. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  async function cancelSubscription() {
    setIsPending(true);
    setNotice(null);
    setError(null);
    try {
      const result = await cancelBillingSubscriptionAction(clinicId);
      setError(result.error ?? null);
      setNotice(result.success ?? null);
      setConfirmCancellation(false);
    } catch {
      setError("We couldn't connect to billing. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  const canRequestCancellation = Boolean(
    subscription?.checkoutUrl &&
    !subscription.cancelAtPeriodEnd &&
    !["CANCELLED", "EXPIRED", "FAILED"].includes(subscription.status),
  );

  return (
    <div className="space-y-6">
      {(error || notice) && (
        <div
          aria-live="polite"
          className={
            error
              ? "rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              : "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          }
          role={error ? "alert" : "status"}
        >
          {error ?? notice}
        </div>
      )}

      {subscription ? (
        <section
          aria-labelledby="current-subscription-heading"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">
                Current subscription
              </p>
              <h2
                className="mt-1 text-xl font-semibold text-slate-900"
                id="current-subscription-heading"
              >
                {subscription.planVersion.displayName}
              </h2>
              <p className="mt-1 text-sm capitalize text-slate-600">
                {humanizeStatus(subscription.status)}
                {subscription.cancelAtPeriodEnd
                  ? " · cancellation scheduled"
                  : ""}
              </p>
            </div>
            <p className="text-lg font-semibold text-slate-900">
              {formatPrice(
                subscription.planVersion.amountMinor,
                subscription.planVersion.currency,
              )}
              <span className="ml-1 text-sm font-normal text-slate-500">
                / {subscription.planVersion.intervalCount}{" "}
                {subscription.planVersion.interval.toLowerCase()}
                {subscription.planVersion.intervalCount > 1 ? "s" : ""}
              </span>
            </p>
          </div>

          <dl className="mt-5 grid gap-4 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2">
            {subscription.trialEndsAt && (
              <div>
                <dt className="text-slate-500">Trial ends</dt>
                <dd className="mt-1 font-medium text-slate-800">
                  {formatDate(subscription.trialEndsAt)}
                </dd>
              </div>
            )}
            {subscription.currentPeriodEnd && (
              <div>
                <dt className="text-slate-500">Current period ends</dt>
                <dd className="mt-1 font-medium text-slate-800">
                  {formatDate(subscription.currentPeriodEnd)}
                </dd>
              </div>
            )}
            {subscription.graceUntil && (
              <div>
                <dt className="text-slate-500">Grace period ends</dt>
                <dd className="mt-1 font-medium text-slate-800">
                  {formatDate(subscription.graceUntil)}
                </dd>
              </div>
            )}
          </dl>

          {subscription.checkoutUrl &&
            !subscription.checkoutExpired &&
            [
              "CHECKOUT_PENDING",
              "TRIALING",
              "PAST_DUE",
              "GRACE_PERIOD",
            ].includes(subscription.status) && (
              <a
                className="mt-5 inline-flex min-h-10 items-center justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
                href={subscription.checkoutUrl}
                rel="noreferrer"
                target="_blank"
              >
                Continue provider checkout
              </a>
            )}
          {subscription.checkoutExpired &&
            ["CHECKOUT_PENDING", "PAST_DUE", "GRACE_PERIOD"].includes(
              subscription.status,
            ) && (
              <p className="mt-4 text-sm text-amber-800">
                {subscription.status === "CHECKOUT_PENDING"
                  ? "The provider checkout link has expired. Start a fresh checkout below."
                  : "The provider checkout link has expired. Contact support to request payment-method help."}
              </p>
            )}

          {canRequestCancellation && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              {confirmCancellation ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-700">
                    Cancellation will take effect at the end of the current
                    billing period. Existing clinical records remain available.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      className="inline-flex min-h-10 items-center justify-center rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
                      disabled={isPending}
                      onClick={() => void cancelSubscription()}
                      type="button"
                    >
                      {isPending ? "Requesting…" : "Confirm cancellation"}
                    </button>
                    <button
                      className="min-h-10 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={() => setConfirmCancellation(false)}
                      type="button"
                    >
                      Keep subscription
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="min-h-10 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  disabled={isPending}
                  onClick={() => setConfirmCancellation(true)}
                  type="button"
                >
                  Cancel subscription
                </button>
              )}
            </div>
          )}

          <h3 className="mt-6 border-t border-slate-100 pt-5 text-sm font-semibold text-slate-900">
            Recent billing records
          </h3>
          {subscription.payments.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              No subscription payments have been recorded yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {subscription.payments.map((payment) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                  key={payment.id}
                >
                  <span className="capitalize text-slate-700">
                    {humanizeStatus(payment.status)}
                    {payment.paidAt
                      ? ` · ${formatDate(payment.paidAt)}`
                      : ` · ${formatDate(payment.createdAt)}`}
                  </span>
                  <span className="font-medium text-slate-900">
                    {formatPrice(payment.amountMinor, payment.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-xl font-semibold text-slate-900">
            Choose a subscription
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Subscription access is confirmed only by a verified provider
            notification. A return from checkout does not mark a payment as
            successful.
          </p>
          {plans.length === 0 ? (
            <p className="mt-5 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
              No purchasable plans are configured yet. Please contact support.
            </p>
          ) : (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {plans.map((plan) => (
                <article
                  className="rounded-lg border border-slate-200 p-5"
                  key={plan.id}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">
                    {plan.code} · version {plan.version}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">
                    {plan.displayName}
                  </h3>
                  {plan.description && (
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {plan.description}
                    </p>
                  )}
                  <p className="mt-4 text-lg font-semibold text-slate-900">
                    {formatPrice(plan.amountMinor, plan.currency)}
                    <span className="ml-1 text-sm font-normal text-slate-500">
                      / {plan.intervalCount} {plan.interval.toLowerCase()}
                      {plan.intervalCount > 1 ? "s" : ""}
                    </span>
                  </p>
                  {plan.trialDays > 0 && (
                    <p className="mt-1 text-sm text-slate-600">
                      {plan.trialDays}-day trial if this clinic is eligible.
                    </p>
                  )}
                  <button
                    className="mt-5 inline-flex min-h-10 w-full items-center justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isPending}
                    onClick={() => void beginCheckout(plan.id)}
                    type="button"
                  >
                    {isPending ? "Preparing checkout…" : "Start subscription"}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
      {subscription &&
        (["CANCELLED", "EXPIRED", "FAILED"].includes(subscription.status) ||
          (subscription.status === "CHECKOUT_PENDING" &&
            subscription.checkoutExpired)) && (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-xl font-semibold text-slate-900">
              Start a new subscription
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              The previous provider subscription cannot be restarted. A new
              checkout will use this clinic&apos;s remaining trial eligibility.
            </p>
            {plans.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                No purchasable plans are configured yet.
              </p>
            ) : (
              <div className="mt-4 flex flex-wrap gap-3">
                {plans.map((plan) => (
                  <button
                    className="inline-flex min-h-10 items-center justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isPending}
                    key={plan.id}
                    onClick={() => void beginCheckout(plan.id)}
                    type="button"
                  >
                    {isPending
                      ? "Preparing checkout…"
                      : `Choose ${plan.displayName}`}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      {checkoutUrl && (
        <a
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-teal-700 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
          href={checkoutUrl}
          rel="noreferrer"
          target="_blank"
        >
          Continue to provider checkout
        </a>
      )}
      <p className="text-xs leading-5 text-slate-500">
        DentalFlow stores subscription and payment references only. Card details
        are collected and handled by Razorpay, never stored here.
      </p>
    </div>
  );
}
