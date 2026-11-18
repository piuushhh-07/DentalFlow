"use server";

import { ClinicRole, PatientLeadSource, PatientLeadStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireClinicRole } from "@/features/auth/lib/server-auth";
import { normalizeIndianPhoneNumber } from "@/features/onboarding/lib/validation";
import { prisma } from "@/lib/db/prisma";

const uuid = z.string().uuid();
const leadSource = z.nativeEnum(PatientLeadSource);
const leadStatus = z.nativeEnum(PatientLeadStatus);
const createLeadSchema = z.object({
  clinicId: uuid,
  fullName: z.string().trim().min(2).max(160),
  phoneNumber: z.string().trim().min(8).max(20),
  email: z.union([z.literal(""), z.string().trim().email().max(254)]).optional(),
  source: leadSource,
  treatmentInterest: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(5000).optional(),
  nextFollowUpAt: z.union([z.literal(""), z.coerce.date()]).optional(),
  whatsappOptIn: z.boolean(),
});
const updateLeadSchema = z.object({
  clinicId: uuid,
  leadId: uuid,
  status: leadStatus,
  notes: z.string().trim().max(5000).optional(),
  nextFollowUpAt: z.union([z.literal(""), z.coerce.date()]).optional(),
});

function leadsPath(clinicId: string, status: string): string {
  return `/clinic/${clinicId}/leads?status=${status}`;
}

export async function createPatientLead(formData: FormData): Promise<never> {
  const parsed = createLeadSchema.safeParse({
    clinicId: formData.get("clinicId"),
    fullName: formData.get("fullName"),
    phoneNumber: formData.get("phoneNumber"),
    email: formData.get("email") ?? "",
    source: formData.get("source"),
    treatmentInterest: formData.get("treatmentInterest") ?? "",
    notes: formData.get("notes") ?? "",
    nextFollowUpAt: formData.get("nextFollowUpAt") ?? "",
    whatsappOptIn: formData.get("whatsappOptIn") === "on",
  });
  if (!parsed.success) redirect("/clinics");
  const membership = await requireClinicRole(parsed.data.clinicId, [ClinicRole.OWNER]);
  const normalizedPhone = normalizeIndianPhoneNumber(parsed.data.phoneNumber);
  if (!normalizedPhone) redirect(leadsPath(membership.clinicId, "invalid-phone"));
  const whatsappOptIn = parsed.data.whatsappOptIn;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.patientLead.create({
        data: {
          clinicId: membership.clinicId,
          fullName: parsed.data.fullName,
          phoneNumber: normalizedPhone,
          normalizedPhone,
          email: parsed.data.email ? parsed.data.email.toLowerCase() : null,
          source: parsed.data.source,
          treatmentInterest: parsed.data.treatmentInterest || null,
          notes: parsed.data.notes || null,
          nextFollowUpAt: parsed.data.nextFollowUpAt ? new Date(parsed.data.nextFollowUpAt) : null,
          whatsappOptIn,
          whatsappOptedInAt: whatsappOptIn ? new Date() : null,
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect(leadsPath(membership.clinicId, "duplicate-phone"));
    }
    console.error("Patient lead creation failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
    redirect(leadsPath(membership.clinicId, "error"));
  }
  revalidatePath(`/clinic/${membership.clinicId}/leads`);
  redirect(leadsPath(membership.clinicId, "created"));
}

export async function updatePatientLead(formData: FormData): Promise<never> {
  const parsed = updateLeadSchema.safeParse({
    clinicId: formData.get("clinicId"),
    leadId: formData.get("leadId"),
    status: formData.get("status"),
    notes: formData.get("notes") ?? "",
    nextFollowUpAt: formData.get("nextFollowUpAt") ?? "",
  });
  if (!parsed.success) redirect("/clinics");
  const membership = await requireClinicRole(parsed.data.clinicId, [ClinicRole.OWNER]);
  const result = await prisma.patientLead.updateMany({
    where: { id: parsed.data.leadId, clinicId: membership.clinicId },
    data: {
      status: parsed.data.status,
      notes: parsed.data.notes || null,
      nextFollowUpAt: parsed.data.nextFollowUpAt ? new Date(parsed.data.nextFollowUpAt) : null,
      ...(parsed.data.status === PatientLeadStatus.CONTACTED || parsed.data.status === PatientLeadStatus.APPOINTMENT_BOOKED
        ? { lastContactedAt: new Date() }
        : {}),
    },
  });
  if (result.count !== 1) redirect(leadsPath(membership.clinicId, "lead-not-found"));
  revalidatePath(`/clinic/${membership.clinicId}/leads`);
  redirect(leadsPath(membership.clinicId, "updated"));
}
