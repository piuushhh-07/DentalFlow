"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import {
  createClinicPatient,
  deleteClinicPatient,
  updateClinicPatient,
} from "@/features/patients/lib/patient-repository";
import {
  hasDuplicatePatientPhoneError,
  patientIdSchema,
  patientInputSchema,
} from "@/features/patients/lib/patient-validation";

export type PatientActionState = Readonly<{
  errors?: Partial<Record<"fullName" | "phoneNumber" | "notes", string[]>>;
  error?: string;
}>;

const clinicIdSchema = z.string().uuid();

function readPatientInput(formData: FormData) {
  return patientInputSchema.safeParse({
    fullName: formData.get("fullName"),
    phoneNumber: formData.get("phoneNumber"),
    whatsappOptIn: formData.get("whatsappOptIn") === "on",
    notes: formData.get("notes"),
  });
}

function logPatientOperationError(message: string, error: unknown): void {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error(message, { code: error.code });
    return;
  }

  console.error(message, {
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
}

export async function createPatient(
  _previousState: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const requestedClinicId = clinicIdSchema.safeParse(formData.get("clinicId"));

  if (!requestedClinicId.success) {
    return { error: "Select a valid clinic and try again." };
  }

  const membership = await requireClinicMembership(requestedClinicId.data);
  const parsed = readPatientInput(formData);

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      error: "Please correct the highlighted fields.",
    };
  }

  let patientId: string;

  try {
    const patient = await createClinicPatient(membership.clinicId, parsed.data);
    patientId = patient.id;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      hasDuplicatePatientPhoneError(error)
    ) {
      return {
        errors: {
          phoneNumber: [
            "A patient with this phone number is already in this clinic.",
          ],
        },
        error: "Check the phone number or open the existing patient record.",
      };
    }

    logPatientOperationError("Patient creation failed", error);
    return { error: "We couldn't save this patient. Please try again." };
  }

  redirect(`/clinic/${membership.clinicId}/patients/${patientId}?created=1`);
}

export async function updatePatient(
  _previousState: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const requestedClinicId = clinicIdSchema.safeParse(formData.get("clinicId"));
  const patientId = patientIdSchema.safeParse(formData.get("patientId"));

  if (!requestedClinicId.success || !patientId.success) {
    return { error: "This patient record could not be found." };
  }

  const membership = await requireClinicMembership(requestedClinicId.data);
  const parsed = readPatientInput(formData);

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      error: "Please correct the highlighted fields.",
    };
  }

  try {
    const updated = await updateClinicPatient(
      membership.clinicId,
      patientId.data,
      parsed.data,
    );

    if (!updated) {
      return { error: "This patient record could not be found." };
    }
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      hasDuplicatePatientPhoneError(error)
    ) {
      return {
        errors: {
          phoneNumber: [
            "A patient with this phone number is already in this clinic.",
          ],
        },
        error: "Check the phone number or open the existing patient record.",
      };
    }

    logPatientOperationError("Patient update failed", error);
    return { error: "We couldn't update this patient. Please try again." };
  }

  redirect(
    `/clinic/${membership.clinicId}/patients/${patientId.data}?updated=1`,
  );
}

export async function deletePatient(
  _previousState: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const requestedClinicId = clinicIdSchema.safeParse(formData.get("clinicId"));
  const patientId = patientIdSchema.safeParse(formData.get("patientId"));

  if (!requestedClinicId.success || !patientId.success) {
    return { error: "This patient record could not be found." };
  }

  const membership = await requireClinicMembership(requestedClinicId.data);

  try {
    const deleted = await deleteClinicPatient(
      membership.clinicId,
      patientId.data,
    );

    if (!deleted) {
      return {
        error:
          "This patient cannot be deleted while message history exists, or the record is no longer available.",
      };
    }
  } catch (error) {
    logPatientOperationError("Patient deletion failed", error);
    return { error: "We couldn't delete this patient. Please try again." };
  }

  redirect(`/clinic/${membership.clinicId}/patients?deleted=1`);
}
