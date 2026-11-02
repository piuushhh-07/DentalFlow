import "server-only";

import { z } from "zod";

import { isRazorpayCheckoutUrl } from "@/features/billing/lib/razorpay-signature";

const razorpaySubscriptionResponseSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  customer_id: z.string().nullable().optional(),
  short_url: z.string().url().nullable().optional(),
  current_start: z.number().int().nullable().optional(),
  current_end: z.number().int().nullable().optional(),
});

const razorpayCancelResponseSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  current_start: z.number().int().nullable().optional(),
  current_end: z.number().int().nullable().optional(),
});

function getRazorpayCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("Razorpay API credentials are not configured.");
  }

  return { keyId, keySecret };
}

async function razorpayRequest(
  path: string,
  method: "POST",
  body: Record<string, unknown>,
): Promise<unknown> {
  const { keyId, keySecret } = getRazorpayCredentials();
  const credentials = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    console.error("Razorpay API request failed", {
      operation: path,
      status: response.status,
    });
    throw new Error("The billing provider could not complete this request.");
  }

  return response.json();
}

export async function createRazorpaySubscription(input: {
  planId: string;
  totalBillingCycles: number;
  trialEndsAt: Date | null;
  localSubscriptionId: string;
  clinicId: string;
  planCode: string;
  planVersion: number;
}) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    plan_id: input.planId,
    total_count: input.totalBillingCycles,
    quantity: 1,
    customer_notify: false,
    ...(input.trialEndsAt
      ? { start_at: Math.floor(input.trialEndsAt.getTime() / 1000) }
      : {}),
    expire_by: nowSeconds + 24 * 60 * 60,
    notes: {
      clinic_id: input.clinicId,
      local_subscription_id: input.localSubscriptionId,
      plan_code: input.planCode,
      plan_version: String(input.planVersion),
    },
  };

  const result = razorpaySubscriptionResponseSchema.safeParse(
    await razorpayRequest("subscriptions", "POST", payload),
  );
  if (!result.success) {
    throw new Error("The billing provider returned an invalid subscription.");
  }

  const checkoutUrl = result.data.short_url;
  if (!checkoutUrl || !isRazorpayCheckoutUrl(checkoutUrl)) {
    throw new Error(
      "The billing provider did not return a valid checkout link.",
    );
  }

  return {
    providerSubscriptionId: result.data.id,
    providerCustomerId: result.data.customer_id ?? null,
    checkoutUrl,
    providerStatus: result.data.status,
    currentPeriodStart: epochDate(result.data.current_start),
    currentPeriodEnd: epochDate(result.data.current_end),
  };
}

export async function cancelRazorpaySubscription(
  providerSubscriptionId: string,
  cancelAtCycleEnd: boolean,
) {
  const result = razorpayCancelResponseSchema.safeParse(
    await razorpayRequest(
      `subscriptions/${encodeURIComponent(providerSubscriptionId)}/cancel`,
      "POST",
      { cancel_at_cycle_end: cancelAtCycleEnd },
    ),
  );
  if (!result.success) {
    throw new Error("The billing provider returned an invalid cancellation.");
  }

  return {
    status: result.data.status,
    currentPeriodStart: epochDate(result.data.current_start),
    currentPeriodEnd: epochDate(result.data.current_end),
  };
}

function epochDate(value: number | null | undefined): Date | null {
  return value === null || value === undefined ? null : new Date(value * 1000);
}
