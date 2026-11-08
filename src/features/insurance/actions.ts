"use server";

import {
  InsuranceDocumentType,
  InsurancePreAuthorizationStatus,
  Prisma,
} from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ClinicRole } from "@prisma/client";
import {
  requireClinicMembership,
  requireClinicRole,
} from "@/features/auth/lib/server-auth";
import {
  archiveInsuranceProvider,
  authorizeInsuranceDocumentUpload,
  completeInsuranceDocumentStorageCleanup,
  createInsuranceClaim,
  createInsuranceDocumentRequirement,
  createInsurancePayment,
  createInsurancePolicy,
  createInsurancePreAuthorization,
  createInsuranceProvider,
  InsuranceRecordNotFoundError,
  InsuranceValidationError,
  isInsuranceUniqueConflict,
  registerInsuranceDocumentUpload,
  scheduleInsuranceFollowUp,
  updateInsuranceClaimDetails,
  updateInsuranceClaimStatus,
  updateInsuranceDocumentStatus,
  updateInsurancePreAuthorizationStatus,
  updateInsuranceProvider,
} from "@/features/insurance/lib/insurance-repository";
import {
  claimInputSchema,
  claimStatusInputSchema,
  decisionInputSchema,
  documentInputSchema,
  documentStatusInputSchema,
  paymentInputSchema,
  policyInputSchema,
  positiveCurrencyAmountSchema,
  preAuthorizationInputSchema,
  providerInputSchema,
} from "@/features/insurance/lib/insurance-validation";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";

const INSURANCE_DOCUMENT_BUCKET = "dentalflow-insurance-private";

const uuid = z.string().uuid();

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function normalizePaymentDateTime(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) {
    return value;
  }
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  return `${withSeconds}+05:30`;
}

