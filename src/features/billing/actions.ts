"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireClinicRole } from "@/features/auth/lib/server-auth";
import { ClinicRole } from "@prisma/client";
import {
  BillingCheckoutConflictError,
  BillingPlanUnavailableError,
  BillingSubscriptionAlreadyExistsError,
  BillingSubscriptionNotFoundError,
  cancelClinicSubscriptionAtPeriodEnd,
  scheduleClinicPlanChange,
  BillingPlanChangeUnavailableError,
  BillingPlanChangeAlreadyScheduledError,
  startClinicSubscriptionCheckout,
} from "@/features/billing/lib/billing-repository";

const uuidSchema = z.string().uuid();

export type BillingActionResult = Readonly<{
  checkoutUrl?: string;
  error?: string;
  success?: string;
}>;

export async function startBillingCheckoutAction(
  clinicIdInput: string,
  planVersionIdInput: string,
): Promise<BillingActionResult> {
  const clinicId = uuidSchema.safeParse(clinicIdInput);
  const planVersionId = uuidSchema.safeParse(planVersionIdInput);
  if (!clinicId.success || !planVersionId.success) {
    return { error: "Select a valid subscription plan." };
  }

  const membership = await requireClinicRole(clinicId.data, [ClinicRole.OWNER]);

  try {
    const { checkoutUrl } = await startClinicSubscriptionCheckout(
      membership.clinicId,
      planVersionId.data,
    );
    revalidatePath(`/clinic/${membership.clinicId}/billing`);
    return { checkoutUrl };
  } catch (error) {
    if (error instanceof BillingPlanUnavailableError) {
      return { error: "This subscription plan is not currently available." };
    }
    if (error instanceof BillingSubscriptionAlreadyExistsError) {
      return {
        error:
          "This clinic already has a current subscription. Manage it below before selecting another plan.",
      };
    }
    if (error instanceof BillingCheckoutConflictError) {
      return {
        error:
          "A subscription change is already being processed. Refresh Billing and try again.",
      };
    }
    console.error("Billing checkout creation failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return {
      error:
        "We couldn't start checkout. No payment status has changed; please try again.",
    };
  }
}

export async function cancelBillingSubscriptionAction(
  clinicIdInput: string,
): Promise<BillingActionResult> {
  const clinicId = uuidSchema.safeParse(clinicIdInput);
  if (!clinicId.success) {
    return { error: "Select a valid clinic and try again." };
  }

  const membership = await requireClinicRole(clinicId.data, [ClinicRole.OWNER]);

  try {
    await cancelClinicSubscriptionAtPeriodEnd(membership.clinicId);
    revalidatePath(`/clinic/${membership.clinicId}/billing`);
    return {
      success: "Cancellation requested for the end of this billing period.",
    };
  } catch (error) {
    if (error instanceof BillingSubscriptionNotFoundError) {
      return {
        error: "No cancellable subscription was found for this clinic.",
      };
    }
    console.error("Billing subscription cancellation failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return { error: "We couldn't request cancellation. Please try again." };
  }
}

export async function scheduleBillingPlanChangeAction(clinicIdInput: string, planVersionIdInput: string): Promise<BillingActionResult> {
  const clinicId = uuidSchema.safeParse(clinicIdInput);
  const planVersionId = uuidSchema.safeParse(planVersionIdInput);
  if (!clinicId.success || !planVersionId.success) return { error: "Select a valid subscription plan." };
  const membership = await requireClinicRole(clinicId.data, [ClinicRole.OWNER]);
  try {
    const result = await scheduleClinicPlanChange(membership.clinicId, planVersionId.data);
    revalidatePath(`/clinic/${membership.clinicId}/billing`);
    return { success: `Plan change scheduled for ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(result.effectiveAt)}. Your current access remains unchanged until then.` };
  } catch (error) {
    if (error instanceof BillingPlanChangeAlreadyScheduledError) return { error: "A plan change is already scheduled for this clinic." };
    if (error instanceof BillingPlanChangeUnavailableError) return { error: "This subscription or plan is not eligible for an in-place plan change." };
    console.error("Billing plan change failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
    return { error: "We couldn't schedule this plan change. Your current plan remains unchanged." };
  }
}
