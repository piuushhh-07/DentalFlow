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
        active: true,
        permissionsConfigured: true,
        createdAt: true,
        user: { select: { displayName: true, email: true } },
        staffProfile: {
          select: { jobTitle: true, phoneNumber: true, active: true },
        },
        permissionGrants: { select: { permission: true } },
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
        jobTitle: true,
        expiresAt: true,
        createdAt: true,
      },
    }),
  ]);
  return { members, invitations };
}
