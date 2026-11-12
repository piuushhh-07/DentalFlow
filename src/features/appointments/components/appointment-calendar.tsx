"use client";

import type { AppointmentStatus } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppointmentForm } from "@/features/appointments/components/appointment-form";
import { loadAppointmentOptionsAction } from "@/features/appointments/actions";
import { AppointmentStatusForm } from "@/features/appointments/components/appointment-status-form";
import {
  addCalendarDays,
  filterCalendarAppointments,
  getAppointmentCalendarRange,
  getAppointmentPosition,
  getAppointmentTimeAtCalendarPosition,
  navigateAppointmentCalendar,
  type AppointmentCalendarView,
} from "@/features/appointments/lib/appointment-calendar";

type Patient = Readonly<{ id: string; fullName: string }>;
type Visit = Readonly<{
  id: string;
  patientId: string;
  visitNumber: number;
  treatmentPlan: { name: string };
}>;
type Dentist = Readonly<{ id: string; name: string }>;
type Chair = Readonly<{ id: string; label: string }>;
type Appointment = Readonly<{
  id: string;
  patientId: string;
  treatmentVisitId: string | null;
  scheduledAt: string;
  durationMinutes: number;
  dentistId: string | null;
  chairId: string | null;
  dentistName: string;
  chairLabel: string;
  type: string;
  status: AppointmentStatus;
  notes: string | null;
  patient: Readonly<{ id: string; fullName: string }>;
  treatmentVisit: Readonly<{
    visitNumber: number;
    status: string;
    treatmentPlan: { name: string };
  }> | null;
}>;
type AppointmentPrefill = Readonly<{
  patientId: string;
  patientName: string;
  treatmentVisitId: string;
  visitLabel: string;
  dueDate: string;
}>;

type AppointmentCalendarProps = Readonly<{
  clinicId: string;
  date: string;
  view: AppointmentCalendarView;
  appointments: readonly Appointment[];
  dentists: readonly Dentist[];
  chairs: readonly Chair[];
  prefill?: AppointmentPrefill;
}>;

const DAY_START_HOUR = 0;
const DAY_END_HOUR = 24;
const GRID_HEIGHT = (DAY_END_HOUR - DAY_START_HOUR) * 60;
const statuses: readonly AppointmentStatus[] = [
  "SCHEDULED",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
];
const statusClass: Record<AppointmentStatus, string> = {
  SCHEDULED: "border-blue-300 bg-blue-50 text-blue-950",
  CONFIRMED: "border-teal-300 bg-teal-50 text-teal-950",
  CHECKED_IN: "border-violet-300 bg-violet-50 text-violet-950",
  IN_PROGRESS: "border-amber-300 bg-amber-50 text-amber-950",
  COMPLETED: "border-emerald-300 bg-emerald-50 text-emerald-950",
  CANCELLED: "border-slate-300 bg-slate-100 text-slate-600",
  NO_SHOW: "border-rose-300 bg-rose-50 text-rose-950",
};

