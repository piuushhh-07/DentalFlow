"use server";

import { AppointmentStatus, ClinicRole, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  requireClinicMembership,
  requireClinicRole,
} from "@/features/auth/lib/server-auth";
import {
  BillingAccessRestrictedError,
  BillingLimitReachedError,
} from "@/features/billing/lib/billing-entitlements";
import {
  AppointmentConflictError,
  AppointmentNotFoundError,
  AppointmentPatientNotFoundError,
  AppointmentRequestConflictError,
  AppointmentRequestNotFoundError,
  AppointmentRequestRateLimitError,
  AppointmentResourceNotFoundError,
  AppointmentTransitionError,
  AppointmentVisitAlreadyScheduledError,
  AppointmentVisitNotFoundError,
  ScheduleResourceDuplicateError,
  ScheduleResourceNotFoundError,
  createClinicAppointment,
  createPublicAppointmentRequest,
  createScheduleResource,
  renameScheduleResource,
  setScheduleResourceActive,
  approveAppointmentRequest,
  getPublicBookingClinic,
  rejectAppointmentRequest,
  setPublicBookingEnabled,
  updateClinicAppointment,
  updateClinicAppointmentStatus,
} from "@/features/appointments/lib/appointment-repository";
import {
  appointmentStatusSchema,
  createAppointmentSchema,
  updateAppointmentSchema,
} from "@/features/appointments/lib/appointment-validation";
import { appointmentStartAt } from "@/features/appointments/lib/appointment-validation";
import { publicBookingRequestSchema } from "@/features/appointments/lib/public-booking-validation";

export type AppointmentActionState = Readonly<{
  error?: string;
  success?: string;
}>;

export type PublicBookingActionState = Readonly<{
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
    dentistId: formData.get("dentistId"),
    chairId: formData.get("chairId"),
    type: formData.get("type"),
    notes: formData.get("notes") ?? "",
  };
}

function userFacingAppointmentError(error: unknown): string {
  if (error instanceof BillingLimitReachedError) {
    return "This clinic has reached its monthly appointment limit. Review the subscription in Billing to continue scheduling.";
  }
  if (error instanceof BillingAccessRestrictedError) {
    return "New appointments are paused for this subscription. Existing clinical records remain available.";
  }
  if (error instanceof AppointmentPatientNotFoundError) {
    return "The selected patient is not available in this clinic.";
  }
  if (error instanceof AppointmentResourceNotFoundError) {
    return "Select an active dentist and chair from this clinic.";
  }
  if (error instanceof AppointmentVisitNotFoundError) {
    return "The selected treatment visit does not belong to this patient and clinic.";
  }
  if (error instanceof AppointmentVisitAlreadyScheduledError) {
    return "This treatment visit already has an active appointment. Update or cancel the existing appointment before booking another.";
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

export async function createScheduleResourceAction(
  _previousState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const clinicId = z.string().uuid().safeParse(formData.get("clinicId"));
  const kind = z.enum(["dentist", "chair"]).safeParse(formData.get("kind"));
  const name = z
    .string()
    .trim()
    .transform((value) => value.replace(/\s+/g, " "))
    .pipe(z.string().min(2).max(120))
    .safeParse(formData.get("name"));
  if (!clinicId.success || !kind.success || !name.success) {
    return { error: "Provide a valid clinic, resource type, and name." };
  }
  const membership = await requireClinicRole(clinicId.data, [ClinicRole.OWNER]);
  try {
    await createScheduleResource(membership.clinicId, kind.data, name.data);
  } catch (error) {
    logAppointmentError(error);
    if (error instanceof ScheduleResourceDuplicateError) {
      return { error: error.message };
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        error: "A resource with this name already exists in this clinic.",
      };
    }
    return {
      error: "We couldn't add this schedule resource. Please try again.",
    };
  }
  revalidatePath(`/clinic/${membership.clinicId}/appointments`);
  return {
    success:
      kind.data === "dentist"
        ? "Dentist added successfully."
        : "Treatment chair added successfully.",
  };
}

export async function renameScheduleResourceAction(
  _previousState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const clinicId = z.string().uuid().safeParse(formData.get("clinicId"));
  const kind = z.enum(["dentist", "chair"]).safeParse(formData.get("kind"));
  const resourceId = z.string().uuid().safeParse(formData.get("resourceId"));
  const name = z
    .string()
    .trim()
    .transform((value) => value.replace(/\s+/g, " "))
    .pipe(z.string().min(2).max(120))
    .safeParse(formData.get("name"));
  if (
    !clinicId.success ||
    !kind.success ||
    !resourceId.success ||
    !name.success
  ) {
    return { error: "Provide a valid resource and name." };
  }
  const membership = await requireClinicRole(clinicId.data, [ClinicRole.OWNER]);
  try {
    await renameScheduleResource(
      membership.clinicId,
      kind.data,
      resourceId.data,
      name.data,
    );
  } catch (error) {
    logAppointmentError(error);
    if (error instanceof ScheduleResourceDuplicateError) {
      return { error: error.message };
    }
    if (error instanceof ScheduleResourceNotFoundError) {
      return { error: "This resource is not available in this clinic." };
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        error: "A resource with this name already exists in this clinic.",
      };
    }
    return { error: "We couldn't rename this resource. Please try again." };
  }
  revalidatePath(`/clinic/${membership.clinicId}/appointments`);
  return { success: "Resource renamed successfully." };
}

