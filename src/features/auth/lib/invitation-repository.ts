import "server-only";

import { ClinicInvitationStatus, ClinicRole } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export async function activatePendingClinicInvitations(
  userId: string,
  email: string,
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const now = new Date();
  await prisma.$transaction(async (transaction) => {
    const invitations = await transaction.clinicInvitation.findMany({
      where: {
        normalizedEmail,
        status: ClinicInvitationStatus.PENDING,
        expiresAt: { gt: now },
      },
      select: { id: true, clinicId: true, role: true, jobTitle: true },
    });
    for (const invitation of invitations) {
      const accepted = await transaction.clinicInvitation.updateMany({
        where: {
          id: invitation.id,
          status: ClinicInvitationStatus.PENDING,
          expiresAt: { gt: now },
        },
        data: {
          status: ClinicInvitationStatus.ACCEPTED,
          acceptedAt: now,
        },
      });
      if (accepted.count !== 1) continue;

      await transaction.clinicMembership.upsert({
        where: {
          userId_clinicId: {
            userId,
            clinicId: invitation.clinicId,
          },
        },
        create: {
          userId,
          clinicId: invitation.clinicId,
          role: invitation.role,
          permissionsConfigured: invitation.role === ClinicRole.STAFF,
        },
        update: {},
      });
      if (invitation.role === ClinicRole.STAFF) {
        await transaction.clinicStaffProfile.upsert({
          where: {
            userId_clinicId: {
              userId,
              clinicId: invitation.clinicId,
            },
          },
          create: {
            userId,
            clinicId: invitation.clinicId,
            jobTitle: invitation.jobTitle,
          },
          update: {
            jobTitle: invitation.jobTitle,
            active: true,
          },
        });
      }
    }
  });
}
