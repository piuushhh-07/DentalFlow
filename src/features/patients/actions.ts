"use server";

import { ClinicRole, Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  requireClinicMembership,
  requireClinicRole,
} from "@/features/auth/lib/server-auth";
import {
  BillingAccessRestrictedError,
  BillingLimitReachedError,
} from "@/features/billing/lib/billing-entitlements";
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
import { createSupabaseServerActionClient } from "@/lib/supabase/server";

export type PatientPortalActionState = Readonly<{
  error?: string;
  success?: string;
}>;

export type PatientActionState = Readonly<{
  errors?: Partial<
    Record<"fullName" | "phoneNumber" | "email" | "notes", string[]>
  >;
  error?: string;
}>;

const clinicIdSchema = z.string().uuid();

function readPatientInput(formData: FormData) {
  return patientInputSchema.safeParse({
    fullName: formData.get("fullName"),
    phoneNumber: formData.get("phoneNumber"),
    email: formData.get("email") ?? "",
    portalAccessEnabled: formData.get("portalAccessEnabled") === "on",
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
    if (error instanceof BillingLimitReachedError) {
      return {
        error:
          "This clinic has reached its patient limit. Review the subscription in Billing to continue adding patients.",
      };
    }
    if (error instanceof BillingAccessRestrictedError) {
      return {
        error:
          "New patient records are paused for this subscription. Existing clinical records remain available.",
      };
    }
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

  redirect(`/clinic/${membership.clinicId}/patients/${patientId}`);
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

  redirect(`/clinic/${membership.clinicId}/patients/${patientId.data}`);
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

  const membership = await requireClinicRole(requestedClinicId.data, [
    ClinicRole.OWNER,
  ]);

  try {
    const deleted = await deleteClinicPatient(
      membership.clinicId,
      patientId.data,
    );

    if (!deleted) {
      return {
        error:
          "This patient cannot be deleted while linked clinical, appointment, financial, insurance, recall, message, prescription, or export history exists. Archive or retain the record instead.",
      };
    }
  } catch (error) {
    logPatientOperationError("Patient deletion failed", error);
    return { error: "We couldn't delete this patient. Please try again." };
  }

  redirect(`/clinic/${membership.clinicId}/patients`);
}

export async function requestPatientPortalMagicLink(
  _previousState: PatientPortalActionState,
  formData: FormData,
): Promise<PatientPortalActionState> {
  const parsedEmail = z
    .string()
    .trim()
    .email()
    .max(254)
    .safeParse(formData.get("email"));
  if (!parsedEmail.success) {
    return { error: "Enter a valid email address." };
  }

  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const siteUrl =
    configuredSiteUrl ??
    (process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : undefined);
  if (!siteUrl) {
    console.error("Patient portal magic link requires NEXT_PUBLIC_SITE_URL.");
    return { error: "Patient portal sign-in is not configured. Contact the clinic." };
  }

  let redirectTo: string;
  try {
    redirectTo = new URL("/portal/auth/callback", siteUrl).toString();
  } catch (error) {
    console.error("Patient portal site URL is invalid.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return { error: "Patient portal sign-in is not configured. Contact the clinic." };
  }

  const supabase = await createSupabaseServerActionClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsedEmail.data.toLowerCase(),
    options: { emailRedirectTo: redirectTo },
  });
  if (error) {
    console.error("Patient portal magic link request failed.", {
      status: error.status,
      code: error.code,
    });
    return { error: "We couldn't send a sign-in link. Please try again later." };
  }

  return {
    success:
      "If portal access is enabled for this email, a secure sign-in link will arrive shortly.",
  };
}

export async function signOutPatientPortal() {
  const supabase = await createSupabaseServerActionClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error("Unable to end the patient portal session.", {
      cause: error,
    });
  }
  redirect("/portal");
}
