import Link from "next/link";
import {
  CalendarDays,
  Clock3,
  CreditCard,
  FileHeart,
  ShieldCheck,
} from "lucide-react";
import type {
  AppointmentStatus,
  FinancialEntryType,
  PreventiveRecallStatus,
} from "@prisma/client";

import {
  getPatient360AppointmentStatusPresentation,
  getPatient360FinancialEntryLabel,
  getPatient360PaymentCount,
  getPatient360RecallPresentation,
  type Patient360TimelineItem,
} from "@/features/patients/lib/patient-360";

type Patient360Appointment = Readonly<{
  id: string;
  scheduledAt: Date;
  durationMinutes: number;
  dentistName: string;
  chairLabel: string;
  type: string;
  status: AppointmentStatus;
}>;

type Patient360Recall = Readonly<{
  id: string;
  type: string;
  customName: string | null;
  dueDate: Date;
  status: PreventiveRecallStatus;
}>;

type Patient360TreatmentPlan = Readonly<{
  id: string;
  name: string;
  status: string;
  visits: ReadonlyArray<{
    id: string;
    visitNumber: number;
    dueDate: Date;
    status: string;
  }>;
}>;

type Patient360FinancialEntry = Readonly<{
  id: string;
  entryType: FinancialEntryType;
  paymentMethod: string | null;
  amount: number;
  paidAt: Date;
  receiptNumber: string | null;
  treatmentPlan: { name: string };
}>;

type Patient360Claim = Readonly<{
  id: string;
  type: string;
  status: string;
  treatmentDetails: string;
  amountClaimed: number;
  createdAt: Date;
  policy: { provider: { name: string } };
}>;

type Patient360PreAuthorization = Readonly<{
  id: string;
  status: string;
  proposedTreatment: string;
  createdAt: Date;
  policy: { provider: { name: string } };
}>;

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});
const timeFormatter = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});
const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});
const recallToneClasses = {
  overdue: "bg-red-100 text-red-800",
  upcoming: "bg-teal-100 text-teal-800",
  "due-today": "bg-amber-100 text-amber-900",
  positive: "bg-emerald-100 text-emerald-800",
  neutral: "bg-slate-100 text-slate-700",
} as const;
const appointmentToneClasses = {
  cancelled: "bg-red-100 text-red-800",
  positive: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-900",
  neutral: "bg-slate-100 text-slate-700",
} as const;

function label(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function clinicDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(value);
}

function EmptyState({ children }: Readonly<{ children: string }>) {
  return (
    <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
      {children}
    </p>
  );
}

function SectionHeading({
  title,
  href,
  linkText,
}: Readonly<{ title: string; href?: string; linkText?: string }>) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {href && linkText && (
        <Link
          className="text-sm font-medium text-teal-800 hover:underline"
          href={href}
        >
          {linkText}
        </Link>
      )}
    </div>
  );
}

function AppointmentStatusBadge({
  status,
}: Readonly<{ status: AppointmentStatus }>) {
  const presentation = getPatient360AppointmentStatusPresentation(status);
  return (
    <span
      aria-label={`Appointment status: ${presentation.label}`}
      className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${appointmentToneClasses[presentation.tone]}`}
    >
      {presentation.label}
    </span>
  );
}

function RecallStatusBadge({
  status,
  dueDate,
}: Readonly<{ status: PreventiveRecallStatus; dueDate: Date }>) {
  const presentation = getPatient360RecallPresentation(status, dueDate);
  return (
    <span
      aria-label={`Recall status: ${presentation.label}`}
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${recallToneClasses[presentation.tone]}`}
    >
      {presentation.label}
    </span>
  );
}