function errorRedirect(path: string, code: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}error=${encodeURIComponent(code)}`);
}

function logInsuranceError(operation: string, error: unknown): void {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error(operation, { code: error.code });
    return;
  }
  console.error(operation, {
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
}

function redirectForInsuranceError(path: string, error: unknown): never {
  if (error instanceof InsuranceRecordNotFoundError) {
    errorRedirect(path, "not-found");
  }
  if (error instanceof InsuranceValidationError) {
    errorRedirect(path, "invalid-transition");
  }
  if (isInsuranceUniqueConflict(error)) {
    errorRedirect(path, "duplicate");
  }
  logInsuranceError("Insurance operation failed", error);
  errorRedirect(path, "save-failed");
}

export async function createInsuranceProviderAction(formData: FormData) {
  const clinicId = uuid.safeParse(text(formData, "clinicId"));
  const parsed = providerInputSchema.safeParse({
    name: text(formData, "name"),
    kind: text(formData, "kind"),
    phoneNumber: text(formData, "phoneNumber"),
    email: text(formData, "email"),
    website: text(formData, "website"),
    claimInstructions: text(formData, "claimInstructions"),
    notes: text(formData, "notes"),
  });
  if (!clinicId.success || !parsed.success) errorRedirect("/login", "invalid");
  const membership = await requireClinicRole(clinicId.data, [ClinicRole.OWNER]);
  try {
    await createInsuranceProvider(membership.clinicId, parsed.data);
  } catch (error) {
    redirectForInsuranceError(
      `/clinic/${membership.clinicId}/insurance/providers/new`,
      error,
    );
  }
  redirect(`/clinic/${membership.clinicId}/insurance/providers`);
}

export async function updateInsuranceProviderAction(formData: FormData) {
  const clinicId = uuid.safeParse(text(formData, "clinicId"));
  const providerId = uuid.safeParse(text(formData, "providerId"));
  const parsed = providerInputSchema.safeParse({
    name: text(formData, "name"),
    kind: text(formData, "kind"),
    phoneNumber: text(formData, "phoneNumber"),
    email: text(formData, "email"),
    website: text(formData, "website"),
    claimInstructions: text(formData, "claimInstructions"),
    notes: text(formData, "notes"),
  });
  if (!clinicId.success || !providerId.success || !parsed.success) {
    errorRedirect("/login", "invalid");
  }
  const membership = await requireClinicRole(clinicId.data, [ClinicRole.OWNER]);
  let updated: boolean;
  try {
    updated = await updateInsuranceProvider(
      membership.clinicId,
      providerId.data,
      parsed.data,
    );
  } catch (error) {
    redirectForInsuranceError(
      `/clinic/${membership.clinicId}/insurance/providers/${providerId.data}/edit`,
      error,
    );
  }
  if (!updated) {
    errorRedirect(
      `/clinic/${membership.clinicId}/insurance/providers`,
      "not-found",
    );
  }
  redirect(`/clinic/${membership.clinicId}/insurance/providers`);
}

export async function archiveInsuranceProviderAction(formData: FormData) {
  const clinicId = uuid.safeParse(text(formData, "clinicId"));
  const providerId = uuid.safeParse(text(formData, "providerId"));
  if (!clinicId.success || !providerId.success)
    errorRedirect("/login", "invalid");
  const membership = await requireClinicRole(clinicId.data, [ClinicRole.OWNER]);
  let archived: boolean;
  try {
    archived = await archiveInsuranceProvider(
      membership.clinicId,
      providerId.data,
    );
  } catch (error) {
    redirectForInsuranceError(
      `/clinic/${membership.clinicId}/insurance/providers`,
      error,
    );
  }
  if (!archived) {
    errorRedirect(
      `/clinic/${membership.clinicId}/insurance/providers`,
      "not-found",
    );
  }
  redirect(`/clinic/${membership.clinicId}/insurance/providers`);
}

export async function createInsurancePolicyAction(formData: FormData) {
  const clinicId = uuid.safeParse(text(formData, "clinicId"));
  const parsed = policyInputSchema.safeParse({
    patientId: text(formData, "patientId"),
    providerId: text(formData, "providerId"),
    policyNumber: text(formData, "policyNumber"),
    memberReference: text(formData, "memberReference"),
    validFrom: text(formData, "validFrom"),
    validUntil: text(formData, "validUntil"),
    coverageLimit: text(formData, "coverageLimit"),
    deductible: text(formData, "deductible"),
    coPaymentPercent: text(formData, "coPaymentPercent"),
    exclusions: text(formData, "exclusions"),
    coverageNotes: text(formData, "coverageNotes"),
  });
  if (!clinicId.success || !parsed.success) errorRedirect("/login", "invalid");
  const membership = await requireClinicMembership(clinicId.data);
  try {
    await createInsurancePolicy(membership.clinicId, parsed.data);
  } catch (error) {
    redirectForInsuranceError(
      `/clinic/${membership.clinicId}/insurance/policies/new?patientId=${encodeURIComponent(parsed.data.patientId)}`,
      error,
    );
  }
  redirect(`/clinic/${membership.clinicId}/insurance/policies`);
}

export async function createInsuranceClaimAction(formData: FormData) {
  const clinicId = uuid.safeParse(text(formData, "clinicId"));
  const parsed = claimInputSchema.safeParse({
    patientId: text(formData, "patientId"),
    policyId: text(formData, "policyId"),
    treatmentPlanId: text(formData, "treatmentPlanId"),
    preAuthorizationId: text(formData, "preAuthorizationId"),
    type: text(formData, "type"),
    treatmentDetails: text(formData, "treatmentDetails"),
    treatmentDate: text(formData, "treatmentDate"),
    estimatedCost: text(formData, "estimatedCost"),
    amountClaimed: text(formData, "amountClaimed"),
    claimReference: text(formData, "claimReference"),
    notes: text(formData, "notes"),
  });
  if (!clinicId.success || !parsed.success) errorRedirect("/login", "invalid");
  const membership = await requireClinicMembership(clinicId.data);
  let claim: Awaited<ReturnType<typeof createInsuranceClaim>>;
  try {
    claim = await createInsuranceClaim(
      membership.clinicId,
      membership.userId,
      parsed.data,
    );
  } catch (error) {
    redirectForInsuranceError(
      `/clinic/${membership.clinicId}/insurance/claims/new?patientId=${encodeURIComponent(parsed.data.patientId)}`,
      error,
    );
  }
  redirect(`/clinic/${membership.clinicId}/insurance/claims/${claim.id}`);
}

export async function updateInsuranceClaimDetailsAction(formData: FormData) {
  const clinicId = uuid.safeParse(text(formData, "clinicId"));
  const claimId = uuid.safeParse(text(formData, "claimId"));
  const parsed = z
    .object({
      treatmentDetails: z.string().trim().min(2).max(2000),
      treatmentDate: z.string().date(),
      estimatedCost: positiveCurrencyAmountSchema,
      amountClaimed: positiveCurrencyAmountSchema,
      claimReference: z
        .string()
        .trim()
        .max(120)
        .transform((v) => v || null),
      notes: z
        .string()
        .trim()
        .max(10000)
        .transform((v) => v || null),
    })
    .safeParse({
      treatmentDetails: text(formData, "treatmentDetails"),
      treatmentDate: text(formData, "treatmentDate"),
      estimatedCost: text(formData, "estimatedCost"),
      amountClaimed: text(formData, "amountClaimed"),
      claimReference: text(formData, "claimReference"),
      notes: text(formData, "notes"),
    });
  if (!clinicId.success || !claimId.success || !parsed.success) {
    errorRedirect("/login", "invalid");
  }
  const membership = await requireClinicMembership(clinicId.data);
  try {
    await updateInsuranceClaimDetails(
      membership.clinicId,
      membership.userId,
      claimId.data,
      parsed.data,
    );
  } catch (error) {
    redirectForInsuranceError(
      `/clinic/${membership.clinicId}/insurance/claims/${claimId.data}`,
      error,
    );
  }
  redirect(`/clinic/${membership.clinicId}/insurance/claims/${claimId.data}`);
}

export async function updateInsuranceClaimStatusAction(formData: FormData) {
  const clinicId = uuid.safeParse(text(formData, "clinicId"));
  const claimId = uuid.safeParse(text(formData, "claimId"));
  const parsed = claimStatusInputSchema.safeParse({
    status: text(formData, "status"),
    approvedAmount: text(formData, "approvedAmount"),
    rejectionReason: text(formData, "rejectionReason"),
  });
  if (!clinicId.success || !claimId.success || !parsed.success) {
    errorRedirect("/login", "invalid");
  }
  const membership = await requireClinicMembership(clinicId.data);
  try {
    await updateInsuranceClaimStatus(
      membership.clinicId,
      membership.userId,
      claimId.data,
      parsed.data,
    );
  } catch (error) {
    redirectForInsuranceError(
      `/clinic/${membership.clinicId}/insurance/claims/${claimId.data}`,
      error,
    );
  }
  redirect(`/clinic/${membership.clinicId}/insurance/claims/${claimId.data}`);
}

export async function scheduleInsuranceFollowUpAction(formData: FormData) {
  const clinicId = uuid.safeParse(text(formData, "clinicId"));
  const claimId = uuid.safeParse(text(formData, "claimId"));
  const followUpDate = z
    .union([z.string().date(), z.literal("")])
    .safeParse(text(formData, "followUpDate"));
  if (!clinicId.success || !claimId.success || !followUpDate.success) {
    errorRedirect("/login", "invalid");
  }
  const membership = await requireClinicMembership(clinicId.data);
  try {
    await scheduleInsuranceFollowUp(
      membership.clinicId,
      membership.userId,
      claimId.data,
      followUpDate.data ? new Date(`${followUpDate.data}T00:00:00.000Z`) : null,
    );
  } catch (error) {
    redirectForInsuranceError(
      `/clinic/${membership.clinicId}/insurance/claims/${claimId.data}`,
      error,
    );
  }
  redirect(`/clinic/${membership.clinicId}/insurance/claims/${claimId.data}`);
}

export async function createInsurancePaymentAction(formData: FormData) {
  const clinicId = uuid.safeParse(text(formData, "clinicId"));
  const claimId = uuid.safeParse(text(formData, "claimId"));
  const parsed = paymentInputSchema.safeParse({
    kind: text(formData, "kind"),
    amount: text(formData, "amount"),
    paidAt: normalizePaymentDateTime(text(formData, "paidAt")),
    reference: text(formData, "reference"),
    notes: text(formData, "notes"),
  });
  if (!clinicId.success || !claimId.success || !parsed.success) {
    errorRedirect("/login", "invalid");
  }
  const membership = await requireClinicMembership(clinicId.data);
  try {
    await createInsurancePayment(
      membership.clinicId,
      membership.userId,
      claimId.data,
      { ...parsed.data, paidAt: new Date(parsed.data.paidAt) },
    );
  } catch (error) {
    redirectForInsuranceError(
      `/clinic/${membership.clinicId}/insurance/claims/${claimId.data}`,
      error,
    );
  }
  redirect(`/clinic/${membership.clinicId}/insurance/claims/${claimId.data}`);
}

export async function createInsurancePreAuthorizationAction(
  formData: FormData,
) {
  const clinicId = uuid.safeParse(text(formData, "clinicId"));
  const parsed = preAuthorizationInputSchema.safeParse({
    patientId: text(formData, "patientId"),
    policyId: text(formData, "policyId"),
    treatmentPlanId: text(formData, "treatmentPlanId"),
    proposedTreatment: text(formData, "proposedTreatment"),
    estimatedCost: text(formData, "estimatedCost"),
    requestReference: text(formData, "requestReference"),
  });
  if (!clinicId.success || !parsed.success) errorRedirect("/login", "invalid");
  const membership = await requireClinicMembership(clinicId.data);
  let result: Awaited<ReturnType<typeof createInsurancePreAuthorization>>;
  try {
    result = await createInsurancePreAuthorization(
      membership.clinicId,
      membership.userId,
      parsed.data,
    );
  } catch (error) {
    redirectForInsuranceError(
      `/clinic/${membership.clinicId}/insurance/pre-authorizations/new?patientId=${encodeURIComponent(parsed.data.patientId)}`,
      error,
    );
  }
  redirect(
    `/clinic/${membership.clinicId}/insurance/pre-authorizations/${result.id}`,
  );
}

export async function updateInsurancePreAuthorizationStatusAction(
  formData: FormData,
) {
  const clinicId = uuid.safeParse(text(formData, "clinicId"));
  const preAuthorizationId = uuid.safeParse(
    text(formData, "preAuthorizationId"),
  );
  const parsed = decisionInputSchema.safeParse({
    status: text(formData, "status"),
    approvedAmount: text(formData, "approvedAmount"),
    conditions: text(formData, "conditions"),
    expiresAt: text(formData, "expiresAt"),
    rejectionReason: text(formData, "rejectionReason"),
  });
  if (!clinicId.success || !preAuthorizationId.success || !parsed.success) {
    errorRedirect("/login", "invalid");
  }
  const membership = await requireClinicMembership(clinicId.data);
  try {
    await updateInsurancePreAuthorizationStatus(
      membership.clinicId,
      membership.userId,
      preAuthorizationId.data,
      {
        ...parsed.data,
        status: parsed.data
          .status as (typeof InsurancePreAuthorizationStatus)[keyof typeof InsurancePreAuthorizationStatus],
        expiresAt: parsed.data.expiresAt
          ? new Date(`${parsed.data.expiresAt}T18:29:59.999Z`)
          : null,
      },
    );
  } catch (error) {
    redirectForInsuranceError(
      `/clinic/${membership.clinicId}/insurance/pre-authorizations/${preAuthorizationId.data}`,
      error,
    );
  }
  redirect(`/clinic/${membership.clinicId}/insurance/pre-authorizations`);
}

export async function createInsuranceDocumentRequirementAction(
  formData: FormData,
) {
  const clinicId = uuid.safeParse(text(formData, "clinicId"));
  const claimId = uuid.safeParse(text(formData, "claimId"));
  const parsed = documentInputSchema.safeParse({
    type: text(formData, "type"),
    name: text(formData, "name"),
  });
  if (!clinicId.success || !claimId.success || !parsed.success) {
    errorRedirect("/login", "invalid");
  }
  const membership = await requireClinicMembership(clinicId.data);
  try {
    await createInsuranceDocumentRequirement(
      membership.clinicId,
      membership.userId,
      claimId.data,
      {
        type: parsed.data
          .type as (typeof InsuranceDocumentType)[keyof typeof InsuranceDocumentType],
        name: parsed.data.name,
      },
    );
  } catch (error) {
    redirectForInsuranceError(
      `/clinic/${membership.clinicId}/insurance/claims/${claimId.data}`,
      error,
    );
  }
  redirect(`/clinic/${membership.clinicId}/insurance/claims/${claimId.data}`);
}

export async function registerInsuranceDocumentUploadAction(
  clinicIdValue: string,
  claimIdValue: string,
  documentIdValue: string,
  storagePath: string,
) {
  const clinicId = uuid.safeParse(clinicIdValue);
  const claimId = uuid.safeParse(claimIdValue);
  const documentId = uuid.safeParse(documentIdValue);
  if (!clinicId.success || !claimId.success || !documentId.success) {
    return { error: "The document could not be attached to this claim." };
  }
  const membership = await requireClinicMembership(clinicId.data);
  try {
    const registration = await registerInsuranceDocumentUpload(
      membership.clinicId,
      membership.userId,
      claimId.data,
      documentId.data,
      storagePath,
    );
    if (!registration.registered) {
      return {
        error:
          "Another upload was saved before this document could be registered.",
        cleanupAuthorized: registration.cleanupAuthorized,
      };
    }
    return { success: true as const };
  } catch (error) {
    logInsuranceError("Insurance document registration failed", error);
    return { error: "The uploaded document could not be registered." };
  }
}

export async function authorizeInsuranceDocumentUploadAction(
  clinicIdValue: string,
  claimIdValue: string,
  documentIdValue: string,
  storagePath: string,
) {
  const clinicId = uuid.safeParse(clinicIdValue);
  const claimId = uuid.safeParse(claimIdValue);
  const documentId = uuid.safeParse(documentIdValue);
  if (!clinicId.success || !claimId.success || !documentId.success) {
    return { error: "The document upload could not be prepared." };
  }
  const membership = await requireClinicMembership(clinicId.data);
  try {
    await authorizeInsuranceDocumentUpload(
      membership.clinicId,
      claimId.data,
      documentId.data,
      storagePath,
    );
    return { success: true as const };
  } catch (error) {
    logInsuranceError("Insurance document upload preparation failed", error);
    return { error: "The document upload could not be prepared." };
  }
}

export async function completeInsuranceDocumentStorageCleanupAction(
  clinicIdValue: string,
  claimIdValue: string,
  documentIdValue: string,
  storagePath: string,
) {
  const clinicId = uuid.safeParse(clinicIdValue);
  const claimId = uuid.safeParse(claimIdValue);
  const documentId = uuid.safeParse(documentIdValue);
  if (!clinicId.success || !claimId.success || !documentId.success) {
    return { error: "The replaced document could not be cleaned up." };
  }
  const membership = await requireClinicMembership(clinicId.data);
  try {
    const supabase = await createSupabaseServerActionClient();
    const { error: storageError } = await supabase.storage
      .from(INSURANCE_DOCUMENT_BUCKET)
      .remove([storagePath]);
    if (storageError) {
      logInsuranceError(
        "Insurance document Storage cleanup failed",
        storageError,
      );
      return { error: "The replaced document could not be removed." };
    }
    const completed = await completeInsuranceDocumentStorageCleanup(
      membership.clinicId,
      claimId.data,
      documentId.data,
      storagePath,
    );
    return completed
      ? { success: true as const }
      : { error: "The replaced document cleanup authorization was not found." };
  } catch (error) {
    logInsuranceError("Insurance document cleanup finalization failed", error);
    return { error: "The replaced document cleanup could not be finalized." };
  }
}

export async function updateInsuranceDocumentStatusAction(formData: FormData) {
  const clinicId = uuid.safeParse(text(formData, "clinicId"));
  const claimId = uuid.safeParse(text(formData, "claimId"));
  const documentId = uuid.safeParse(text(formData, "documentId"));
  const parsed = documentStatusInputSchema.safeParse({
    status: text(formData, "status"),
    rejectionReason: text(formData, "rejectionReason"),
  });
  if (
    !clinicId.success ||
    !claimId.success ||
    !documentId.success ||
    !parsed.success
  ) {
    errorRedirect("/login", "invalid");
  }
  const membership = await requireClinicMembership(clinicId.data);
  try {
    await updateInsuranceDocumentStatus(
      membership.clinicId,
      membership.userId,
      claimId.data,
      documentId.data,
      parsed.data,
    );
  } catch (error) {
    redirectForInsuranceError(
      `/clinic/${membership.clinicId}/insurance/claims/${claimId.data}`,
      error,
    );
  }
  redirect(`/clinic/${membership.clinicId}/insurance/claims/${claimId.data}`);
}

export async function getInsuranceDocumentPathAction(
  clinicIdValue: string,
  claimIdValue: string,
  documentIdValue: string,
) {
  const clinicId = uuid.safeParse(clinicIdValue);
  const claimId = uuid.safeParse(claimIdValue);
  const documentId = uuid.safeParse(documentIdValue);
  if (!clinicId.success || !claimId.success || !documentId.success) {
    return { error: "This document is not available." };
  }
  const membership = await requireClinicMembership(clinicId.data);
  const { getInsuranceDocumentStoragePath } =
    await import("@/features/insurance/lib/insurance-repository");
  const path = await getInsuranceDocumentStoragePath(
    membership.clinicId,
    claimId.data,
    documentId.data,
  );
  return path ? { path } : { error: "This document is not available." };
}