function dateLabel(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-IN", {
    ...options,
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${date}T12:00:00.000Z`));
}

function appointmentDateTime(instant: string): Readonly<{
  date: string;
  time: string;
}> {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(instant));
  return { date, time };
}

function appointmentEndTime(appointment: Appointment): string {
  const end = new Date(
    new Date(appointment.scheduledAt).getTime() +
      appointment.durationMinutes * 60_000,
  );
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
  }).format(end);
}

function TimeLabel({ hour }: Readonly<{ hour: number }>) {
  return (
    <span className="absolute -top-2.5 right-2 text-[11px] font-medium text-slate-500">
      {new Intl.DateTimeFormat("en-IN", {
        hour: "numeric",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(2020, 0, 1, hour)))}
    </span>
  );
}

export function AppointmentCalendar({
  clinicId,
  date,
  view,
  appointments,
  dentists,
  chairs,
  prefill,
}: AppointmentCalendarProps) {
  const router = useRouter();
  const [patients, setPatients] = useState<readonly Patient[]>([]);
  const [visits, setVisits] = useState<readonly Visit[]>([]);
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const gridRefs = useRef(new Map<string, HTMLDivElement>());
  const [selectedDentist, setSelectedDentist] = useState("");
  const [selectedChair, setSelectedChair] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [createSlot, setCreateSlot] = useState<{
    date: string;
    time: string;
  } | null>(prefill ? { date: prefill.dueDate, time: "09:00" } : null);
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);
  const [editing, setEditing] = useState(false);

  const filteredAppointments = useMemo(
    () =>
      filterCalendarAppointments(appointments, {
        dentistId: selectedDentist,
        chairId: selectedChair,
        status: selectedStatus,
      }),
    [appointments, selectedChair, selectedDentist, selectedStatus],
  );
  const range = getAppointmentCalendarRange(date, view);
  const rangeDates = useMemo(() => {
    const dates: string[] = [];
    for (
      let current = range.startDate;
      current <= range.endDate;
      current = addCalendarDays(current, 1)
    ) {
      dates.push(current);
    }
    return dates;
  }, [range.endDate, range.startDate]);
  const appointmentsByDate = useMemo(() => {
    const result = new Map<string, Appointment[]>();
    for (const appointment of filteredAppointments) {
      const { date: appointmentDate } = appointmentDateTime(
        appointment.scheduledAt,
      );
      const dayAppointments = result.get(appointmentDate) ?? [];
      dayAppointments.push(appointment);
      result.set(appointmentDate, dayAppointments);
    }
    return result;
  }, [filteredAppointments]);

  function navigate(nextDate: string, nextView = view) {
    router.push(
      `/clinic/${clinicId}/appointments?date=${encodeURIComponent(nextDate)}&view=${nextView}`,
    );
  }

  async function loadOptions(): Promise<boolean> {
    if (optionsLoaded) return true;
    if (optionsLoading) return false;
    setOptionsError(null);
    setOptionsLoading(true);
    try {
      const options = await loadAppointmentOptionsAction(clinicId);
      setPatients(options.patients);
      setVisits(options.visits);
      setOptionsLoaded(true);
      return true;
    } catch {
      setOptionsError("Could not load patient and treatment options. Please try again.");
      return false;
    } finally {
      setOptionsLoading(false);
    }
  }

  function openSlot(slotDate: string, clientY: number, grid: HTMLDivElement) {
    const time = getAppointmentTimeAtCalendarPosition(
      clientY,
      grid.getBoundingClientRect(),
      DAY_START_HOUR,
    );
    setCreateSlot({ date: slotDate, time });
    setSelectedAppointment(null);
    void loadOptions();
  }

  function openNewAppointment() {
    setCreateSlot({ date, time: "09:00" });
    setSelectedAppointment(null);
    void loadOptions();
  }

  useEffect(() => {
    if (!prefill) return;

    let cancelled = false;
    setOptionsLoading(true);
    loadAppointmentOptionsAction(clinicId)
      .then((options) => {
        if (cancelled) return;
        setPatients(options.patients);
        setVisits(options.visits);
        setOptionsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setOptionsError(
            "Could not load patient and treatment options. Please try again.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setOptionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clinicId, prefill]);

  function appointmentFormInitial(appointment: Appointment) {
    const appointmentDateTimeValue = appointmentDateTime(
      appointment.scheduledAt,
    );
    return {
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      treatmentVisitId: appointment.treatmentVisitId,
      date: appointmentDateTimeValue.date,
      time: appointmentDateTimeValue.time,
      durationMinutes: appointment.durationMinutes,
      dentistId: appointment.dentistId,
      chairId: appointment.chairId,
      type: appointment.type,
      notes: appointment.notes,
    };
  }

  function renderAppointmentCard(appointment: Appointment) {
    const { time } = appointmentDateTime(appointment.scheduledAt);
    const position = getAppointmentPosition(
      time,
      appointment.durationMinutes,
      DAY_START_HOUR,
    );
    return (
      <button
        className={`absolute left-1 right-1 z-10 overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-[10px] leading-3 shadow-sm hover:brightness-[0.98] sm:px-2 ${statusClass[appointment.status]}`}
        key={appointment.id}
        onClick={(event) => {
          event.stopPropagation();
          setSelectedAppointment(appointment);
          setEditing(false);
        }}
        style={{
          top: `${position.topPercent}%`,
          height: `${Math.max(position.heightPercent, (40 / GRID_HEIGHT) * 100)}%`,
        }}
        type="button"
      >
        <span className="block truncate font-semibold">
          {time}–{appointmentEndTime(appointment)} ·{" "}
          {appointment.status.replaceAll("_", " ")}
        </span>
        <span className="block truncate font-medium">
          {appointment.patient.fullName}
        </span>
        <span className="block truncate">
          {appointment.dentistName} · {appointment.chairLabel}
        </span>
      </button>
    );
  }

  function renderTimeGrid(days: readonly string[]) {
    return (
      <div className="overflow-x-auto">
        <div
          className={`grid ${days.length === 1 ? "min-w-[320px] grid-cols-[58px_minmax(250px,1fr)]" : "min-w-[980px] grid-cols-[58px_repeat(7,minmax(120px,1fr))]"}`}
        >
          <div className="sticky top-0 z-20 border-b border-slate-200 bg-white" />
          {days.map((day) => (
            <button
              className="sticky top-0 z-20 border-b border-l border-slate-200 bg-white px-2 py-3 text-center hover:bg-slate-50"
              key={day}
              onClick={() => navigate(day, "day")}
              type="button"
            >
              <span className="block text-xs font-medium text-slate-500">
                {dateLabel(day, { weekday: "short" })}
              </span>
              <span className="mt-1 block text-sm font-semibold text-slate-900">
                {dateLabel(day, { day: "numeric", month: "short" })}
              </span>
            </button>
          ))}
          <div className="relative" style={{ height: GRID_HEIGHT }}>
            {Array.from(
              { length: DAY_END_HOUR - DAY_START_HOUR },
              (_, index) => index + DAY_START_HOUR,
            ).map((hour) => (
              <div
                className="pointer-events-none absolute left-0 right-0 border-t border-slate-100"
                key={hour}
                style={{
                  top: `${((hour - DAY_START_HOUR) / (DAY_END_HOUR - DAY_START_HOUR)) * 100}%`,
                }}
              >
                <TimeLabel hour={hour} />
              </div>
            ))}
          </div>
          {days.map((day) => (
            <div
              className="relative border-l border-slate-200"
              key={day}
              onClick={(event) => {
                if (event.target !== event.currentTarget) return;
                const grid = gridRefs.current.get(day);
                if (grid) openSlot(day, event.clientY, grid);
              }}
              ref={(element) => {
                if (element) gridRefs.current.set(day, element);
                else gridRefs.current.delete(day);
              }}
              style={{ height: GRID_HEIGHT }}
            >
              {Array.from(
                { length: DAY_END_HOUR - DAY_START_HOUR },
                (_, index) => index + DAY_START_HOUR,
              ).map((hour) => (
                <div
                  className="pointer-events-none absolute left-0 right-0 border-t border-slate-100"
                  key={hour}
                  style={{
                    top: `${((hour - DAY_START_HOUR) / (DAY_END_HOUR - DAY_START_HOUR)) * 100}%`,
                  }}
                />
              ))}
              {appointmentsByDate
                .get(day)
                ?.map((appointment) => renderAppointmentCard(appointment))}
            </div>
          ))}
        </div>
        <p className="border-t border-slate-100 py-2 text-center text-xs text-slate-500">
          Select an open time to schedule. Times shown in Asia/Kolkata.
        </p>
      </div>
    );
  }

  function renderMobileWeekAgenda() {
    const dayAppointments = appointmentsByDate.get(date) ?? [];
    return (
      <div className="md:hidden">
        <div className="grid grid-cols-7 border-b border-slate-200">
          {rangeDates.map((day) => (
            <button
              className={`px-1 py-3 text-center ${day === date ? "bg-teal-50 text-teal-900" : "text-slate-600"}`}
              key={day}
              onClick={() => navigate(day)}
              type="button"
            >
              <span className="block text-[11px]">
                {dateLabel(day, { weekday: "narrow" })}
              </span>
              <span className="mt-1 block text-sm font-semibold">
                {dateLabel(day, { day: "numeric" })}
              </span>
              {(appointmentsByDate.get(day)?.length ?? 0) > 0 && (
                <span className="mx-auto mt-1 block h-1 w-1 rounded-full bg-teal-700" />
              )}
            </button>
          ))}
        </div>
        {dayAppointments.length === 0 ? (
          <EmptyCalendarDay onCreate={openNewAppointment} />
        ) : (
          <div className="divide-y divide-slate-100">
            {dayAppointments.map((appointment) => (
              <button
                className="flex w-full items-start gap-3 px-2 py-4 text-left"
                key={appointment.id}
                onClick={() => {
                  setSelectedAppointment(appointment);
                  setEditing(false);
                }}
                type="button"
              >
                <span className="w-16 shrink-0 pt-0.5 text-xs font-semibold text-slate-600">
                  {appointmentDateTime(appointment.scheduledAt).time}–
                  {appointmentEndTime(appointment)}
                </span>
                <span
                  className={`min-w-0 flex-1 rounded-lg border-l-4 px-3 py-2 ${statusClass[appointment.status]}`}
                >
                  <span className="block truncate font-semibold">
                    {appointment.patient.fullName}
                  </span>
                  <span className="mt-1 block truncate text-xs">
                    {appointment.dentistName} · {appointment.chairLabel}
                  </span>
                  <span className="mt-1 block text-xs">
                    {appointment.status.replaceAll("_", " ")}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const periodLabel =
    view === "day"
      ? dateLabel(date, {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : view === "week"
        ? `${dateLabel(range.startDate, { day: "numeric", month: "short" })} – ${dateLabel(range.endDate, { day: "numeric", month: "short", year: "numeric" })}`
        : dateLabel(date, { month: "long", year: "numeric" });

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="space-y-4 border-b border-slate-200 p-4 sm:p-5">
        <p className="text-xs text-slate-500">
          Showing {filteredAppointments.length} appointment
          {filteredAppointments.length === 1 ? "" : "s"} · Times in Asia/Kolkata
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              aria-label="Previous period"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
              onClick={() =>
                navigate(navigateAppointmentCalendar(date, view, -1))
              }
              type="button"
            >
              ‹
            </button>
            <button
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() =>
                navigate(
                  new Date().toLocaleDateString("en-CA", {
                    timeZone: "Asia/Kolkata",
                  }),
                )
              }
              type="button"
            >
              Today
            </button>
            <button
              aria-label="Next period"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
              onClick={() =>
                navigate(navigateAppointmentCalendar(date, view, 1))
              }
              type="button"
            >
              ›
            </button>
            <h2 className="ml-1 text-base font-semibold text-slate-900 sm:ml-2 sm:text-lg">
              {periodLabel}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="calendar-date">
              Jump to date
            </label>
            <input
              className="h-10 w-10 cursor-pointer rounded-lg border border-slate-300 px-2 text-transparent sm:w-auto sm:text-slate-700"
              id="calendar-date"
              onChange={(event) => {
                if (event.target.value) navigate(event.target.value);
              }}
              title="Jump to date"
              type="date"
              value={date}
            />
            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
              {(["day", "week", "month"] as const).map((calendarView) => (
                <button
                  className={`rounded-md px-2 py-1.5 text-xs font-medium capitalize sm:px-3 sm:text-sm ${view === calendarView ? "bg-white text-teal-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                  key={calendarView}
                  onClick={() => navigate(date, calendarView)}
                  type="button"
                >
                  {calendarView}
                </button>
              ))}
            </div>
            <button
              className="h-10 rounded-lg bg-teal-800 px-3 text-sm font-semibold text-white hover:bg-teal-900 sm:px-4"
              onClick={openNewAppointment}
              type="button"
            >
              <span className="sm:hidden">+ Add</span>
              <span className="hidden sm:inline">+ New appointment</span>
            </button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          <select
            aria-label="Filter by dentist"
            className="h-9 min-w-32 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700"
            onChange={(event) => setSelectedDentist(event.target.value)}
            value={selectedDentist}
          >
            <option value="">All dentists</option>
            {dentists.map((dentist) => (
              <option key={dentist.id} value={dentist.id}>
                {dentist.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by chair"
            className="h-9 min-w-28 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700"
            onChange={(event) => setSelectedChair(event.target.value)}
            value={selectedChair}
          >
            <option value="">All chairs</option>
            {chairs.map((chair) => (
              <option key={chair.id} value={chair.id}>
                {chair.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by status"
            className="h-9 min-w-32 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700"
            onChange={(event) => setSelectedStatus(event.target.value)}
            value={selectedStatus}
          >
            <option value="">All statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          {(selectedDentist || selectedChair || selectedStatus) && (
            <button
              className="h-9 shrink-0 rounded-md px-3 text-sm font-medium text-teal-800 hover:bg-teal-50"
              onClick={() => {
                setSelectedDentist("");
                setSelectedChair("");
                setSelectedStatus("");
              }}
              type="button"
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      {filteredAppointments.length === 0 ? (
        <div className="hidden md:block">
          {view !== "month" && (
            <EmptyCalendarDay onCreate={openNewAppointment} />
          )}
        </div>
      ) : null}
      {view === "month" ? (
        <MonthCalendar
          appointmentsByDate={appointmentsByDate}
          dates={rangeDates}
          onAppointmentClick={(appointment) => {
            setSelectedAppointment(appointment);
            setEditing(false);
          }}
          onDateClick={(day) => navigate(day, "day")}
        />
      ) : (
        <>
          {view === "week" && renderMobileWeekAgenda()}
          <div className={view === "week" ? "hidden md:block" : ""}>
            {renderTimeGrid(view === "day" ? [date] : rangeDates)}
          </div>
        </>
      )}

      {createSlot && (
        <CalendarDialog
          onClose={() => setCreateSlot(null)}
          title="Schedule appointment"
        >
          {optionsError ? (
            <p className="text-sm text-red-700" role="alert">
              {optionsError}{" "}
              <button
                className="font-semibold underline"
                onClick={() => void loadOptions()}
                type="button"
              >
                Retry
              </button>
            </p>
          ) : optionsLoading ? (
            <p className="text-sm text-slate-600">
              Loading patient and treatment options…
            </p>
          ) : patients.length === 0 && !prefill ? (
            <p className="text-sm text-slate-600">
              Add a patient before scheduling.{" "}
              <Link
                className="font-medium text-teal-800 underline"
                href={`/clinic/${clinicId}/patients/new`}
              >
                Create patient
              </Link>
            </p>
          ) : dentists.length === 0 || chairs.length === 0 ? (
            <p className="text-sm text-slate-600">
              Add at least one active dentist and chair before scheduling.
            </p>
          ) : (
            <AppointmentForm
              chairs={chairs}
              clinicId={clinicId}
              datePrefill={createSlot.date}
              dentists={dentists}
              patients={patients}
              prefill={prefill}
              timePrefill={createSlot.time}
              visits={visits}
            />
          )}
        </CalendarDialog>
      )}

      {selectedAppointment && (
        <CalendarDialog
          onClose={() => {
            setSelectedAppointment(null);
            setEditing(false);
          }}
          title={editing ? "Edit appointment" : "Appointment details"}
        >
          {!editing ? (
            <div className="space-y-4">
              <div>
                <p className="text-xl font-semibold text-slate-900">
                  {selectedAppointment.patient.fullName}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {dateLabel(
                    appointmentDateTime(selectedAppointment.scheduledAt).date,
                    {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    },
                  )}
                  {" · "}
                  {appointmentDateTime(selectedAppointment.scheduledAt).time}–
                  {appointmentEndTime(selectedAppointment)}
                </p>
                <p className="mt-2 text-sm text-slate-700">
                  {selectedAppointment.type} · {selectedAppointment.dentistName}{" "}
                  · {selectedAppointment.chairLabel}
                </p>
                <p
                  className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClass[selectedAppointment.status]}`}
                >
                  {selectedAppointment.status.replaceAll("_", " ")}
                </p>
                {selectedAppointment.treatmentVisit && (
                  <p className="mt-3 text-sm text-slate-600">
                    Linked to{" "}
                    {selectedAppointment.treatmentVisit.treatmentPlan.name},
                    visit {selectedAppointment.treatmentVisit.visitNumber}
                  </p>
                )}
                {selectedAppointment.notes && (
                  <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">
                    {selectedAppointment.notes}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <Link
                  className="text-sm font-medium text-teal-800 hover:underline"
                  href={`/clinic/${clinicId}/patients/${selectedAppointment.patient.id}`}
                >
                  View patient
                </Link>
                <AppointmentStatusForm
                  appointmentId={selectedAppointment.id}
                  clinicId={clinicId}
                  status={selectedAppointment.status}
                />
                {!["COMPLETED", "CANCELLED"].includes(
                  selectedAppointment.status,
                ) && (
                  <button
                    className="h-10 rounded-md bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900"
                    onClick={async () => {
                      await loadOptions();
                      setEditing(true);
                    }}
                    type="button"
                  >
                    Edit appointment
                  </button>
                )}
              </div>
            </div>
          ) : optionsError ? (
            <p className="text-sm text-red-700" role="alert">
              {optionsError}{" "}
              <button
                className="font-semibold underline"
                onClick={() => void loadOptions()}
                type="button"
              >
                Retry
              </button>
            </p>
          ) : optionsLoading ? (
            <p className="text-sm text-slate-600">
            Loading patient and treatment options…
          </p>
          ) : (
            <AppointmentForm
              chairs={chairs}
              clinicId={clinicId}
              dentists={dentists}
              initial={appointmentFormInitial(selectedAppointment)}
              patients={patients}
              visits={visits}
            />
          )}
        </CalendarDialog>
      )}
    </section>
  );
}

function EmptyCalendarDay({ onCreate }: Readonly<{ onCreate: () => void }>) {
  return (
    <div className="px-6 py-10 text-center">
      <p className="font-semibold text-slate-900">No appointments to show</p>
      <p className="mt-1 text-sm text-slate-600">
        Use an open time slot or schedule an appointment for this day.
      </p>
      <button
        className="mt-4 rounded-md px-3 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50"
        onClick={onCreate}
        type="button"
      >
        Schedule appointment
      </button>
    </div>
  );
}

function CalendarDialog({
  title,
  onClose,
  children,
}: Readonly<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}>) {
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-6"
      role="dialog"
    >
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-3xl sm:rounded-2xl sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <button
            aria-label="Close dialog"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xl text-slate-500 hover:bg-slate-100"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function MonthCalendar({
  dates,
  appointmentsByDate,
  onDateClick,
  onAppointmentClick,
}: Readonly<{
  dates: readonly string[];
  appointmentsByDate: ReadonlyMap<string, readonly Appointment[]>;
  onDateClick: (date: string) => void;
  onAppointmentClick: (appointment: Appointment) => void;
}>) {
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <div className="grid grid-cols-7">
      {weekdays.map((weekday) => (
        <div
          className="border-b border-slate-200 bg-slate-50 px-1 py-2 text-center text-xs font-semibold text-slate-600 sm:px-3"
          key={weekday}
        >
          <span className="sm:hidden">{weekday.slice(0, 1)}</span>
          <span className="hidden sm:inline">{weekday}</span>
        </div>
      ))}
      {dates.map((day) => {
        const dayAppointments = appointmentsByDate.get(day) ?? [];
        return (
          <div
            className="min-h-24 border-b border-r border-slate-100 p-1 sm:min-h-32 sm:p-2"
            key={day}
          >
            <button
              className="mb-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium text-slate-700 hover:bg-teal-50 hover:text-teal-900"
              onClick={() => onDateClick(day)}
              type="button"
            >
              {dateLabel(day, { day: "numeric" })}
            </button>
            <div className="space-y-1">
              {dayAppointments.slice(0, 3).map((appointment) => (
                <button
                  className={`w-full truncate rounded border-l-2 px-1 py-1 text-left text-[10px] sm:text-xs ${statusClass[appointment.status]}`}
                  key={appointment.id}
                  onClick={() => onAppointmentClick(appointment)}
                  type="button"
                >
                  <span className="hidden sm:inline">
                    {appointmentDateTime(appointment.scheduledAt).time}{" "}
                  </span>
                  {appointment.patient.fullName}
                </button>
              ))}
              {dayAppointments.length > 3 && (
                <button
                  className="px-1 text-[10px] font-medium text-teal-800"
                  onClick={() => onDateClick(day)}
                  type="button"
                >
                  +{dayAppointments.length - 3} more
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
