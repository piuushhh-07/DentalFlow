import "server-only";

import { ClinicInvitationStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export async function listClinicTeam(clinicId: string) {
  const [members, invitations] = await Promise.all([
    prisma.clinicMembership.findMany({
      where: { clinicId },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: {
        userId: true,
        role: true,
        createdAt: true,
        user: { select: { displayName: true, email: true } },
      },
    }),
    prisma.clinicInvitation.findMany({
      where: {
        clinicId,
        status: ClinicInvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
      },
    }),
  ]);
  return { members, invitations };
}
