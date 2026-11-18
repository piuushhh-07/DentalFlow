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
      archivedAt: null,
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
      recentAppointments: {
        where: {
          scheduledAt: { lt: now },
          status: { not: AppointmentStatus.CANCELLED },
        },
        orderBy: { scheduledAt: "desc" },
        take: 10,
        select: {
          scheduledAt: true,
          type: true,
          status: true,
        },
      },
      treatmentPlans: {
        where: { status: { not: "CANCELLED" } },
        orderBy: { createdAt: "desc" },
        take: 15,
        select: {
          name: true,
          type: true,
          status: true,
          totalVisits: true,
          completedAt: true,
          createdAt: true,
          visits: {
            orderBy: { visitNumber: "asc" },
            select: {
              visitNumber: true,
              dueDate: true,
              status: true,
              completedAt: true,
            },
          },
        },
      },
      digitalPrescriptions: {
        where: { finalizedAt: { not: null } },
        orderBy: [{ prescriptionDate: "desc" }, { createdAt: "desc" }],
        take: 10,
        select: {
          prescriptionDate: true,
          diagnosisNotes: true,
          additionalAdvice: true,
          followUpDate: true,
          clinicNameSnapshot: true,
          clinicPhoneSnapshot: true,
          authorNameSnapshot: true,
          authorRegistrationSnapshot: true,
          medicines: {
            orderBy: { position: "asc" },
            select: {
              medicineName: true,
              dosage: true,
              route: true,
              frequency: true,
              duration: true,
              quantity: true,
              instructions: true,
            },
          },
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
          publicBookingEnabled: true,
          publicBookingSlug: true,
        },
      },
    },
  });
  return patients;
}
