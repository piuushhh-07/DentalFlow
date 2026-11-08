"use server";

import { ClinicPermission, ClinicRole, Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireClinicPermission } from "@/features/auth/lib/server-auth";
import {
  cancelClinicTreatmentPlan,
  createClinicTreatmentPlan,
  rescheduleClinicTreatmentVisit,
  TreatmentPatientNotFoundError,
  TreatmentPlanNotFoundError,
  TreatmentPlanStateError,
  TreatmentVisitNotFoundError,
  TreatmentVisitTransitionError,
  updateClinicTreatmentPlan,
  updateClinicTreatmentVisitStatus,
} from "@/features/treatments/lib/treatment-repository";
import {
  createTreatmentPlanSchema,
  rescheduleTreatmentVisitSchema,
  treatmentVisitStatusInputSchema,
  updateTreatmentPlanSchema,
} from "@/features/treatments/lib/treatment-validation";
import {
  createTreatmentPlanFinancialEntry,
  saveClinicTreatmentCatalogueItem,
  setClinicTreatmentCatalogueItemStatus,
  treatmentCatalogueItemSchema,
  treatmentCatalogueStatusSchema,
  treatmentFinancialEntrySchema,
  treatmentPlanFinanceSchema,
  updateTreatmentPlanFinance,
} from "@/features/treatments/lib/treatment-finance";
import { requireClinicRole } from "@/features/auth/lib/server-auth";

export type TreatmentActionState = Readonly<{
  errors?: Record<string, string[] | undefined>;
  error?: string;
}>;

const uuidSchema = z.string().uuid();

function getRequiredIds(formData: FormData) {
  return {
    clinicId: uuidSchema.safeParse(formData.get("clinicId")),
    patientId: uuidSchema.safeParse(formData.get("patientId")),
    treatmentPlanId: uuidSchema.safeParse(formData.get("treatmentPlanId")),
    visitId: uuidSchema.safeParse(formData.get("visitId")),
  };
}

function logTreatmentError(message: string, error: unknown): void {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error(message, { code: error.code });
    return;
  }

  console.error(message, {
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
}

export async function createTreatmentPlan(
  _previousState: TreatmentActionState,
  formData: FormData,
): Promise<TreatmentActionState> {
  const clinicId = uuidSchema.safeParse(formData.get("clinicId"));
  const patientId = uuidSchema.safeParse(formData.get("patientId"));
  if (!clinicId.success || !patientId.success) {
    return { error: "The patient record could not be found." };
  }

  const membership = await requireClinicPermission(
    clinicId.data,
    ClinicPermission.TREATMENT_PLANS,
  );
  const parsed = createTreatmentPlanSchema.safeParse({
    type: formData.get("type"),
    customName: formData.get("customName") ?? "",
    notes: formData.get("notes") ?? "",
    totalVisits: formData.get("totalVisits"),
    dueDates: formData.getAll("dueDate"),
  });
  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      error: "Please correct the highlighted treatment details.",
    };
  }

  let treatmentPlanId: string;
  try {
    const created = await createClinicTreatmentPlan(
      membership.clinicId,
      patientId.data,
      parsed.data,
    );
    treatmentPlanId = created.id;
  } catch (error) {
    if (error instanceof TreatmentPatientNotFoundError) {
      return { error: "The patient is not available in this clinic." };
    }

    logTreatmentError("Treatment plan creation failed", error);
    return { error: "We couldn't save this treatment plan. Please try again." };
  }

  redirect(
    `/clinic/${membership.clinicId}/patients/${patientId.data}/treatments/${treatmentPlanId}`,
  );
}

export async function updateTreatmentPlan(
  _previousState: TreatmentActionState,
  formData: FormData,
): Promise<TreatmentActionState> {
  const ids = getRequiredIds(formData);
  if (
    !ids.clinicId.success ||
    !ids.patientId.success ||
    !ids.treatmentPlanId.success
  ) {
    return { error: "The treatment plan could not be found." };
  }

  const membership = await requireClinicPermission(
    ids.clinicId.data,
    ClinicPermission.TREATMENT_PLANS,
  );
  const parsed = updateTreatmentPlanSchema.safeParse({
    type: formData.get("type"),
    customName: formData.get("customName") ?? "",
    notes: formData.get("notes") ?? "",
    totalVisits: formData.get("totalVisits"),
    additionalDueDates: formData.getAll("additionalDueDate"),
  });
  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      error: "Please correct the highlighted treatment details.",
    };
  }

  try {
    await updateClinicTreatmentPlan(
      membership.clinicId,
      ids.patientId.data,
      ids.treatmentPlanId.data,
      parsed.data,
    );
  } catch (error) {
    if (error instanceof TreatmentPlanNotFoundError) {
      return { error: "The treatment plan could not be found." };
    }
    if (error instanceof TreatmentPlanStateError) {
      return { error: error.message };
    }

    logTreatmentError("Treatment plan update failed", error);
    return {
      error: "We couldn't update this treatment plan. Please try again.",
    };
  }

  redirect(
    `/clinic/${membership.clinicId}/patients/${ids.patientId.data}/treatments/${ids.treatmentPlanId.data}`,
  );
}