export async function setScheduleResourceActiveAction(
  _previousState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const clinicId = z.string().uuid().safeParse(formData.get("clinicId"));
  const kind = z.enum(["dentist", "chair"]).safeParse(formData.get("kind"));
  const resourceId = z.string().uuid().safeParse(formData.get("resourceId"));
  const active = z.enum(["true", "false"]).safeParse(formData.get("active"));
  if (
    !clinicId.success ||
    !kind.success ||
    !resourceId.success ||
    !active.success
  ) {
    return { error: "Provide a valid resource and status." };
  }
  const membership = await requireClinicRole(clinicId.data, [ClinicRole.OWNER]);
  try {
    await setScheduleResourceActive(
      membership.clinicId,
      kind.data,
      resourceId.data,
      active.data === "true",
    );
  } catch (error) {
    logAppointmentError(error);
    if (error instanceof ScheduleResourceNotFoundError) {
      return { error: "This resource is not available in this clinic." };
    }
    return { error: "We couldn't update this resource. Please try again." };
  }
  revalidatePath(`/clinic/${membership.clinicId}/appointments`);
  return {
    success:
      active.data === "true"
        ? "Resource activated successfully."
        : "Resource deactivated successfully.",
  };
}

export async function createPublicBookingRequestAction(
  _previousState: PublicBookingActionState,
  formData: FormData,
): Promise<PublicBookingActionState> {
  const parsed = publicBookingRequestSchema.safeParse({
    slug: formData.get("slug"),
    patientName: formData.get("patientName"),
    phoneNumber: formData.get("phoneNumber"),
    date: formData.get("date"),
    time: formData.get("time"),
    dentistId: formData.get("dentistId"),
    chairId: formData.get("chairId"),
    notes: formData.get("notes") ?? "",
    website: formData.get("website") ?? "",
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check your booking details.",
    };
  }
  if (parsed.data.website) {
    return { error: "We couldn't send this request. Please try again." };
  }
  const clinic = await getPublicBookingClinic(parsed.data.slug);
  if (!clinic) {
    return {
      error: "Online appointment requests are not available for this clinic.",
    };
  }
  const weekday = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][
    new Date(`${parsed.data.date}T00:00:00.000Z`).getUTCDay()
  ];
  const configuredHours = Array.isArray(clinic.workingHours)
    ? (clinic.workingHours as unknown as Array<{
        day: string;
        closed: boolean;
        open: string;
        close: string;
        breakStart: string | null;
        breakEnd: string | null;
      }>)
    : [];
  const dayHours = configuredHours.find((hours) => hours.day === weekday);
  if (configuredHours.length > 0) {
    const requestedTime = parsed.data.time;
    if (
      !dayHours ||
      dayHours.closed ||
      requestedTime < dayHours.open ||
      requestedTime >= dayHours.close ||
      (dayHours.breakStart &&
        dayHours.breakEnd &&
        requestedTime >= dayHours.breakStart &&
        requestedTime < dayHours.breakEnd)
    ) {
      return {
        error:
          "That time is outside the clinic's working hours. Please choose an open time.",
      };
    }
  }
  const requestedAt = appointmentStartAt(parsed.data.date, parsed.data.time);
  const now = Date.now();
  if (
    requestedAt.getTime() < now + 15 * 60_000 ||
    requestedAt.getTime() > now + 60 * 24 * 60 * 60_000
  ) {
    return {
      error: "Choose a time at least 15 minutes from now and within 60 days.",
    };
  }
  try {
    await createPublicAppointmentRequest(clinic.id, {
      patientName: parsed.data.patientName,
      phoneNumber: parsed.data.phoneNumber,
      requestedAt,
      dentistId: parsed.data.dentistId,
      chairId: parsed.data.chairId,
      notes: parsed.data.notes,
    });
    return {
      success:
        "Your request was sent. The clinic will contact you to confirm it.",
    };
  } catch (error) {
    if (error instanceof AppointmentRequestConflictError) {
      return {
        error:
          "That time was just requested or is no longer available. Choose another time.",
      };
    }
    if (error instanceof AppointmentRequestRateLimitError) {
      return {
        error:
          "Too many requests were sent from this number. Please try again later.",
      };
    }
    if (error instanceof AppointmentResourceNotFoundError) {
      return {
        error:
          "That dentist or chair is no longer available. Reload and try again.",
      };
    }
    logAppointmentError(error);
    return { error: "We couldn't send your request. Please try again later." };
  }
}

