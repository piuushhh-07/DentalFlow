"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireClinicMembership } from "@/features/auth/lib/server-auth";
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

export type TreatmentActionState = Readonly<{
  errors?: Partial<
    Record<
      "type" | "customName" | "notes" | "totalVisits" | "dueDates",
      string[]
    >
  >;
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

  const membership = await requireClinicMembership(clinicId.data);
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

  const membership = await requireClinicMembership(ids.clinicId.data);
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

  const membership = await requireClinicMembership(ids.clinicId.data);
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

  const membership = await requireClinicMembership(ids.clinicId.data);
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

  const membership = await requireClinicMembership(clinicId.data);
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