export async function updateTreatmentVisitStatus(
  _previousState: TreatmentActionState,
  formData: FormData,
): Promise<TreatmentActionState> {
  const ids = getRequiredIds(formData);
  const status = treatmentVisitStatusInputSchema.safeParse({
    status: formData.get("status"),
  });
  if (
    !ids.clinicId.success ||
    !ids.patientId.success ||
    !ids.treatmentPlanId.success ||
    !ids.visitId.success ||
    !status.success
  ) {
    return { error: "Choose a valid visit status." };
  }

  const membership = await requireClinicPermission(
    ids.clinicId.data,
    ClinicPermission.TREATMENT_PLANS,
  );
  try {
    await updateClinicTreatmentVisitStatus(
      membership.clinicId,
      ids.patientId.data,
      ids.treatmentPlanId.data,
      ids.visitId.data,
      status.data.status,
    );
  } catch (error) {
    if (error instanceof TreatmentVisitNotFoundError) {
      return { error: "The visit could not be found." };
    }
    if (error instanceof TreatmentVisitTransitionError) {
      return { error: error.message };
    }

    logTreatmentError("Treatment visit status update failed", error);
    return { error: "We couldn't update this visit. Please try again." };
  }

  redirect(
    `/clinic/${membership.clinicId}/patients/${ids.patientId.data}/treatments/${ids.treatmentPlanId.data}`,
  );
}

export async function rescheduleTreatmentVisit(
  _previousState: TreatmentActionState,
  formData: FormData,
): Promise<TreatmentActionState> {
  const ids = getRequiredIds(formData);
  const parsed = rescheduleTreatmentVisitSchema.safeParse({
    dueDate: formData.get("dueDate"),
  });
  if (
    !ids.clinicId.success ||
    !ids.patientId.success ||
    !ids.treatmentPlanId.success ||
    !ids.visitId.success ||
    !parsed.success
  ) {
    return {
      errors: parsed.success
        ? undefined
        : { dueDates: parsed.error.flatten().fieldErrors.dueDate },
      error: "Choose a valid visit date.",
    };
  }

  const membership = await requireClinicPermission(
    ids.clinicId.data,
    ClinicPermission.TREATMENT_PLANS,
  );
  try {
    await rescheduleClinicTreatmentVisit(
      membership.clinicId,
      ids.patientId.data,
      ids.treatmentPlanId.data,
      ids.visitId.data,
      parsed.data.dueDate,
    );
  } catch (error) {
    if (error instanceof TreatmentVisitNotFoundError) {
      return { error: "The visit could not be found." };
    }
    if (error instanceof TreatmentVisitTransitionError) {
      return { error: error.message };
    }

    logTreatmentError("Treatment visit rescheduling failed", error);
    return { error: "We couldn't reschedule this visit. Please try again." };
  }

  redirect(
    `/clinic/${membership.clinicId}/patients/${ids.patientId.data}/treatments/${ids.treatmentPlanId.data}`,
  );
}

export async function cancelTreatmentPlan(
  _previousState: TreatmentActionState,
  formData: FormData,
): Promise<TreatmentActionState> {
  const clinicId = uuidSchema.safeParse(formData.get("clinicId"));
  const patientId = uuidSchema.safeParse(formData.get("patientId"));
  const treatmentPlanId = uuidSchema.safeParse(formData.get("treatmentPlanId"));
  if (!clinicId.success || !patientId.success || !treatmentPlanId.success) {
    return { error: "The treatment plan could not be found." };
  }

  const membership = await requireClinicPermission(
    clinicId.data,
    ClinicPermission.TREATMENT_PLANS,
  );
  try {
    await cancelClinicTreatmentPlan(
      membership.clinicId,
      patientId.data,
      treatmentPlanId.data,
    );
  } catch (error) {
    if (error instanceof TreatmentPlanNotFoundError) {
      return { error: "The treatment plan could not be found." };
    }

    logTreatmentError("Treatment plan cancellation failed", error);
    return {
      error: "We couldn't cancel this treatment plan. Please try again.",
    };
  }

  redirect(
    `/clinic/${membership.clinicId}/patients/${patientId.data}/treatments/${treatmentPlanId.data}`,
  );
}

