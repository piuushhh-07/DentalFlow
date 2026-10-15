"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/features/auth/lib/server-auth";
import {
  onboardClinicForUser,
  type ExistingClinicMembership,
} from "@/features/onboarding/lib/onboarding";
import { prismaClinicOnboardingRepository } from "@/features/onboarding/lib/prisma-onboarding-repository";
import { clinicOnboardingSchema } from "@/features/onboarding/lib/validation";

export type ClinicOnboardingState = Readonly<{
  errors?: Partial<
    Record<
      "name" | "phoneNumber" | "timeZone" | "contactEmail" | "address",
      string[]
    >
  >;
  formError?: string;
}>;

export async function createClinic(
  _previousState: ClinicOnboardingState,
  formData: FormData,
): Promise<ClinicOnboardingState> {
  const user = await getAuthenticatedUser();
  let memberships: ExistingClinicMembership[];

  try {
    memberships = await prismaClinicOnboardingRepository.listMemberships(
      user.id,
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("Clinic membership lookup failed", { code: error.code });
    } else {
      console.error("Clinic membership lookup failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }

    return {
      formError: "We couldn't verify your clinic access. Please try again.",
    };
  }

  if (memberships.length > 0) {
    redirect(
      memberships.length === 1
        ? `/clinic/${memberships[0].clinicId}`
        : "/clinics",
    );
  }

  const parsed = clinicOnboardingSchema.safeParse({
    name: formData.get("name"),
    phoneNumber: formData.get("phoneNumber"),
    timeZone: formData.get("timeZone"),
    contactEmail: formData.get("contactEmail"),
    address: formData.get("address"),
  });

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      formError: "Please correct the highlighted fields.",
    };
  }

  let redirectTo: string;

  try {
    const result = await onboardClinicForUser(
      user.id,
      parsed.data,
      prismaClinicOnboardingRepository,
    );
    redirectTo = result.redirectTo;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("Clinic onboarding database operation failed", {
        code: error.code,
      });
    } else {
      console.error("Clinic onboarding failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }

    return {
      formError: "We couldn't finish setting up your clinic. Please try again.",
    };
  }

  redirect(redirectTo);
}
