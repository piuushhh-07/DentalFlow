import "server-only";

import { prisma } from "@/lib/db/prisma";
import { TEMPLATE_NAME } from "@/features/messages/lib/template-validation";

export async function getClinicWhatsAppTemplate(clinicId: string) {
  const template = await prisma.messageTemplate.findUnique({
    where: { clinicId_name: { clinicId, name: TEMPLATE_NAME } },
    select: { id: true, name: true, content: true, isActive: true },
  });
  return template?.isActive ? template : null;
}

export async function saveClinicWhatsAppTemplate(
  clinicId: string,
  content: string,
) {
  return prisma.messageTemplate.upsert({
    where: { clinicId_name: { clinicId, name: TEMPLATE_NAME } },
    create: { clinicId, name: TEMPLATE_NAME, content, isActive: true },
    update: { content, isActive: true },
    select: { id: true, name: true, content: true },
  });
}

export async function getClinicTemplatePreviewPatient(clinicId: string) {
  return prisma.patient.findFirst({
    where: { clinicId },
    orderBy: [{ fullName: "asc" }, { createdAt: "asc" }],
    select: {
      fullName: true,
      treatmentPlans: {
        where: {
          clinicId,
          status: "ACTIVE",
          visits: { some: { clinicId } },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          name: true,
          totalVisits: true,
          visits: {
            where: { clinicId },
            orderBy: { visitNumber: "asc" },
            take: 1,
            select: { visitNumber: true, dueDate: true },
          },
        },
      },
      preventiveRecalls: {
        where: { clinicId, status: "ACTIVE" },
        orderBy: { dueDate: "asc" },
        take: 1,
        select: { dueDate: true },
      },
    },
  });
}
