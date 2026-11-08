"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ClinicPermission } from "@prisma/client";
import { requireClinicPermission } from "@/features/auth/lib/server-auth";
import {
  createPatientOdontogramEntry,
  OdontogramCorrectionConflictError,
  OdontogramCorrectionNotFoundError,
  OdontogramPatientNotFoundError,
  OdontogramTreatmentPlanNotFoundError,
} from "@/features/odontogram/lib/odontogram-repository";
import { odontogramEntrySchema } from "@/features/odontogram/lib/odontogram-validation";

export type OdontogramActionState = Readonly<{
  errors?: Record<string, string[] | undefined>;
  error?: string;
  success?: string;
}>;

const uuidSchema = z.string().uuid();

function logOdontogramError(error: unknown): void {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error("Odontogram entry creation failed", { code: error.code });
    return;
  }

  console.error("Odontogram entry creation failed", {
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
}

export async function recordOdontogramEntry(
  _previousState: OdontogramActionState,
  formData: FormData,
): Promise<OdontogramActionState> {
  const clinicId = uuidSchema.safeParse(formData.get("clinicId"));
  const patientId = uuidSchema.safeParse(formData.get("patientId"));
  if (!clinicId.success || !patientId.success) {
    return { error: "The patient record could not be found." };
  }

  const membership = await requireClinicPermission(
    clinicId.data,
    ClinicPermission.CLINICAL_RECORDS,
  );
  const parsed = odontogramEntrySchema.safeParse({
    toothNumber: formData.get("toothNumber"),
    dentition: formData.get("dentition"),
    entryType: formData.get("entryType"),
    finding: formData.get("finding") ?? "",
    treatmentName: formData.get("treatmentName") ?? "",
    treatmentStatus: formData.get("treatmentStatus") ?? "",
    surfaces: formData.getAll("surfaces"),
    notes: formData.get("notes") ?? "",
    treatmentPlanId: formData.get("treatmentPlanId") ?? "",
    supersedesEntryId: formData.get("supersedesEntryId") ?? "",
  });

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      error: "Please correct the highlighted chart details.",
    };
  }

  try {
    await createPatientOdontogramEntry(
      membership.clinicId,
      patientId.data,
      membership.userId,
      parsed.data,
    );
  } catch (error) {
    if (error instanceof OdontogramPatientNotFoundError) {
      return { error: "The patient is not available in this clinic." };
    }
    if (error instanceof OdontogramTreatmentPlanNotFoundError) {
      return { error: "The treatment plan is not available for this patient." };
    }
    if (error instanceof OdontogramCorrectionNotFoundError) {
      return {
        error:
          "The chart entry to correct is no longer available. Refresh and try again.",
      };
    }
    if (error instanceof OdontogramCorrectionConflictError) {
      return { error: error.message };
    }

    logOdontogramError(error);
    return { error: "We couldn't save this chart entry. Please try again." };
  }

  revalidatePath(`/clinic/${membership.clinicId}/patients/${patientId.data}`);
  return { success: "Chart entry saved." };
}
