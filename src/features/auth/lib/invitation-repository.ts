import "server-only";

import { ClinicInvitationStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  assertStaffCapacity,
  BillingAccessRestrictedError,
  BillingLimitReachedError,
} from "@/features/billing/lib/billing-entitlements";

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
      select: { id: true, clinicId: true, role: true },
    });
    for (const invitation of invitations) {
      const lockKey = `clinic-staff-seats:${invitation.clinicId}`;
      await transaction.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
      `;

      if (invitation.role === "STAFF") {
        try {
          await assertStaffCapacity(transaction, invitation.clinicId);
        } catch (error) {
          // Keep the invitation pending so it can be activated after an
          // upgrade or after the clinic frees a staff seat.
          if (
            error instanceof BillingAccessRestrictedError ||
            (error instanceof BillingLimitReachedError && error.limit === "staff")
          ) {
            continue;
          }
          throw error;
        }
      }

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
        },
        update: {},
      });
    }
  });
}
