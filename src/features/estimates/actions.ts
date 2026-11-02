"use server";

import { ClinicRole, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireClinicRole } from "@/features/auth/lib/server-auth";
import {
  createTreatmentEstimate,
  TreatmentEstimateActorNotAuthorizedError,
  TreatmentEstimateAuthorError,
  TreatmentEstimateNotFoundError,
  TreatmentEstimateProcedureError,
  TreatmentEstimateSourceNotFoundError,
  TreatmentEstimateTransitionError,
  transitionTreatmentEstimate,
} from "@/features/estimates/lib/estimate-repository";
import {
  createTreatmentEstimateSchema,
  estimateStatusTransitionSchema,
} from "@/features/estimates/lib/estimate-validation";

export type TreatmentEstimateActionState = Readonly<{
  error?: string;
  success?: string;
}>;

const uuid = z.string().uuid();

function formStrings(formData: FormData, name: string) {
  const values = formData.getAll(name);
  return values.every((value): value is string => typeof value === "string")
    ? (values as string[])
    : null;
}

function logEstimateError(message: string, error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error(message, { code: error.code });
    return;
  }
  console.error(message, {
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
}

export async function createTreatmentEstimateAction(
  _previousState: TreatmentEstimateActionState,
  formData: FormData,
): Promise<TreatmentEstimateActionState> {
  const clinicId = uuid.safeParse(formData.get("clinicId"));
  const patientId = uuid.safeParse(formData.get("patientId"));
  const treatmentPlanId = uuid.safeParse(formData.get("treatmentPlanId"));
  if (!clinicId.success || !patientId.success || !treatmentPlanId.success) {
    return { error: "The treatment plan could not be found." };
  }

  const membership = await requireClinicRole(clinicId.data, [
    ClinicRole.OWNER,
    ClinicRole.STAFF,
  ]);
  const names = [
    "catalogueItemId",
    "description",
    "quantity",
    "unitPrice",
  ] as const;
  const arrays = names.map((name) => formStrings(formData, name));
  if (arrays.some((values) => values === null)) {
    return { error: "Check each procedure and try again." };
  }
  const [catalogueItemIds, descriptions, quantities, unitPrices] =
    arrays as string[][];
  const count = descriptions.length;
  if (
    count === 0 ||
    count > 50 ||
    arrays.some((values) => values?.length !== count)
  ) {
    return { error: "Add at least one complete procedure." };
  }
  const parsed = createTreatmentEstimateSchema.safeParse({
    revisionOfEstimateId: formData.get("revisionOfEstimateId") ?? "",
    revisionReason: formData.get("revisionReason") ?? "",
    estimateDate: formData.get("estimateDate"),
    validityDate: formData.get("validityDate"),
    discountAmount: formData.get("discountAmount"),
    taxRate: formData.get("taxRate"),
    dentistRegistrationNumber: formData.get("dentistRegistrationNumber") ?? "",
    notes: formData.get("notes") ?? "",
    terms: formData.get("terms") ?? "",
    lines: descriptions.map((description, index) => ({
      catalogueItemId: catalogueItemIds[index] ?? "",
      description,
      quantity: quantities[index],
      unitPrice: unitPrices[index],
    })),
  });
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ??
        "Check the quotation details and try again.",
    };
  }

  try {
    await createTreatmentEstimate(
      membership.clinicId,
      patientId.data,
      membership.userId,
      treatmentPlanId.data,
      parsed.data,
    );
  } catch (error) {
    if (error instanceof TreatmentEstimateAuthorError) {
      return {
        error: "Add your name to your profile before saving an estimate.",
      };
    }
    if (error instanceof TreatmentEstimateProcedureError) {
      return {
        error: "A selected procedure is no longer available in this clinic.",
      };
    }
    if (error instanceof TreatmentEstimateSourceNotFoundError) {
      return {
        error:
          "The selected treatment plan or estimate version is unavailable.",
      };
    }
    logEstimateError("Treatment estimate creation failed", error);
    return { error: "We couldn't save the estimate. Please try again." };
  }

  revalidatePath(`/clinic/${membership.clinicId}/patients/${patientId.data}`);
  revalidatePath(
    `/clinic/${membership.clinicId}/patients/${patientId.data}/treatments/${treatmentPlanId.data}`,
  );
  return { success: "Quotation saved as a versioned estimate." };
}

export async function transitionTreatmentEstimateAction(
  _previousState: TreatmentEstimateActionState,
  formData: FormData,
): Promise<TreatmentEstimateActionState> {
  const clinicId = uuid.safeParse(formData.get("clinicId"));
  const patientId = uuid.safeParse(formData.get("patientId"));
  const parsed = estimateStatusTransitionSchema.safeParse({
    estimateId: formData.get("estimateId"),
    status: formData.get("status"),
    note: formData.get("note") ?? "",
  });
  if (!clinicId.success || !patientId.success || !parsed.success) {
    return { error: "Choose a valid estimate status." };
  }

  const membership = await requireClinicRole(clinicId.data, [
    ClinicRole.OWNER,
    ClinicRole.STAFF,
  ]);
  let treatmentPlanId: string;
  try {
    const result = await transitionTreatmentEstimate(
      membership.clinicId,
      patientId.data,
      parsed.data.estimateId,
      membership.userId,
      parsed.data.status,
      parsed.data.note,
    );
    treatmentPlanId = result.treatmentPlanId;
  } catch (error) {
    if (error instanceof TreatmentEstimateNotFoundError) {
      return { error: "The estimate is not available for this patient." };
    }
    if (error instanceof TreatmentEstimateActorNotAuthorizedError) {
      return { error: "You don't have permission to change this estimate." };
    }
    if (error instanceof TreatmentEstimateTransitionError) {
      return { error: error.message };
    }
    logEstimateError("Treatment estimate status update failed", error);
    return { error: "We couldn't update the estimate. Please try again." };
  }

  revalidatePath(`/clinic/${membership.clinicId}/patients/${patientId.data}`);
  revalidatePath(
    `/clinic/${membership.clinicId}/patients/${patientId.data}/estimates/${parsed.data.estimateId}`,
  );
  revalidatePath(
    `/clinic/${membership.clinicId}/patients/${patientId.data}/treatments/${treatmentPlanId}`,
  );
  return { success: "Estimate status and history were updated." };
}
