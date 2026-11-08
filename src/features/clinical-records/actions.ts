"use server";

import { ClinicPermission, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireClinicPermission } from "@/features/auth/lib/server-auth";
import {
  DentalClinicalRecordFindingNotFoundError,
  DentalClinicalRecordPatientNotFoundError,
  DentalClinicalRecordVisitNotFoundError,
  createDentalClinicalRecord,
} from "@/features/clinical-records/lib/clinical-record-repository";
import { dentalClinicalRecordInputSchema } from "@/features/clinical-records/lib/clinical-record-validation";

export type DentalClinicalRecordActionState = Readonly<{
  error?: string;
  success?: string;
}>;

function logClinicalRecordError(error: unknown): void {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error("Clinical record save failed", { code: error.code });
    return;
  }

  console.error("Clinical record save failed", {
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
}

export async function saveDentalClinicalRecordAction(
  _previousState: DentalClinicalRecordActionState,
  formData: FormData,
): Promise<DentalClinicalRecordActionState> {
  const clinicId = formData.get("clinicId");
  const patientId = formData.get("patientId");

  if (typeof clinicId !== "string" || typeof patientId !== "string") {
    return { error: "The patient record could not be found." };
  }

  const membership = await requireClinicPermission(
    clinicId,
    ClinicPermission.CLINICAL_RECORDS,
  );

  const rawFinding = {
    toothNumber: formData.get("toothNumber") ?? "",
    dentition: formData.get("dentition") ?? "",
    toothFindingLabel: formData.get("toothFindingLabel") ?? "",
    summary: formData.get("toothFindingSummary") ?? "",
    surfaces: formData
      .getAll("toothSurfaces")
      .filter((value): value is string => typeof value === "string"),
    notes: formData.get("toothFindingNotes") ?? "",
    relatedOdontogramEntryId: formData.get("relatedOdontogramEntryId") ?? "",
  };

  const hasFinding = Object.values(rawFinding).some((value) => {
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (typeof value === "string") {
      return value.trim().length > 0;
    }
    return false;
  });

  const parsed = dentalClinicalRecordInputSchema.safeParse({
    visitId: formData.get("visitId") ?? "",
    medicalHistory: formData.get("medicalHistory") ?? "",
    dentalHistory: formData.get("dentalHistory") ?? "",
    allergies: formData.get("allergies") ?? "",
    chiefComplaints: formData.get("chiefComplaints") ?? "",
    clinicalExamination: formData.get("clinicalExamination") ?? "",
    diagnosis: formData.get("diagnosis") ?? "",
    treatmentRecommendations: formData.get("treatmentRecommendations") ?? "",
    clinicalNotes: formData.get("clinicalNotes") ?? "",
    findings: hasFinding ? [rawFinding] : [],
  });

  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? "Check the clinical record details.",
    };
  }

  try {
    await createDentalClinicalRecord(
      membership.clinicId,
      patientId,
      membership.userId,
      parsed.data,
    );
  } catch (error) {
    if (error instanceof DentalClinicalRecordPatientNotFoundError) {
      return { error: "The patient is not available in this clinic." };
    }
    if (error instanceof DentalClinicalRecordVisitNotFoundError) {
      return { error: "The selected visit is not available for this patient." };
    }
    if (error instanceof DentalClinicalRecordFindingNotFoundError) {
      return {
        error: "The linked chart finding is not available in this clinic.",
      };
    }

    logClinicalRecordError(error);
    return { error: "We couldn't save the clinical record. Please try again." };
  }

  revalidatePath(`/clinic/${membership.clinicId}/patients/${patientId}`);
  return { success: "Clinical record saved." };
}
