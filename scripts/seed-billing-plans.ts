import { BillingInterval, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { DENTALFLOW_COMMERCIAL_PLANS } from "@/features/billing/lib/billing-commercial-plans";

async function main() {
  for (const plan of DENTALFLOW_COMMERCIAL_PLANS) {
    const providerPlanId = process.env[plan.providerPlanEnv]?.trim() || null;
    const data = {
      displayName: plan.displayName,
      description: plan.description,
      currency: "INR",
      amountMinor: plan.amountMinor,
      interval: plan.interval as BillingInterval,
      intervalCount: plan.intervalCount,
      totalBillingCycles: plan.totalBillingCycles,
      trialDays: 0,
      graceDays: 7,
      entitlements: plan.entitlements as Prisma.InputJsonValue,
    };

    await prisma.billingPlanVersion.upsert({
      where: { code_version: { code: plan.code, version: 1 } },
      create: {
        ...data,
        code: plan.code,
        version: 1,
        providerPlanId,
        availableForSale: Boolean(providerPlanId),
      },
      update: providerPlanId
        ? {
            ...data,
            providerPlanId,
            availableForSale: true,
          }
        : data,
    });

    console.info(
      `Seeded ${plan.code}: ₹${(plan.amountMinor / 100).toFixed(2)} / ${plan.interval.toLowerCase()} — ${providerPlanId ? "checkout enabled" : "checkout disabled (Razorpay plan ID missing)"}`,
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error("Billing plan seeding failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
