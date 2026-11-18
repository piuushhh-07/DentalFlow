"use server";

import { ClinicRole, PatientLeadSource, PatientLeadStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireClinicRole } from "@/features/auth/lib/server-auth";
import { normalizeIndianPhoneNumber } from "@/features/onboarding/lib/validation";
import { createClinicPatient } from "@/features/patients/lib/patient-repository";
import { patientInputSchema } from "@/features/patients/lib/patient-validation";
import { prisma } from "@/lib/db/prisma";

const uuid = z.string().uuid();
const leadSource = z.nativeEnum(PatientLeadSource);
const leadStatus = z.enum(["NEW", "CONTACTED", "APPOINTMENT_BOOKED", "LOST"]);
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
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.patientLead.findFirst({
      where: { id: parsed.data.leadId, clinicId: membership.clinicId },
      select: { status: true, convertedPatientId: true },
    });
    if (!existing || existing.convertedPatientId) return 0;
    const shouldMarkContacted =
      parsed.data.status !== existing.status &&
      (parsed.data.status === PatientLeadStatus.CONTACTED ||
        parsed.data.status === PatientLeadStatus.APPOINTMENT_BOOKED);
    const updated = await tx.patientLead.updateMany({
      where: { id: parsed.data.leadId, clinicId: membership.clinicId, convertedPatientId: null },
      data: {
        status: parsed.data.status,
        notes: parsed.data.notes || null,
        nextFollowUpAt: parsed.data.nextFollowUpAt ? new Date(parsed.data.nextFollowUpAt) : null,
        ...(shouldMarkContacted ? { lastContactedAt: new Date() } : {}),
      },
    });
    return updated.count;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (result !== 1) redirect(leadsPath(membership.clinicId, "lead-not-found"));
  revalidatePath(`/clinic/${membership.clinicId}/leads`);
  redirect(leadsPath(membership.clinicId, "updated"));
}

export async function convertPatientLeadToPatient(formData: FormData): Promise<never> {
  const parsed = z.object({ clinicId: uuid, leadId: uuid }).safeParse({
    clinicId: formData.get("clinicId"),
    leadId: formData.get("leadId"),
  });
  if (!parsed.success) redirect("/clinics");
  const membership = await requireClinicRole(parsed.data.clinicId, [ClinicRole.OWNER]);
  const lead = await prisma.patientLead.findFirst({
    where: { id: parsed.data.leadId, clinicId: membership.clinicId },
    select: {
      id: true, fullName: true, phoneNumber: true, normalizedPhone: true, email: true,
      notes: true, whatsappOptIn: true, whatsappOptedInAt: true, status: true, convertedPatientId: true,
    },
  });
  if (!lead) redirect(leadsPath(membership.clinicId, "lead-not-found"));
  if (lead.convertedPatientId) redirect(leadsPath(membership.clinicId, "already-converted"));
  if (lead.status === PatientLeadStatus.LOST) redirect(leadsPath(membership.clinicId, "lead-not-convertible"));

  let patient = await prisma.patient.findFirst({
    where: { clinicId: membership.clinicId, normalizedPhone: lead.normalizedPhone },
    select: { id: true, archivedAt: true },
  });
  if (patient?.archivedAt) redirect(leadsPath(membership.clinicId, "archived-patient-conflict"));
  if (!patient) {
    const parsedPatient = patientInputSchema.safeParse({
      fullName: lead.fullName,
      phoneNumber: lead.phoneNumber,
      email: lead.email ?? "",
      portalAccessEnabled: false,
      whatsappOptIn: lead.whatsappOptIn,
      notes: lead.notes ?? "",
    });
    if (!parsedPatient.success) redirect(leadsPath(membership.clinicId, "conversion-error"));
    try {
      const created = await createClinicPatient(membership.clinicId, {
        ...parsedPatient.data,
        whatsappOptedInAt: lead.whatsappOptedInAt,
      });
      patient = { id: created.id, archivedAt: null };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        patient = await prisma.patient.findFirst({
          where: { clinicId: membership.clinicId, normalizedPhone: lead.normalizedPhone, archivedAt: null },
          select: { id: true, archivedAt: true },
        });
      } else {
        console.error("Lead conversion failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
        redirect(leadsPath(membership.clinicId, "conversion-error"));
      }
    }
  }
  if (!patient || patient.archivedAt) redirect(leadsPath(membership.clinicId, "conversion-error"));
  const updated = await prisma.patientLead.updateMany({
    where: { id: lead.id, clinicId: membership.clinicId, convertedPatientId: null, status: { not: PatientLeadStatus.LOST } },
    data: {
      status: PatientLeadStatus.CONVERTED,
      convertedPatientId: patient.id,
      nextFollowUpAt: null,
      lastContactedAt: new Date(),
    },
  });
  if (updated.count !== 1) redirect(leadsPath(membership.clinicId, "already-converted"));
  revalidatePath(`/clinic/${membership.clinicId}/leads`);
  revalidatePath(`/clinic/${membership.clinicId}/patients`);
  revalidatePath(`/clinic/${membership.clinicId}/patients/${patient.id}`);
  redirect(leadsPath(membership.clinicId, "converted"));
}
