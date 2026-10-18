"use server";

import { Prisma, PreventiveRecallStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import {
  createClinicRecall,
  RecallNotFoundError,
  RecallPatientNotFoundError,
  RecallStateError,
  rescheduleClinicRecall,
  updateClinicRecall,
  updateClinicRecallStatus,
} from "@/features/recalls/lib/recall-repository";
import {
  isDuplicateActiveRecall,
  recallDateSchema,
  recallInputSchema,
} from "@/features/recalls/lib/recall-validation";

export type RecallActionState = Readonly<{
  errors?: Partial<
    Record<
      | "patientId"
      | "type"
      | "customName"
      | "intervalMonths"
      | "dueDate"
      | "notes",
      string[]
    >
  >;
  error?: string;
}>;

const uuidSchema = z.string().uuid();

function logRecallError(message: string, error: unknown): void {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error(message, { code: error.code });
    return;
  }
  console.error(message, {
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
}

function parseRecallInput(formData: FormData) {
  return recallInputSchema.safeParse({
    type: formData.get("type"),
    customName: formData.get("customName") ?? "",
    intervalMonths: formData.get("intervalMonths") ?? "",
    dueDate: formData.get("dueDate"),
    notes: formData.get("notes") ?? "",
  });
}

export async function createRecall(
  _previousState: RecallActionState,
  formData: FormData,
): Promise<RecallActionState> {
  const clinicId = uuidSchema.safeParse(formData.get("clinicId"));
  const patientId = uuidSchema.safeParse(formData.get("patientId"));
  const parsed = parseRecallInput(formData);

  if (!clinicId.success || !patientId.success) {
    return {
      errors: { patientId: ["Choose a valid patient."] },
      error: "Select a patient and try again.",
    };
  }
  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      error: "Please correct the highlighted recall details.",
    };
  }

  const membership = await requireClinicMembership(clinicId.data);
  let recallId: string;
  try {
    const recall = await createClinicRecall(
      membership.clinicId,
      patientId.data,
      parsed.data,
    );
    recallId = recall.id;
  } catch (error) {
    if (error instanceof RecallPatientNotFoundError) {
      return { error: "The patient is not available in this clinic." };
    }
    if (isDuplicateActiveRecall(error)) {
      return {
        error:
          "An active recall with this type and due date already exists for this patient.",
      };
    }
    logRecallError("Recall creation failed", error);
    return { error: "We couldn't create this recall. Please try again." };
  }

  redirect(`/clinic/${membership.clinicId}/recalls/${recallId}`);
}

export async function updateRecall(
  _previousState: RecallActionState,
  formData: FormData,
): Promise<RecallActionState> {
  const clinicId = uuidSchema.safeParse(formData.get("clinicId"));
  const patientId = uuidSchema.safeParse(formData.get("patientId"));
  const recallId = uuidSchema.safeParse(formData.get("recallId"));
  const parsed = parseRecallInput(formData);

  if (!clinicId.success || !patientId.success || !recallId.success) {
    return { error: "The recall could not be found." };
  }
  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      error: "Please correct the highlighted recall details.",
    };
  }

  const membership = await requireClinicMembership(clinicId.data);
  try {
    await updateClinicRecall(
      membership.clinicId,
      patientId.data,
      recallId.data,
      parsed.data,
    );
  } catch (error) {
    if (error instanceof RecallNotFoundError) {
      return { error: "The recall could not be found." };
    }
    if (error instanceof RecallStateError) {
      return { error: error.message };
    }
    if (isDuplicateActiveRecall(error)) {
      return {
        error:
          "An active recall with this type and due date already exists for this patient.",
      };
    }
    logRecallError("Recall update failed", error);
    return { error: "We couldn't update this recall. Please try again." };
  }

  redirect(`/clinic/${membership.clinicId}/recalls/${recallId.data}`);
}

export async function rescheduleRecall(
  _previousState: RecallActionState,
  formData: FormData,
): Promise<RecallActionState> {
  const clinicId = uuidSchema.safeParse(formData.get("clinicId"));
  const recallId = uuidSchema.safeParse(formData.get("recallId"));
  const dueDate = recallDateSchema.safeParse(formData.get("dueDate"));

  if (!clinicId.success || !recallId.success || !dueDate.success) {
    return { error: "Choose a valid due date." };
  }

  const membership = await requireClinicMembership(clinicId.data);
  try {
    await rescheduleClinicRecall(
      membership.clinicId,
      recallId.data,
      dueDate.data,
    );
  } catch (error) {
    if (error instanceof RecallNotFoundError) {
      return { error: "The recall could not be found." };
    }
    if (error instanceof RecallStateError) {
      return { error: error.message };
    }
    if (isDuplicateActiveRecall(error)) {
      return {
        error:
          "An active recall with this type and due date already exists for this patient.",
      };
    }
    logRecallError("Recall rescheduling failed", error);
    return { error: "We couldn't reschedule this recall. Please try again." };
  }

  redirect(`/clinic/${membership.clinicId}/recalls/${recallId.data}`);
}

export async function updateRecallStatus(
  _previousState: RecallActionState,
  formData: FormData,
): Promise<RecallActionState> {
  const clinicId = uuidSchema.safeParse(formData.get("clinicId"));
  const recallId = uuidSchema.safeParse(formData.get("recallId"));
  const status = z
    .nativeEnum(PreventiveRecallStatus)
    .safeParse(formData.get("status"));

  if (!clinicId.success || !recallId.success || !status.success) {
    return { error: "Choose a valid recall status." };
  }

  const membership = await requireClinicMembership(clinicId.data);
  try {
    await updateClinicRecallStatus(
      membership.clinicId,
      recallId.data,
      status.data,
    );
  } catch (error) {
    if (error instanceof RecallNotFoundError) {
      return { error: "The recall could not be found." };
    }
    if (error instanceof RecallStateError) {
      return { error: error.message };
    }
    if (isDuplicateActiveRecall(error)) {
      return {
        error:
          "Another active recall with this type and due date already exists for this patient.",
      };
    }
    logRecallError("Recall status update failed", error);
    return { error: "We couldn't update this recall. Please try again." };
  }

  redirect(`/clinic/${membership.clinicId}/recalls/${recallId.data}`);
}
