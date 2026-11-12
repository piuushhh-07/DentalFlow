"use server";

import { ClinicRole, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireClinicRole } from "@/features/auth/lib/server-auth";
import { prisma } from "@/lib/db/prisma";

const profileSchema = z.object({
  clinicId: z.string().uuid(),
  name: z.string().trim().min(2, "Enter at least 2 characters.").max(160),
  phoneNumber: z
    .string()
    .trim()
    .regex(
      /^\+91[6-9]\d{9}$/,
      "Enter a valid Indian mobile number in +91 format.",
    ),
  contactEmail: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() || null : value),
    z.string().email("Enter a valid email address.").max(254).nullable(),
  ),
  address: z
    .string()
    .trim()
    .max(400, "Address must be 400 characters or fewer."),
  timeZone: z
    .string()
    .min(1)
    .max(64)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en-IN", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Choose a valid timezone."),
});

export type ClinicProfileState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<
    Record<
      "name" | "phoneNumber" | "contactEmail" | "address" | "timeZone",
      string
    >
  >;
};

export async function updateClinicProfile(
  _previousState: ClinicProfileState,
  formData: FormData,
): Promise<ClinicProfileState> {
  const parsed = profileSchema.safeParse({
    clinicId: formData.get("clinicId"),
    name: formData.get("name"),
    phoneNumber: formData.get("phoneNumber"),
    contactEmail: formData.get("contactEmail"),
    address: formData.get("address") ?? "",
    timeZone: formData.get("timeZone"),
  });

  if (!parsed.success) {
    const fieldErrors: ClinicProfileState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && key !== "clinicId") {
        fieldErrors[
          key as keyof NonNullable<ClinicProfileState["fieldErrors"]>
        ] ??= issue.message;
      }
    }
    return { error: "Please check the highlighted fields.", fieldErrors };
  }

  const membership = await requireClinicRole(parsed.data.clinicId, [
    ClinicRole.OWNER,
  ]);
  try {
    await prisma.clinic.update({
      where: { id: membership.clinicId },
      data: {
        name: parsed.data.name,
        phoneNumber: parsed.data.phoneNumber,
        contactEmail: parsed.data.contactEmail,
        address: parsed.data.address || null,
        timeZone: parsed.data.timeZone,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("Clinic profile update failed", { code: error.code });
    } else {
      console.error("Clinic profile update failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
    return { error: "We couldn't save your clinic details. Please try again." };
  }

  revalidatePath(`/clinic/${membership.clinicId}`);
  revalidatePath(`/clinic/${membership.clinicId}/settings/profile`);
  return { success: "Clinic details saved successfully." };
}
