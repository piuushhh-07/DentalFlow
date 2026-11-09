import { appointmentStartAt } from "@/features/appointments/lib/appointment-validation";

export type AppointmentCalendarView = "month" | "week" | "day";

export type AppointmentCalendarFilter = Readonly<{
  dentistId: string;
  chairId: string;
  status: string;
}>;

const DAY_MS = 24 * 60 * 60_000;

function dateAtUtcMidnight(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addCalendarDays(date: string, days: number): string {
  const result = dateAtUtcMidnight(date);
  result.setUTCDate(result.getUTCDate() + days);
  return toDateString(result);
}

export function getCalendarWeekStart(date: string): string {
  const start = dateAtUtcMidnight(date);
  const daysSinceMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return toDateString(start);
}

export function getAppointmentCalendarRange(
  date: string,
  view: AppointmentCalendarView,
): Readonly<{ startDate: string; endDate: string }> {
  if (view === "day") return { startDate: date, endDate: date };

  if (view === "week") {
    const startDate = getCalendarWeekStart(date);
    return { startDate, endDate: addCalendarDays(startDate, 6) };
  }

  const monthStart = dateAtUtcMidnight(date);
  monthStart.setUTCDate(1);
  const firstDay = toDateString(monthStart);
  const gridStart = getCalendarWeekStart(firstDay);
  const monthEnd = dateAtUtcMidnight(date);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
  const gridEnd = addCalendarDays(
    toDateString(monthEnd),
    6 - ((monthEnd.getUTCDay() + 6) % 7),
  );
  return { startDate: gridStart, endDate: gridEnd };
}

export function getClinicDateRangeBounds(
  startDate: string,
  endDate: string,
): Readonly<{ startAt: Date; endAt: Date }> {
  return {
    startAt: appointmentStartAt(startDate, "00:00"),
    endAt: appointmentStartAt(addCalendarDays(endDate, 1), "00:00"),
  };
}

export function navigateAppointmentCalendar(
  date: string,
  view: AppointmentCalendarView,
  direction: -1 | 1,
): string {
  if (view === "day") return addCalendarDays(date, direction);
  if (view === "week") return addCalendarDays(date, direction * 7);

  const month = dateAtUtcMidnight(date);
  month.setUTCDate(1);
  month.setUTCMonth(month.getUTCMonth() + direction);
  return toDateString(month);
}

export function filterCalendarAppointments<
  T extends Readonly<{
    dentistId: string | null;
    chairId: string | null;
    status: string;
  }>,
>(appointments: readonly T[], filter: AppointmentCalendarFilter): T[] {
  return appointments.filter(
    (appointment) =>
      (!filter.dentistId || appointment.dentistId === filter.dentistId) &&
      (!filter.chairId || appointment.chairId === filter.chairId) &&
      (!filter.status || appointment.status === filter.status),
  );
}

export function getAppointmentPosition(
  time: string,
  durationMinutes: number,
  dayStartHour = 7,
): Readonly<{ topPercent: number; heightPercent: number }> {
  const [hours, minutes] = time.split(":").map(Number);
  const visibleMinutes = (24 - dayStartHour) * 60;
  const startMinutes = Math.max(
    0,
    Math.min(visibleMinutes, (hours - dayStartHour) * 60 + minutes),
  );
  const endMinutes = Math.max(
    startMinutes,
    Math.min(visibleMinutes, startMinutes + durationMinutes),
  );
  return {
    topPercent: (startMinutes / visibleMinutes) * 100,
    heightPercent: Math.max(
      1.5,
      ((endMinutes - startMinutes) / visibleMinutes) * 100,
    ),
  };
}

export function getAppointmentTimeAtCalendarPosition(
  clientY: number,
  bounds: Readonly<{ top: number; height: number }>,
  dayStartHour = 7,
  intervalMinutes = 15,
): string {
  const relativePosition = Math.max(
    0,
    Math.min(1, (clientY - bounds.top) / bounds.height),
  );
  const visibleMinutes = (24 - dayStartHour) * 60;
  const rawMinutes = relativePosition * visibleMinutes;
  const roundedMinutes =
    Math.round(rawMinutes / intervalMinutes) * intervalMinutes +
    dayStartHour * 60;
  const boundedMinutes = Math.min(23 * 60 + 45, roundedMinutes);
  return `${String(Math.floor(boundedMinutes / 60)).padStart(2, "0")}:${String(
    boundedMinutes % 60,
  ).padStart(2, "0")}`;
}

export function getCalendarDateOffset(date: string, startDate: string): number {
  return (
    (dateAtUtcMidnight(date).getTime() -
      dateAtUtcMidnight(startDate).getTime()) /
    DAY_MS
  );
}
