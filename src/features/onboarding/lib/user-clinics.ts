import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { ExistingClinicMembership } from "@/features/onboarding/lib/onboarding";

export async function getUserClinicMemberships(
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

  return memberships.map(({ clinicId, clinic }) => ({
    clinicId,
    clinicName: clinic.name,
  }));
}
