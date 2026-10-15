export const REPORT_RANGE_DAYS = 30;

export type ClinicReportDateRange = Readonly<{
  startDate: string;
  endDate: string;
  endExclusiveDate: string;
  startAt: Date;
  endExclusiveAt: Date;
  timeZone: string;
}>;

function formatDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function startOfDateInTimeZone(date: string, timeZone: string): Date {
  const desiredLocalDate = new Date(`${date}T00:00:00.000Z`);
  let candidate = desiredLocalDate.getTime();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const values = Object.fromEntries(
      parts.map(({ type, value }) => [type, value]),
    );
    const representedLocalTime = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    );
    candidate += desiredLocalDate.getTime() - representedLocalTime;
  }

  return new Date(candidate);
}

export function getClinicReportDateRange(
  now: Date,
  timeZone: string,
  rangeDays = REPORT_RANGE_DAYS,
): ClinicReportDateRange {
  const endDate = formatDateInTimeZone(now, timeZone);
  const startDate = shiftDate(endDate, 1 - rangeDays);
  const endExclusiveDate = shiftDate(endDate, 1);
  return {
    startDate,
    endDate,
    endExclusiveDate,
    startAt: startOfDateInTimeZone(startDate, timeZone),
    endExclusiveAt: startOfDateInTimeZone(endExclusiveDate, timeZone),
    timeZone,
  };
}

export function isDateInReportRange(
  date: string,
  range: Pick<ClinicReportDateRange, "startDate" | "endExclusiveDate">,
): boolean {
  return date >= range.startDate && date < range.endExclusiveDate;
}

export function formatReportDateRange(
  range: Pick<ClinicReportDateRange, "startDate" | "endDate">,
): string {
  const formatter = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "UTC",
  });
  const start = formatter.format(new Date(`${range.startDate}T00:00:00.000Z`));
  const end = formatter.format(new Date(`${range.endDate}T00:00:00.000Z`));
  return `${start} – ${end}`;
}
