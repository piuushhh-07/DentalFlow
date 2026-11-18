"use server";

import {
  AppointmentStatus,
  PatientAppointmentCancellationStatus,
  Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { resolveAuthenticatedUser } from "@/features/auth/lib/auth-session";
import { prisma } from "@/lib/db/prisma";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";

export type PatientCancellationActionState = Readonly<{
  error?: string;
  success?: string;
}>;

export async function requestPatientAppointmentCancellation(
  _previousState: PatientCancellationActionState,
  formData: FormData,
): Promise<PatientCancellationActionState> {
  const parsed = z.object({
    appointmentId: z.string().uuid(),
    reason: z.string().trim().max(500).optional().default(""),
  }).safeParse({
    appointmentId: formData.get("appointmentId"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) return { error: "Check the cancellation request and try again." };

  const supabase = await createSupabaseServerActionClient();
  const result = await supabase.auth.getUser();
  const user = resolveAuthenticatedUser(result.data.user, result.error);
  const email = user?.email?.toLowerCase();
  if (!email || !user?.email_confirmed_at) {
    return { error: "Sign in with your verified patient portal email to continue." };
  }

  const patient = await prisma.patient.findFirst({
    where: {
      normalizedEmail: email,
      portalAccessEnabled: true,
      portalAccessEnabledAt: { not: null },
      archivedAt: null,
    },
    select: { id: true, clinicId: true },
  });
  if (!patient) return { error: "This patient record is not available in the portal." };

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: parsed.data.appointmentId,
      clinicId: patient.clinicId,
      patientId: patient.id,
      scheduledAt: { gt: new Date() },
      status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
    },
    select: { id: true },
  });
  if (!appointment) {
    return { error: "This appointment can no longer be requested for cancellation. Contact the clinic if you need help." };
  }

  try {
    await prisma.patientAppointmentCancellationRequest.create({
      data: {
        clinicId: patient.clinicId,
        patientId: patient.id,
        appointmentId: appointment.id,
        reason: parsed.data.reason || null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "A cancellation request is already waiting for the clinic for this appointment." };
    }
    console.error("Patient appointment cancellation request failed.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return { error: "We couldn't send the request. Please contact the clinic and try again later." };
  }

  revalidatePath("/portal");
  return { success: "Cancellation request sent. Your appointment remains scheduled until the clinic confirms the change." };
}

export async function reviewPatientAppointmentCancellationRequest(
  _previousState: PatientCancellationActionState,
  formData: FormData,
): Promise<PatientCancellationActionState> {
  const parsed = z.object({
    clinicId: z.string().uuid(),
    requestId: z.string().uuid(),
    decision: z.enum(["APPROVED", "REJECTED"]),
    reviewerNotes: z.string().trim().max(500).optional().default(""),
  }).safeParse({
    clinicId: formData.get("clinicId"),
    requestId: formData.get("requestId"),
    decision: formData.get("decision"),
    reviewerNotes: formData.get("reviewerNotes") ?? "",
  });
  if (!parsed.success) return { error: "This cancellation request is not available." };

  const membership = await requireClinicMembership(parsed.data.clinicId);
  try {
    await prisma.$transaction(async (transaction) => {
      const request = await transaction.patientAppointmentCancellationRequest.findFirst({
        where: {
          id: parsed.data.requestId,
          clinicId: membership.clinicId,
          status: PatientAppointmentCancellationStatus.PENDING,
        },
        select: { id: true, appointmentId: true, patientId: true },
      });
      if (!request) throw new Error("REQUEST_NOT_PENDING");

      if (parsed.data.decision === "APPROVED") {
        const appointment = await transaction.appointment.findFirst({
          where: {
            id: request.appointmentId,
            clinicId: membership.clinicId,
            patientId: request.patientId,
            status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
            scheduledAt: { gt: new Date() },
          },
          select: { id: true },
        });
        if (!appointment) throw new Error("APPOINTMENT_NOT_CANCELLABLE");
        await transaction.appointment.updateMany({
          where: { id: appointment.id, clinicId: membership.clinicId },
          data: { status: AppointmentStatus.CANCELLED },
        });
      }

      await transaction.patientAppointmentCancellationRequest.updateMany({
        where: {
          id: request.id,
          clinicId: membership.clinicId,
          status: PatientAppointmentCancellationStatus.PENDING,
        },
        data: {
          status: parsed.data.decision,
          reviewedByUserId: membership.userId,
          reviewedAt: new Date(),
          reviewerNotes: parsed.data.reviewerNotes || null,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_NOT_PENDING") {
      return { error: "This request has already been reviewed." };
    }
    if (error instanceof Error && error.message === "APPOINTMENT_NOT_CANCELLABLE") {
      return { error: "The appointment is no longer eligible for cancellation. Refresh the schedule." };
    }
    console.error("Patient cancellation review failed.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return { error: "We couldn't update this request. Please try again." };
  }

  revalidatePath(`/clinic/${membership.clinicId}/appointments`);
  revalidatePath("/portal");
  return {
    success: parsed.data.decision === "APPROVED"
      ? "Appointment cancelled and request approved."
      : "Cancellation request declined.",
  };
}