export async function updatePublicBookingEnabledAction(formData: FormData) {
  const clinicId = z.string().uuid().safeParse(formData.get("clinicId"));
  const enabled = z.enum(["true", "false"]).safeParse(formData.get("enabled"));
  if (!clinicId.success || !enabled.success) {
    throw new Error("Provide valid online booking settings.");
  }
  const membership = await requireClinicRole(clinicId.data, [ClinicRole.OWNER]);
  await setPublicBookingEnabled(membership.clinicId, enabled.data === "true");
  revalidatePath(`/clinic/${membership.clinicId}/appointments`);
}

export async function approveAppointmentRequestAction(
  _previousState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const clinicId = z.string().uuid().safeParse(formData.get("clinicId"));
  const requestId = z.string().uuid().safeParse(formData.get("requestId"));
  if (!clinicId.success || !requestId.success) {
    return { error: "This booking request is not available." };
  }
  const membership = await requireClinicMembership(clinicId.data);
  try {
    await approveAppointmentRequest(membership.clinicId, requestId.data);
    revalidatePath(`/clinic/${membership.clinicId}/appointments`);
    return { success: "Booking request approved." };
  } catch (error) {
    logAppointmentError(error);
    if (error instanceof AppointmentRequestNotFoundError) {
      return {
        error: "This request was already handled or is no longer available.",
      };
    }
    if (error instanceof AppointmentConflictError) {
      return {
        error: "The requested time now conflicts with another appointment.",
      };
    }
    if (error instanceof AppointmentResourceNotFoundError) {
      return { error: "The selected dentist or chair is no longer active." };
    }
    if (error instanceof BillingLimitReachedError) {
      return {
        error: "This clinic has reached its appointment or patient limit.",
      };
    }
    return { error: "We couldn't approve this request. Please try again." };
  }
}

export async function rejectAppointmentRequestAction(
  _previousState: AppointmentActionState,
  formData: FormData,
): Promise<AppointmentActionState> {
  const clinicId = z.string().uuid().safeParse(formData.get("clinicId"));
  const requestId = z.string().uuid().safeParse(formData.get("requestId"));
  if (!clinicId.success || !requestId.success) {
    return { error: "This booking request is not available." };
  }
  const membership = await requireClinicMembership(clinicId.data);
  try {
    await rejectAppointmentRequest(membership.clinicId, requestId.data);
    revalidatePath(`/clinic/${membership.clinicId}/appointments`);
    return { success: "Booking request declined." };
  } catch (error) {
    logAppointmentError(error);
    return { error: "We couldn't decline this request. Please try again." };
  }
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
