import { getClinicReportDateRangeForDates, type ClinicReportDateRange } from "@/features/reports/lib/report-validation";

export type BranchTrendPeriod = Readonly<{
  key: string;
  label: string;
  range: ClinicReportDateRange;
}>;

function localYearMonth(now: Date, timeZone: string): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { year: Number(values.year), month: Number(values.month) };
}

export function buildBranchTrendPeriods(
  now: Date,
  timeZone: string,
  monthCount = 12,
): BranchTrendPeriod[] {
  if (!Number.isInteger(monthCount) || monthCount < 1 || monthCount > 24) {
    throw new RangeError("Trend period must include between 1 and 24 months.");
  }

  const current = localYearMonth(now, timeZone);
  return Array.from({ length: monthCount }, (_, index) => {
    const offset = monthCount - index - 1;
    const firstOfMonth = new Date(Date.UTC(current.year, current.month - 1 - offset, 1));
    const year = firstOfMonth.getUTCFullYear();
    const month = firstOfMonth.getUTCMonth() + 1;
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    return {
      key,
      label: new Intl.DateTimeFormat("en-IN", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(firstOfMonth),
      range: getClinicReportDateRangeForDates(startDate, endDate, timeZone),
    };
  });
}
