import { createHash } from "node:crypto";

import type { TreatmentFinancialEntryInput } from "@/features/treatments/lib/treatment-finance-validation";

export function createTreatmentFinancialEntryRequestHash(
  patientId: string,
  treatmentPlanId: string,
  createdByUserId: string,
  input: TreatmentFinancialEntryInput,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        patientId,
        treatmentPlanId,
        createdByUserId,
        entryType: input.entryType,
        amount: input.amount,
        discountMode: input.discountMode ?? null,
        paymentMethod: input.paymentMethod ?? null,
        reference: input.reference?.trim() || null,
        notes: input.notes?.trim() || null,
        paidAt: input.paidAt,
      }),
    )
    .digest("hex");
}