export async function recordFinancialEntry(
  _previousState: TreatmentActionState,
  formData: FormData,
): Promise<TreatmentActionState> {
  const clinicId = uuidSchema.safeParse(formData.get("clinicId"));
  const patientId = uuidSchema.safeParse(formData.get("patientId"));
  const treatmentPlanId = uuidSchema.safeParse(formData.get("treatmentPlanId"));
  const parsed = treatmentFinancialEntrySchema.safeParse({
    entryType: formData.get("entryType"),
    amount: formData.get("amount"),
    discountMode: formData.get("discountMode") ?? undefined,
    paymentMethod: formData.get("paymentMethod") ?? undefined,
    reference: formData.get("reference") ?? "",
    notes: formData.get("notes") ?? "",
    paidAt: formData.get("paidAt") ?? new Date().toISOString(),
    requestKey: formData.get("requestKey"),
  });

  if (
    !clinicId.success ||
    !patientId.success ||
    !treatmentPlanId.success ||
    !parsed.success
  ) {
    return {
      errors: parsed.success ? undefined : parsed.error.flatten().fieldErrors,
      error: "The financial record details are invalid.",
    };
  }

  const membership =
    parsed.data.entryType === "PAYMENT"
      ? await requireClinicPermission(
          clinicId.data,
          ClinicPermission.FINANCIAL_RECORDS,
        )
      : await requireClinicRole(clinicId.data, [ClinicRole.OWNER]);
  try {
    await createTreatmentPlanFinancialEntry(
      membership.clinicId,
      patientId.data,
      treatmentPlanId.data,
      membership.userId,
      parsed.data,
    );
  } catch (error) {
    logTreatmentError("Treatment financial entry failed", error);
    return {
      error:
        error instanceof Error &&
        (error.message.includes("cannot") ||
          error.message.includes("exceed") ||
          error.message.includes("greater"))
          ? error.message
          : "We couldn't record this financial entry. Please check for a duplicate submission and try again.",
    };
  }

  redirect(
    `/clinic/${membership.clinicId}/patients/${patientId.data}/treatments/${treatmentPlanId.data}`,
  );
}

export async function saveTreatmentCatalogueItem(
  _previousState: TreatmentActionState,
  formData: FormData,
): Promise<TreatmentActionState> {
  const clinicId = uuidSchema.safeParse(formData.get("clinicId"));
  const id = formData.get("id");
  const parsed = treatmentCatalogueItemSchema.safeParse({
    id: id ? String(id) : undefined,
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    defaultPrice: formData.get("defaultPrice") ?? "",
  });
  if (!clinicId.success || !parsed.success) {
    return {
      errors: parsed.success ? undefined : parsed.error.flatten().fieldErrors,
      error: "Enter a valid treatment name and price.",
    };
  }
  const membership = await requireClinicRole(clinicId.data, [ClinicRole.OWNER]);
  try {
    await saveClinicTreatmentCatalogueItem(membership.clinicId, parsed.data);
  } catch (error) {
    logTreatmentError("Treatment catalogue save failed", error);
    return {
      error:
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
          ? "A treatment with this name already exists."
          : "We couldn't save this catalogue item.",
    };
  }
  redirect(`/clinic/${membership.clinicId}/treatments/catalogue`);
}

export async function setTreatmentCatalogueStatus(
  _previousState: TreatmentActionState,
  formData: FormData,
): Promise<TreatmentActionState> {
  const clinicId = uuidSchema.safeParse(formData.get("clinicId"));
  const parsed = treatmentCatalogueStatusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!clinicId.success || !parsed.success) {
    return { error: "Choose a valid catalogue status." };
  }
  const membership = await requireClinicRole(clinicId.data, [ClinicRole.OWNER]);
  try {
    await setClinicTreatmentCatalogueItemStatus(
      membership.clinicId,
      parsed.data.id,
      parsed.data.status,
    );
  } catch (error) {
    logTreatmentError("Treatment catalogue status update failed", error);
    return { error: "We couldn't update this catalogue item." };
  }
  redirect(`/clinic/${membership.clinicId}/treatments/catalogue`);
}

export async function updateTreatmentPlanFinancialDetails(
  _previousState: TreatmentActionState,
  formData: FormData,
): Promise<TreatmentActionState> {
  const clinicId = uuidSchema.safeParse(formData.get("clinicId"));
  const patientId = uuidSchema.safeParse(formData.get("patientId"));
  const treatmentPlanId = uuidSchema.safeParse(formData.get("treatmentPlanId"));
  const parsed = treatmentPlanFinanceSchema.safeParse({
    estimatedAmount: formData.get("estimatedAmount") ?? "",
    finalAmount: formData.get("finalAmount") ?? "",
    catalogItemId: formData.get("catalogItemId") ?? "",
    status: formData.get("status"),
  });
  if (
    !clinicId.success ||
    !patientId.success ||
    !treatmentPlanId.success ||
    !parsed.success
  ) {
    return {
      errors: parsed.success ? undefined : parsed.error.flatten().fieldErrors,
      error: "Enter valid plan prices and status.",
    };
  }
  const membership = await requireClinicRole(clinicId.data, [ClinicRole.OWNER]);
  try {
    await updateTreatmentPlanFinance(
      membership.clinicId,
      patientId.data,
      treatmentPlanId.data,
      parsed.data,
    );
  } catch (error) {
    logTreatmentError("Treatment financial details update failed", error);
    return {
      error:
        error instanceof Error &&
        (error.message.includes("Complete") ||
          error.message.includes("Cancelled"))
          ? error.message
          : "We couldn't update the treatment plan.",
    };
  }
  redirect(
    `/clinic/${membership.clinicId}/patients/${patientId.data}/treatments/${treatmentPlanId.data}`,
  );
}
