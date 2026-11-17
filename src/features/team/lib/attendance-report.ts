export type AttendanceMonthRange = {
  startDate: Date;
  endDate: Date;
};

export function getAttendanceMonthRange(month: string): AttendanceMonthRange {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("Invalid attendance month");
  }
  const [year, monthNumber] = month.split("-").map(Number);
  return {
    startDate: new Date(Date.UTC(year, monthNumber - 1, 1)),
    endDate: new Date(Date.UTC(year, monthNumber, 1)),
  };
}

export function attendanceCsvCell(value: string | number): string {
  const text = String(value);
  const safeText = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export function attendanceDurationMinutes(
  checkInAt: Date | null,
  checkOutAt: Date | null,
): number {
  if (!checkInAt || !checkOutAt) return 0;
  return Math.max(0, Math.floor((checkOutAt.getTime() - checkInAt.getTime()) / 60_000));
}
