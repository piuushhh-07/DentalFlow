import "server-only";

import { ClinicRole, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  OnboardingMembershipConflictError,
  type ClinicOnboardingRepository,
  type ExistingClinicMembership,
} from "@/features/onboarding/lib/onboarding";
import type { ClinicOnboardingInput } from "@/features/onboarding/lib/validation";

function toClinicMemberships(
  memberships: Array<{
    clinicId: string;
    clinic: { name: string };
  }>,
): ExistingClinicMembership[] {
  return memberships.map(({ clinicId, clinic }) => ({
    clinicId,
    clinicName: clinic.name,
  }));
}

async function listMemberships(
  userId: string,
): Promise<ExistingClinicMembership[]> {
  const memberships = await prisma.clinicMembership.findMany({
    where: { userId, revokedAt: null },
    select: {
      clinicId: true,
      clinic: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return toClinicMemberships(memberships);
}

async function ensureOwnerClinic(
  userId: string,
  input: ClinicOnboardingInput,
): Promise<
  | { kind: "created"; clinicId: string }
  | { kind: "existing"; memberships: ExistingClinicMembership[] }
> {
  try {
    return await prisma.$transaction(async (transaction) => {
      await transaction.userProfile.upsert({
        where: { id: userId },
        create: { id: userId },
        update: {},
      });

      await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "user_profiles" WHERE "id" = ${userId}::uuid FOR UPDATE
      `;

      const memberships = await transaction.clinicMembership.findMany({
        where: { userId, revokedAt: null },
        select: {
          clinicId: true,
          clinic: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      });

      if (memberships.length > 0) {
        return {
          kind: "existing" as const,
          memberships: toClinicMemberships(memberships),
        };
      }

      const onboardingClinic = await transaction.clinic.findUnique({
        where: { onboardingUserId: userId },
        select: { id: true },
      });

      if (onboardingClinic) {
        throw new OnboardingMembershipConflictError();
      }

      const clinic = await transaction.clinic.create({
        data: {
          name: input.name,
          phoneNumber: input.phoneNumber,
          contactEmail: input.contactEmail,
          address: input.address,
          timeZone: input.timeZone,
          onboardingUserId: userId,
          memberships: {
            create: {
              userId,
              role: ClinicRole.OWNER,
            },
          },
        },
        select: { id: true },
      });

      return { kind: "created" as const, clinicId: clinic.id };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existingMemberships = await listMemberships(userId);

      if (existingMemberships.length > 0) {
        return { kind: "existing", memberships: existingMemberships };
      }

      throw new OnboardingMembershipConflictError();
    }

    throw error;
  }
}

export const prismaClinicOnboardingRepository: ClinicOnboardingRepository = {
  listMemberships,
  ensureOwnerClinic,
};
