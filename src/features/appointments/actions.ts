"use server";

import { AppointmentStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import {
  AppointmentConflictError,
  AppointmentNotFoundError,
  AppointmentPatientNotFoundError,
  AppointmentTransitionError,
  AppointmentVisitNotFoundError,
  createClinicAppointment,
  updateClinicAppointment,
  updateClinicAppointmentStatus,
} from "@/features/appointments/lib/appointment-repository";
import {
  appointmentStatusSchema,
  createAppointmentSchema,
  updateAppointmentSchema,
} from "@/features/appointments/lib/appointment-validation";

export type AppointmentActionState = Readonly<{
  error?: string;
  success?: string;
}>;

function logAppointmentError(error: unknown): void {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error("Appointment operation failed", { code: error.code });
    return;
  }
  console.error("Appointment operation failed", {
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
}

function parseInput(formData: FormData) {
  return {
    patientId: formData.get("patientId"),
    treatmentVisitId: formData.get("treatmentVisitId") ?? "",
    date: formData.get("date"),
    time: formData.get("time"),
    durationMinutes: formData.get("durationMinutes"),
    dentistName: formData.get("dentistName"),
    chairLabel: formData.get("chairLabel"),
    type: formData.get("type"),
    notes: formData.get("notes") ?? "",
  };
}

function userFacingAppointmentError(error: unknown): string {
  if (error instanceof AppointmentPatientNotFoundError) {
    return "The selected patient is not available in this clinic.";
  }
  if (error instanceof AppointmentVisitNotFoundError) {
    return "The selected treatment visit does not belong to this patient and clinic.";
  }
  if (error instanceof AppointmentConflictError) {
    return error.message;
  }
  if (error instanceof AppointmentNotFoundError) {
    return "The appointment is not available in this clinic.";
  }
  if (error instanceof AppointmentTransitionError) {
    return error.message;
  }
  return "We couldn't save the appointment. Please try again.";
}

export async function createAppointmentAction(
  _previousState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const clinicId = formData.get("clinicId");
  const membership = await requireClinicMembership(
    typeof clinicId === "string" ? clinicId : "",
  );
  const parsed = createAppointmentSchema.safeParse(parseInput(formData));
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check appointment details.",
    };
  }
  try {
    await createClinicAppointment(membership.clinicId, parsed.data);
    revalidatePath(`/clinic/${membership.clinicId}`);
    revalidatePath(`/clinic/${membership.clinicId}/appointments`);
    return { success: "Appointment created." };
  } catch (error) {
    logAppointmentError(error);
    return { error: userFacingAppointmentError(error) };
  }
}

export async function updateAppointmentAction(
  _previousState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const clinicId = formData.get("clinicId");
  const membership = await requireClinicMembership(
    typeof clinicId === "string" ? clinicId : "",
  );
  const parsed = updateAppointmentSchema.safeParse({
    ...parseInput(formData),
    appointmentId: formData.get("appointmentId"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check appointment details.",
    };
  }
  const { appointmentId, ...input } = parsed.data;
  try {
    await updateClinicAppointment(membership.clinicId, appointmentId, input);
    revalidatePath(`/clinic/${membership.clinicId}`);
    revalidatePath(`/clinic/${membership.clinicId}/appointments`);
    return { success: "Appointment updated." };
  } catch (error) {
    logAppointmentError(error);
    return { error: userFacingAppointmentError(error) };
  }
}

export async function updateAppointmentStatusAction(
  _previousState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const clinicId = formData.get("clinicId");
  const membership = await requireClinicMembership(
    typeof clinicId === "string" ? clinicId : "",
  );
  const parsed = appointmentStatusSchema.safeParse({
    appointmentId: formData.get("appointmentId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { error: "Choose a valid appointment status." };
  try {
    await updateClinicAppointmentStatus(
      membership.clinicId,
      parsed.data.appointmentId,
      parsed.data.status as AppointmentStatus,
    );
    revalidatePath(`/clinic/${membership.clinicId}`);
    revalidatePath(`/clinic/${membership.clinicId}/appointments`);
    return { success: "Appointment status updated." };
  } catch (error) {
    logAppointmentError(error);
    return { error: userFacingAppointmentError(error) };
  }
}
