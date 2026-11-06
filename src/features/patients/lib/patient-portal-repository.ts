import "server-only";

import {
  AppointmentStatus,
  TreatmentEstimateStatus,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export async function listPatientPortalRecords(email: string) {
  const now = new Date();
  const patients = await prisma.patient.findMany({
    where: {
      normalizedEmail: email.toLowerCase(),
      portalAccessEnabled: true,
      portalAccessEnabledAt: { not: null },
    },
    orderBy: [{ clinic: { name: "asc" } }, { fullName: "asc" }],
    select: {
      id: true,
      fullName: true,
      appointments: {
        where: {
          scheduledAt: { gte: now },
          status: {
            notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
          },
        },
        orderBy: { scheduledAt: "asc" },
        take: 10,
        select: {
          scheduledAt: true,
          type: true,
          status: true,
          clinic: { select: { timeZone: true } },
        },
      },
      treatmentEstimates: {
        where: {
          status: {
            in: [
              TreatmentEstimateStatus.SENT,
              TreatmentEstimateStatus.ACCEPTED,
            ],
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          estimateDate: true,
          validityDate: true,
          totalAmount: true,
          currency: true,
          status: true,
        },
      },
      clinic: {
        select: {
          name: true,
          phoneNumber: true,
        },
      },
    },
  });
  return patients;
}
