"use server";

import { ClinicRole, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireClinicRole } from "@/features/auth/lib/server-auth";
import { prisma } from "@/lib/db/prisma";

const daySchema = z.object({
  day: z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]),
  closed: z.boolean(),
  open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  breakStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  breakEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
}).superRefine((value, context) => {
  if (value.closed) return;
  if (value.open >= value.close) {
    context.addIssue({ code: "custom", path: ["close"], message: "Closing time must be after opening time." });
  }
  if (Boolean(value.breakStart) !== Boolean(value.breakEnd)) {
    context.addIssue({ code: "custom", path: ["breakEnd"], message: "Enter both break times or leave both empty." });
  }
  if (value.breakStart && value.breakEnd) {
    if (value.breakStart >= value.breakEnd || value.breakStart <= value.open || value.breakEnd >= value.close) {
      context.addIssue({ code: "custom", path: ["breakStart"], message: "Break must be within clinic hours." });
    }
  }
});

const schema = z.object({
  clinicId: z.string().uuid(),
  days: z.array(daySchema).length(7),
}).superRefine(({ days }, context) => {
  if (new Set(days.map((day) => day.day)).size !== 7) {
    context.addIssue({ code: "custom", path: ["days"], message: "Each weekday must appear exactly once." });
  }
});

export type ClinicWorkingDay = z.infer<typeof daySchema>;
export type ClinicWorkingHoursState = { error?: string; success?: string };

export async function saveClinicWorkingHours(
  _previousState: ClinicWorkingHoursState,
  formData: FormData,
): Promise<ClinicWorkingHoursState> {
  let rawDays: unknown;
  try {
    rawDays = JSON.parse(String(formData.get("days") ?? ""));
  } catch {
    return { error: "Working hours could not be read. Please try again." };
  }

  const parsed = schema.safeParse({
    clinicId: formData.get("clinicId"),
    days: rawDays,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your working hours." };
  }

  const membership = await requireClinicRole(parsed.data.clinicId, [ClinicRole.OWNER]);
  const clinic = await prisma.clinic.findUnique({
    where: { id: membership.clinicId },
    select: { publicBookingSlug: true },
  });
  if (!clinic) return { error: "Clinic not found." };

  try {
    await prisma.clinic.update({
      where: { id: membership.clinicId },
      data: { workingHours: parsed.data.days as Prisma.InputJsonValue },
    });
  } catch (error) {
    console.error("Clinic working hours update failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return { error: "We couldn't save working hours. Please try again." };
  }

  revalidatePath(`/clinic/${membership.clinicId}/settings/hours`);
  revalidatePath(`/clinic/${membership.clinicId}/appointments`);
  revalidatePath(`/book/${clinic.publicBookingSlug}`);
  return { success: "Clinic working hours saved." };
}
