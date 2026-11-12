"use client";

import { useFormState } from "react-dom";
import { useState } from "react";

import {
  saveClinicWorkingHours,
  type ClinicWorkingDay,
  type ClinicWorkingHoursState,
} from "@/features/clinic-settings/working-hours-actions";

const dayOrder: ClinicWorkingDay["day"][] = [
  "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN",
];
const dayLabels: Record<ClinicWorkingDay["day"], string> = {
  MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday",
  FRI: "Friday", SAT: "Saturday", SUN: "Sunday",
};
const defaults = (day: ClinicWorkingDay["day"]): ClinicWorkingDay => ({
  day, closed: day === "SUN", open: "09:00", close: "18:00",
  breakStart: null, breakEnd: null,
});

export function ClinicWorkingHoursForm({
  clinicId,
  initialHours,
}: {
  clinicId: string;
  initialHours: ClinicWorkingDay[];
}) {
  const [state, formAction] = useFormState<ClinicWorkingHoursState, FormData>(
    saveClinicWorkingHours,
    {},
  );
  const [days, setDays] = useState(() =>
    dayOrder.map((day) => {
      const saved = initialHours.find((item) => item.day === day);
      return saved ? { ...defaults(day), ...saved } : defaults(day);
    }),
  );

  function updateDay(index: number, changes: Partial<ClinicWorkingDay>) {
    setDays((current) =>
      current.map((day, dayIndex) =>
        dayIndex === index ? { ...day, ...changes } : day,
      ),
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input name="clinicId" type="hidden" value={clinicId} />
      <input name="days" type="hidden" value={JSON.stringify(days)} />
      {state.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800" role="status">
          {state.success}
        </p>
      )}
      <div className="space-y-3">
        {days.map((day, index) => (
          <section key={day.day} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold text-slate-900">{dayLabels[day.day]}</h2>
              <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                <input
                  checked={day.closed}
                  onChange={(event) => updateDay(index, { closed: event.target.checked })}
                  type="checkbox"
                />
                Closed
              </label>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-medium text-slate-600">
                Opens
                <input
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm disabled:bg-slate-100"
                  disabled={day.closed}
                  onChange={(event) => updateDay(index, { open: event.target.value })}
                  type="time"
                  value={day.open}
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Closes
                <input
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm disabled:bg-slate-100"
                  disabled={day.closed}
                  onChange={(event) => updateDay(index, { close: event.target.value })}
                  type="time"
                  value={day.close}
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Break starts (optional)
                <input
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm disabled:bg-slate-100"
                  disabled={day.closed}
                  onChange={(event) => updateDay(index, { breakStart: event.target.value || null })}
                  type="time"
                  value={day.breakStart ?? ""}
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                Break ends (optional)
                <input
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm disabled:bg-slate-100"
                  disabled={day.closed}
                  onChange={(event) => updateDay(index, { breakEnd: event.target.value || null })}
                  type="time"
                  value={day.breakEnd ?? ""}
                />
              </label>
            </div>
          </section>
        ))}
      </div>
      <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">Only clinic owners can change working hours. Times use the clinic timezone.</p>
        <button className="h-11 rounded-lg bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800" type="submit">
          Save working hours
        </button>
      </div>
    </form>
  );
}
