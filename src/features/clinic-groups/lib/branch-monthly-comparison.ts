export type MonthOverMonthChange = Readonly<{
  absoluteChange: number;
  percentageChange: number | null;
}>;

export function getMonthOverMonthChange(current: number, previous: number): MonthOverMonthChange {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    throw new RangeError("Month-over-month values must be finite numbers.");
  }

  const absoluteChange = current - previous;
  return {
    absoluteChange,
    percentageChange: previous === 0 ? null : (absoluteChange / Math.abs(previous)) * 100,
  };
}
