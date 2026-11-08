"use client";

import { DentistWorkingStatus } from "@prisma/client";
import { useFormState } from "react-dom";

import {
  initialTeamActionState,
  saveDentistProfileAction,
} from "@/features/team/actions";
import { dentistAvailabilitySchema } from "@/features/appointments/lib/appointment-validation";

type DentistDay = {
  dayOfWeek: number;
  isWorking: boolean;
  startTime: string;
  endTime: string;
};

type DentistFormValue = Readonly<{
  id: string;
  name: string;
  profilePhotoUrl: string;
  email: string;
  phoneNumber: string;
  qualifications: string;
  specialization: string;
  registrationNumber: string;
  registrationCouncil: string;
  yearsExperience: string;
  biography: string;
  consultationFee: string;
  workingStatus: DentistWorkingStatus;
  weeklyAvailability: readonly DentistDay[];
}>;

const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const inputClass =
  "mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-teal-700";

function defaultAvailability(): DentistDay[] {
  return days.map((_, dayOfWeek) => ({
    dayOfWeek,
    isWorking: dayOfWeek >= 1 && dayOfWeek <= 5,
    startTime: "09:00",
    endTime: "17:00",
  }));
}

export function DentistProfileForm({
  clinicId,
  initial,
}: Readonly<{ clinicId: string; initial?: DentistFormValue }>) {
  const [state, formAction] = useFormState(
    saveDentistProfileAction,
    initialTeamActionState,
  );
  const availability = initial?.weeklyAvailability
    ? dentistAvailabilitySchema.parse(initial.weeklyAvailability)
    : defaultAvailability();

  return (
    <form action={formAction} className="space-y-7">
      <input name="clinicId" type="hidden" value={clinicId} />
      {initial && <input name="dentistId" type="hidden" value={initial.id} />}

      <section>
        <h2 className="text-lg font-semibold text-slate-900">
          Professional profile
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Full name
            <input
              className={inputClass}
              defaultValue={initial?.name}
              maxLength={120}
              name="name"
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Profile photo URL
            <input
              className={inputClass}
              defaultValue={initial?.profilePhotoUrl}
              maxLength={500}
              name="profilePhotoUrl"
              type="url"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Email
            <input
              className={inputClass}
              defaultValue={initial?.email}
              maxLength={254}
              name="email"
              type="email"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Phone
            <input
              className={inputClass}
              defaultValue={initial?.phoneNumber}
              maxLength={20}
              name="phoneNumber"
              type="tel"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Qualifications
            <input
              className={inputClass}
              defaultValue={initial?.qualifications}
              maxLength={500}
              name="qualifications"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Specialization
            <input
              className={inputClass}
              defaultValue={initial?.specialization}
              maxLength={160}
              name="specialization"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Registration number
            <input
              className={inputClass}
              defaultValue={initial?.registrationNumber}
              maxLength={120}
              name="registrationNumber"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Registration state / council
            <input
              className={inputClass}
              defaultValue={initial?.registrationCouncil}
              maxLength={160}
              name="registrationCouncil"
            />
          </label>
          <p className="text-xs text-slate-500 sm:col-span-2">
            Registration details are provided by the clinic and are not verified
            by DentalFlow.
          </p>
          <label className="text-sm font-medium text-slate-700">
            Years of experience
            <input
              className={inputClass}
              defaultValue={initial?.yearsExperience}
              max={80}
              min={0}
              name="yearsExperience"
              type="number"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Consultation fee (INR)
            <input
              className={inputClass}
              defaultValue={initial?.consultationFee}
              min={0}
              name="consultationFee"
              step="0.01"
              type="number"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Working status
            <select
              className={inputClass}
              defaultValue={
                initial?.workingStatus ?? DentistWorkingStatus.ACTIVE
              }
              name="workingStatus"
            >
              <option value={DentistWorkingStatus.ACTIVE}>Active</option>
              <option value={DentistWorkingStatus.INACTIVE}>Inactive</option>
              <option value={DentistWorkingStatus.ON_LEAVE}>On leave</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Biography
            <textarea
              className="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              defaultValue={initial?.biography}
              maxLength={3000}
              name="biography"
            />
          </label>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">
          Weekly availability
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Appointments must fit entirely inside the selected working hours.
        </p>
        <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {availability.map((day) => (
            <div
              className="grid items-center gap-3 p-3 sm:grid-cols-[1fr_auto_1fr_1fr]"
              key={day.dayOfWeek}
            >
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  defaultChecked={day.isWorking}
                  name={`day-${day.dayOfWeek}-enabled`}
                  type="checkbox"
                />
                {days[day.dayOfWeek]}
              </label>
              <span className="text-xs text-slate-500">Hours</span>
              <input
                aria-label={`${days[day.dayOfWeek]} opening time`}
                className={inputClass}
                defaultValue={day.startTime}
                name={`day-${day.dayOfWeek}-start`}
                type="time"
              />
              <input
                aria-label={`${days[day.dayOfWeek]} closing time`}
                className={inputClass}
                defaultValue={day.endTime}
                name={`day-${day.dayOfWeek}-end`}
                type="time"
              />
            </div>
          ))}
        </div>
      </section>

      {state.error && (
        <p className="text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="text-sm text-emerald-800" role="status">
          {state.success}
        </p>
      )}
      <button
        className="h-10 rounded-md bg-teal-800 px-5 text-sm font-semibold text-white hover:bg-teal-900"
        type="submit"
      >
        Save dentist profile
      </button>
    </form>
  );
}
