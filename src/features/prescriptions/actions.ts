"use server";

import { ClinicPermission, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireClinicPermission } from "@/features/auth/lib/server-auth";
import {
  createDigitalPrescription,
  PrescriptionAuthorProfileIncompleteError,
  PrescriptionAlreadyAmendedError,
  PrescriptionCatalogueItemNotFoundError,
  PrescriptionOriginalNotFoundError,
  PrescriptionPatientNotFoundError,
  PrescriptionVisitNotFoundError,
} from "@/features/prescriptions/lib/prescription-repository";
import { createPrescriptionSchema } from "@/features/prescriptions/lib/prescription-validation";

export type PrescriptionActionState = Readonly<{
  error?: string;
  success?: string;
}>;

const uuid = z.string().uuid();

function formStrings(formData: FormData, name: string): string[] | null {
  const values = formData.getAll(name);
  return values.every((value): value is string => typeof value === "string")
    ? (values as string[])
    : null;
}

function logPrescriptionError(error: unknown): void {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error("Prescription save failed", { code: error.code });
    return;
  }
  console.error("Prescription save failed", {
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
}

export async function createDigitalPrescriptionAction(
  _previousState: PrescriptionActionState,
  formData: FormData,
): Promise<PrescriptionActionState> {
  const clinicId = uuid.safeParse(formData.get("clinicId"));
  const patientId = uuid.safeParse(formData.get("patientId"));
  if (!clinicId.success || !patientId.success) {
    return { error: "The patient record could not be found." };
  }

  const membership = await requireClinicPermission(
    clinicId.data,
    ClinicPermission.PRESCRIPTIONS,
  );
  const fieldNames = [
    "medicineCatalogueItemId",
    "medicineName",
    "medicineDosage",
    "medicineRoute",
    "medicineFrequency",
    "medicineDuration",
    "medicineQuantity",
    "medicineInstructions",
  ] as const;
  const values = fieldNames.map((name) => formStrings(formData, name));
  if (values.some((items) => items === null)) {
    return { error: "Check the medicine details and try again." };
  }
  const arrays = values as string[][];
  const [
    catalogueItemIds,
    names,
    dosages,
    routes,
    frequencies,
    durations,
    quantities,
    instructions,
  ] = arrays;
  const rowCount = names.length;
  if (rowCount === 0 || arrays.some((items) => items.length !== rowCount)) {
    return { error: "Add at least one complete medicine entry." };
  }

  const medicines = names.map((medicineName, index) => ({
    catalogueItemId: catalogueItemIds[index] ?? "",
    medicineName,
    dosage: dosages[index],
    route: routes[index],
    frequency: frequencies[index],
    duration: durations[index],
    quantity: quantities[index],
    instructions: instructions[index],
  }));
  const parsed = createPrescriptionSchema.safeParse({
    visitId: formData.get("visitId") ?? "",
    amendsPrescriptionId: formData.get("amendsPrescriptionId") ?? "",
    amendmentReason: formData.get("amendmentReason") ?? "",
    prescriptionDate: formData.get("prescriptionDate") ?? "",
    diagnosisNotes: formData.get("diagnosisNotes") ?? "",
    additionalAdvice: formData.get("additionalAdvice") ?? "",
    followUpDate: formData.get("followUpDate") ?? "",
    authorRegistrationNumber: formData.get("authorRegistrationNumber") ?? "",
    authorConfirmed: formData.get("authorConfirmed") === "on",
    saveToCatalogue: formData.get("saveToCatalogue") === "on",
    medicines,
  });
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ??
        "Check the prescription details and try again.",
    };
  }

  try {
    await createDigitalPrescription(
      membership.clinicId,
      patientId.data,
      membership.userId,
      parsed.data,
    );
  } catch (error) {
    if (error instanceof PrescriptionAuthorProfileIncompleteError) {
      return {
        error: "Add your name to your profile before saving a prescription.",
      };
    }
    if (error instanceof PrescriptionPatientNotFoundError) {
      return { error: "The patient is not available in this clinic." };
    }
    if (error instanceof PrescriptionVisitNotFoundError) {
      return { error: "The selected visit is not available for this patient." };
    }
    if (error instanceof PrescriptionOriginalNotFoundError) {
      return { error: "The prescription to amend is not available." };
    }
    if (error instanceof PrescriptionAlreadyAmendedError) {
      return {
        error:
          "This prescription already has a correction. Amend its latest version.",
      };
    }
    if (error instanceof PrescriptionCatalogueItemNotFoundError) {
      return {
        error:
          "A selected medicine is no longer available in this clinic catalogue.",
      };
    }
    logPrescriptionError(error);
    return { error: "We couldn't save the prescription. Please try again." };
  }

  revalidatePath(`/clinic/${membership.clinicId}/patients/${patientId.data}`);
  return { success: "Prescription saved as a finalized clinical record." };
}
