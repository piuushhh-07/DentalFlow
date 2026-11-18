import {
  getClinicReportDateRange,
  getClinicReportDateRangeForDates,
  isValidReportDate,
  type ClinicReportDateRange,
} from "@/features/reports/lib/report-validation";

export const BRANCH_REPORT_PRESETS = ["7", "30", "90", "month", "custom"] as const;
export type BranchReportPreset = (typeof BRANCH_REPORT_PRESETS)[number];

export type ResolvedBranchReportRange = Readonly<{
  preset: BranchReportPreset;
  range: ClinicReportDateRange;
  startDateInput: string;
  endDateInput: string;
  error: string | null;
}>;

function isPreset(value: string | undefined): value is BranchReportPreset {
  return BRANCH_REPORT_PRESETS.some((preset) => preset === value);
}

export function resolveBranchReportRange(
  now: Date,
  timeZone: string,
  requestedPreset: string | undefined,
  requestedStartDate?: string,
  requestedEndDate?: string,
): ResolvedBranchReportRange {
  const preset = isPreset(requestedPreset) ? requestedPreset : "30";
  const last30Days = getClinicReportDateRange(now, timeZone);

  if (preset === "custom") {
    if (
      requestedStartDate === undefined ||
      requestedEndDate === undefined ||
      !isValidReportDate(requestedStartDate) ||
      !isValidReportDate(requestedEndDate) ||
      requestedStartDate > requestedEndDate
    ) {
      return {
        preset,
        range: last30Days,
        startDateInput: requestedStartDate ?? last30Days.startDate,
        endDateInput: requestedEndDate ?? last30Days.endDate,
        error: "Choose a valid date range of no more than 366 days.",
      };
    }

    const dayCount =
      (Date.parse(`${requestedEndDate}T00:00:00.000Z`) -
        Date.parse(`${requestedStartDate}T00:00:00.000Z`)) /
        86_400_000 +
      1;

    if (dayCount > 366) {
      return {
        preset,
        range: last30Days,
        startDateInput: requestedStartDate,
        endDateInput: requestedEndDate,
        error: "Choose a valid date range of no more than 366 days.",
      };
    }

    return {
      preset,
      range: getClinicReportDateRangeForDates(
        requestedStartDate,
        requestedEndDate,
        timeZone,
      ),
      startDateInput: requestedStartDate,
      endDateInput: requestedEndDate,
      error: null,
    };
  }

  if (preset === "month") {
    const startDate = `${last30Days.endDate.slice(0, 7)}-01`;
    return {
      preset,
      range: getClinicReportDateRangeForDates(startDate, last30Days.endDate, timeZone),
      startDateInput: startDate,
      endDateInput: last30Days.endDate,
      error: null,
    };
  }

  const range = getClinicReportDateRange(now, timeZone, Number(preset));
  return {
    preset,
    range,
    startDateInput: range.startDate,
    endDateInput: range.endDate,
    error: null,
  };
}
