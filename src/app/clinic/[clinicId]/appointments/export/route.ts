import { AppointmentStatus } from "@prisma/client";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import {
  getAppointmentCalendarRange,
  type AppointmentCalendarView,
} from "@/features/appointments/lib/appointment-calendar";
import { listClinicAppointmentsInRange } from "@/features/appointments/lib/appointment-repository";
import { getClinicToday } from "@/features/follow-ups/lib/follow-up-validation";

export const dynamic = "force-dynamic";

const viewSchema = z.enum(["month", "week", "day"]);
const dateSchema = z.string().date();

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function formatIcsDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function foldIcsLine(line: string): string {
  const chunks: string[] = [];
  let current = "";
  let bytes = 0;
  for (const character of line) {
    const characterBytes = new TextEncoder().encode(character).length;
    if (bytes + characterBytes > 73) {
      chunks.push(current);
      current = " " + character;
      bytes = 1 + characterBytes;
    } else {
      current += character;
      bytes += characterBytes;
    }
  }
  chunks.push(current);
  return chunks.join("\r\n");
}

export async function GET(
  request: Request,
  { params }: { params: { clinicId: string } },
) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);
  if (!clinicId.success) notFound();

  let membership;
  try {
    membership = await requireClinicMembership(clinicId.data);
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) notFound();
    throw error;
  }

  const url = new URL(request.url);
  const parsedDate = dateSchema.safeParse(url.searchParams.get("date"));
  const parsedView = viewSchema.safeParse(url.searchParams.get("view"));
  const date = parsedDate.success ? parsedDate.data : getClinicToday();
  const view: AppointmentCalendarView = parsedView.success
    ? parsedView.data
    : "week";
  const range = getAppointmentCalendarRange(date, view);
  const appointments = await listClinicAppointmentsInRange(
    membership.clinicId,
    range.startDate,
    range.endDate,
  );

  const exportableStatuses = new Set<AppointmentStatus>([
    AppointmentStatus.SCHEDULED,
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.CHECKED_IN,
    AppointmentStatus.IN_PROGRESS,
    AppointmentStatus.COMPLETED,
  ]);
  const events = appointments
    .filter((appointment) => exportableStatuses.has(appointment.status))
    .map((appointment) => {
      const start = appointment.scheduledAt;
      const end = new Date(
        start.getTime() + appointment.durationMinutes * 60_000,
      );
      const summary = `Appointment · ${appointment.patient.fullName}`;
      const description = [
        `Type: ${appointment.type}`,
        `Dentist: ${appointment.dentistName}`,
        `Chair: ${appointment.chairLabel}`,
        `Status: ${appointment.status.replaceAll("_", " ")}`,
      ].join("\n");
      return [
        "BEGIN:VEVENT",
        `UID:${appointment.id}@dentalflow.app`,
        `DTSTAMP:${formatIcsDate(new Date())}`,
        `DTSTART:${formatIcsDate(start)}`,
        `DTEND:${formatIcsDate(end)}`,
        `SUMMARY:${escapeIcsText(summary)}`,
        `DESCRIPTION:${escapeIcsText(description)}`,
        "END:VEVENT",
      ];
    })
    .flat();

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DentalFlow//Clinic Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR",
  ];
  const body = lines.map(foldIcsLine).join("\r\n") + "\r\n";
  const filename = `dentalflow-appointments-${range.startDate}-to-${range.endDate}.ics`;

  return new Response(body, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/calendar; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