export function Patient360Overview({
  clinicId,
  patientId,
  allergies,
  medicalHistory,
  upcomingAppointmentCount,
  upcomingAppointments,
  pastAppointments,
  recalls,
  treatmentPlans,
  financialEntries,
  claims,
  preAuthorizations,
  messages,
  timeline,
}: Readonly<{
  clinicId: string;
  patientId: string;
  allergies: string | null;
  medicalHistory: string | null;
  upcomingAppointmentCount: number;
  upcomingAppointments: Patient360Appointment[];
  pastAppointments: Patient360Appointment[];
  recalls: Patient360Recall[];
  treatmentPlans: Patient360TreatmentPlan[];
  financialEntries: Patient360FinancialEntry[];
  claims: Patient360Claim[];
  preAuthorizations: Patient360PreAuthorization[];
  messages: Array<{
    id: string;
    createdAt: Date;
    status: string;
    templateNameSnapshot: string | null;
  }>;
  timeline: Patient360TimelineItem[];
}>) {
  const patientPath = `/clinic/${clinicId}/patients/${patientId}`;
  const appointmentsPath = `/clinic/${clinicId}/appointments`;
  const recallPath = `/clinic/${clinicId}/recalls/new?patientId=${patientId}`;
  const insuranceClaimsPath = `/clinic/${clinicId}/insurance/claims?patientId=${patientId}`;
  const treatmentPath = `${patientPath}/treatments`;
  const activePlans = treatmentPlans.filter(
    (plan) => plan.status !== "COMPLETED" && plan.status !== "CANCELLED",
  ).length;
  const activeRecalls = recalls.filter((recall) => recall.status === "ACTIVE");

  return (
    <div className="mt-6 space-y-5">
      <section
        aria-label="Patient overview"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {[
          {
            label: "Upcoming appointments",
            value: upcomingAppointmentCount,
            description: null,
            icon: CalendarDays,
            href: appointmentsPath,
          },
          {
            label: "Active treatment plans",
            value: activePlans,
            description: null,
            icon: FileHeart,
            href: treatmentPath,
          },
          {
            label: "Active recalls",
            value: activeRecalls.length,
            description: null,
            icon: Clock3,
            href: recallPath,
          },
          {
            label: "Payments recorded",
            value: getPatient360PaymentCount(financialEntries),
            description: "Payment entries only",
            icon: CreditCard,
            href: treatmentPath,
          },
        ].map(
          ({ label: metricLabel, value, description, icon: Icon, href }) => (
            <Link
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-300"
              href={href}
              key={metricLabel}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-600">
                  {metricLabel}
                </span>
                <Icon aria-hidden="true" className="size-5 text-teal-700" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {value}
              </p>
              {description && (
                <p className="mt-1 text-xs text-slate-500">{description}</p>
              )}
            </Link>
          ),
        )}
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-amber-800"
          />
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">
              Medical alerts and history
            </h2>
            <dl className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                  Allergies
                </dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                  {allergies || "No allergies recorded"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                  Medical history
                </dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                  {medicalHistory || "No medical history recorded"}
                </dd>
              </div>
            </dl>
            <Link
              className="mt-3 inline-flex text-sm font-medium text-teal-800 hover:underline"
              href="#clinical-records"
            >
              Review clinical records
            </Link>
          </div>
        </div>
      </section>

      <section
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        id="patient-appointments"
      >
        <SectionHeading
          href={appointmentsPath}
          linkText="Open appointments"
          title="Appointments"
        />
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-700">
              Upcoming
            </h3>
            {upcomingAppointments.length ? (
              <ul className="divide-y divide-slate-100">
                {upcomingAppointments.map((appointment) => {
                  const end = new Date(
                    appointment.scheduledAt.getTime() +
                      appointment.durationMinutes * 60_000,
                  );
                  return (
                    <li className="py-3" key={appointment.id}>
                      <Link
                        className="font-medium text-slate-900 hover:text-teal-800"
                        href={`${appointmentsPath}?date=${clinicDate(appointment.scheduledAt)}&view=day`}
                      >
                        {dateFormatter.format(appointment.scheduledAt)} ·{" "}
                        {timeFormatter.format(appointment.scheduledAt)}–
                        {timeFormatter.format(end)}
                      </Link>
                      <p className="mt-1 text-sm text-slate-600">
                        {appointment.type} · {appointment.dentistName} ·{" "}
                        {appointment.chairLabel}
                      </p>
                      <AppointmentStatusBadge status={appointment.status} />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState>No upcoming appointments are scheduled.</EmptyState>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-700">
              Recent history
            </h3>
            {pastAppointments.length ? (
              <ul className="divide-y divide-slate-100">
                {pastAppointments.slice(0, 5).map((appointment) => (
                  <li className="py-3" key={appointment.id}>
                    <Link
                      className="font-medium text-slate-900 hover:text-teal-800"
                      href={`${appointmentsPath}?date=${clinicDate(appointment.scheduledAt)}&view=day`}
                    >
                      {dateFormatter.format(appointment.scheduledAt)} ·{" "}
                      {appointment.type}
                    </Link>
                    <p className="mt-1 text-sm text-slate-600">
                      {appointment.dentistName} · {appointment.chairLabel}
                    </p>
                    <AppointmentStatusBadge status={appointment.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>No past appointments are recorded.</EmptyState>
            )}
          </div>
        </div>
      </section>

      <section
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        id="patient-treatment-plans"
      >
        <SectionHeading
          href={treatmentPath}
          linkText="Manage treatment plans"
          title="Treatment plans and visits"
        />
        {treatmentPlans.length ? (
          <ul className="divide-y divide-slate-100">
            {treatmentPlans.slice(0, 8).map((plan) => (
              <li className="py-3" key={plan.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-900">{plan.name}</p>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                    {label(plan.status)}
                  </span>
                </div>
                {plan.visits.length ? (
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {plan.visits.map((visit) => (
                      <li
                        className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"
                        key={visit.id}
                      >
                        Visit {visit.visitNumber} ·{" "}
                        {dateFormatter.format(visit.dueDate)} ·{" "}
                        {label(visit.status)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">
                    No visits are recorded for this plan.
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>No treatment plans are recorded.</EmptyState>
        )}
      </section>

      <section
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        id="patient-recalls"
      >
        <SectionHeading
          href={recallPath}
          linkText="Create preventive recall"
          title="Preventive recalls"
        />
        {recalls.length ? (
          <ul className="divide-y divide-slate-100">
            {recalls.slice(0, 8).map((recall) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 py-3"
                key={recall.id}
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {recall.customName || label(recall.type)}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Due {dateFormatter.format(recall.dueDate)}
                  </p>
                </div>
                <RecallStatusBadge
                  dueDate={recall.dueDate}
                  status={recall.status}
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>No preventive recalls are recorded.</EmptyState>
        )}
      </section>

      <section
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        id="patient-insurance"
      >
        <SectionHeading
          href={insuranceClaimsPath}
          linkText="View insurance claims"
          title="Insurance claims and pre-authorizations"
        />
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-700">Claims</h3>
            {claims.length ? (
              <ul className="divide-y divide-slate-100">
                {claims.slice(0, 6).map((claim) => (
                  <li className="py-3" key={claim.id}>
                    <p className="font-medium text-slate-900">
                      {claim.policy.provider.name} · {label(claim.type)}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {claim.treatmentDetails}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {label(claim.status)} ·{" "}
                      {currencyFormatter.format(claim.amountClaimed)} claimed ·{" "}
                      {dateFormatter.format(claim.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>No insurance claims are recorded.</EmptyState>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-700">
              Pre-authorizations
            </h3>
            {preAuthorizations.length ? (
              <ul className="divide-y divide-slate-100">
                {preAuthorizations.slice(0, 6).map((authorization) => (
                  <li className="py-3" key={authorization.id}>
                    <p className="font-medium text-slate-900">
                      {authorization.policy.provider.name}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {authorization.proposedTreatment}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {label(authorization.status)} ·{" "}
                      {dateFormatter.format(authorization.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState>
                No insurance pre-authorizations are recorded.
              </EmptyState>
            )}
          </div>
        </div>
      </section>

      <section
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        id="patient-financial-history"
      >
        <SectionHeading
          href={treatmentPath}
          linkText="Open financial records"
          title="Financial history"
        />
        <p className="mb-3 text-sm text-slate-600">
          Includes payments, refunds, and discounts. The summary metric above
          counts payment entries only.
        </p>
        {financialEntries.length ? (
          <ul className="divide-y divide-slate-100">
            {financialEntries.map((entry) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 py-3"
                key={entry.id}
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {getPatient360FinancialEntryLabel(entry.entryType)} ·{" "}
                    {entry.treatmentPlan.name}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {dateFormatter.format(entry.paidAt)}
                    {entry.paymentMethod
                      ? ` · ${label(entry.paymentMethod)}`
                      : ""}
                    {entry.receiptNumber
                      ? ` · Receipt ${entry.receiptNumber}`
                      : ""}
                  </p>
                </div>
                <span className="font-semibold text-slate-900">
                  {currencyFormatter.format(entry.amount)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>No financial entries are recorded.</EmptyState>
        )}
      </section>

      <section
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        id="patient-activity"
      >
        <SectionHeading title="Recent activity" />
        {timeline.length ? (
          <ol className="relative space-y-4 border-l border-slate-200 pl-5">
            {timeline.map((item) => (
              <li className="relative" key={item.id}>
                <span
                  aria-hidden="true"
                  className="absolute -left-[1.55rem] top-1.5 size-2.5 rounded-full border-2 border-white bg-teal-600 ring-1 ring-teal-200"
                />
                <p className="text-xs text-slate-500">
                  {dateFormatter.format(item.occurredAt)}
                </p>
                <Link
                  className="mt-0.5 inline-flex font-medium text-slate-900 hover:text-teal-800"
                  href={item.href}
                >
                  {item.title}
                </Link>
                {item.description && (
                  <p className="mt-1 text-sm text-slate-600">
                    {item.description}
                  </p>
                )}
                <span className="mt-1 block text-xs text-slate-500">
                  {label(item.kind)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState>No activity is recorded for this patient yet.</EmptyState>
        )}
        {messages.length > 0 && (
          <p className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
            Activity includes {messages.length} recent message record
            {messages.length === 1 ? "" : "s"}.
          </p>
        )}
      </section>
    </div>
  );
}
