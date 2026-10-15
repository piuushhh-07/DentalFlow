import { CalendarCheck2, ClipboardList, UsersRound } from "lucide-react";

const upcomingAreas = [
  {
    icon: UsersRound,
    label: "Patient directory",
    description: "Your clinic's patient list will be organized here.",
  },
  {
    icon: ClipboardList,
    label: "Treatment follow-ups",
    description: "Keep each treatment journey and next visit in view.",
  },
  {
    icon: CalendarCheck2,
    label: "Preventive recalls",
    description: "Make routine checkups easier to remember.",
  },
];

export function DashboardPlaceholder() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <p className="text-sm font-medium text-teal-700">Your workspace</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-[34px]">
          Clinic overview
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
          A clear home for the follow-ups and preventive care that keep patients
          moving forward.
        </p>
      </div>

      <section
        aria-labelledby="setup-title"
        className="overflow-hidden rounded-2xl border border-teal-100 bg-white shadow-sm"
      >
        <div className="border-b border-teal-100 bg-gradient-to-br from-teal-50 via-white to-white px-6 py-8 sm:px-9 sm:py-10">
          <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-teal-700 text-white shadow-sm">
            <CalendarCheck2 aria-hidden="true" className="size-6" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">
            Getting started
          </p>
          <h2
            className="mt-2 max-w-xl text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px]"
            id="setup-title"
          >
            Your clinic workspace is ready to take shape.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            Once your clinic is set up, this is where your team&apos;s
            day-to-day follow-ups will come together. No patient data or
            activity is shown until a clinic is connected.
          </p>
        </div>

        <div className="grid divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {upcomingAreas.map(({ icon: Icon, label, description }) => (
            <div className="flex gap-3 px-6 py-5 sm:block sm:px-5" key={label}>
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 sm:mb-4">
                <Icon aria-hidden="true" className="size-[18px]" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-slate-800">
                  {label}
                </h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
