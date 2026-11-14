import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, UserRound } from "lucide-react";
import { z } from "zod";
import { ClinicRole } from "@prisma/client";

import { AppShell } from "@/components/layout/app-shell";
import { measureServerOperation } from "@/lib/performance/server-timing";
import { ClinicAccessDeniedError } from "@/features/auth/lib/authorization";
import { requireClinicMembership } from "@/features/auth/lib/server-auth";
import { DeletePatientButton } from "@/features/patients/components/delete-patient-button";
import { archivePatient, restorePatient } from "@/features/patients/actions";
import { getClinicPatient } from "@/features/patients/lib/patient-repository";
import { formatIndianPhoneNumber } from "@/features/patients/lib/patient-validation";
import {
  listInsuranceClaims,
  listInsurancePolicies,
  listInsurancePreAuthorizations,
} from "@/features/insurance/lib/insurance-repository";
import { maskPolicyIdentifier } from "@/features/insurance/lib/insurance-validation";
import { ClinicalRecordsPanel } from "@/features/clinical-records/components/clinical-records-panel";
import { listPatientDentalClinicalRecords } from "@/features/clinical-records/lib/clinical-record-repository";
import { OdontogramBoard } from "@/features/odontogram/components/odontogram-board";
import {
  listPatientOdontogramEntries,
  listPatientOdontogramTreatmentPlans,
} from "@/features/odontogram/lib/odontogram-repository";
import { listPatientTreatmentPlans } from "@/features/treatments/lib/treatment-repository";
import { listPatientTreatmentFinancialEntries } from "@/features/treatments/lib/treatment-finance";
import { PrescriptionsPanel } from "@/features/prescriptions/components/prescriptions-panel";
import {
  listClinicPrescriptionMedicineCatalogue,
  listPatientPrescriptions,
} from "@/features/prescriptions/lib/prescription-repository";
import { PatientEstimatesPanel } from "@/features/estimates/components/patient-estimates-panel";
import { listPatientTreatmentEstimates } from "@/features/estimates/lib/estimate-repository";
import { listPatientAppointments } from "@/features/appointments/lib/appointment-repository";
import { listPatientRecalls } from "@/features/recalls/lib/recall-repository";
import { listPatientMessageHistory } from "@/features/messages/lib/message-repository";
import { Patient360Overview } from "@/features/patients/components/patient-360-overview";
import {
  buildPatient360Timeline,
  getPatient360FinancialEntryLabel,
  getPatient360MedicalAlerts,
} from "@/features/patients/lib/patient-360";

type PatientDetailPageProps = Readonly<{
  params: { clinicId: string; patientId: string };
  searchParams?: {
    prescriptionVisitId?: string;
    amendsPrescriptionId?: string;
  };
}>;

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export default async function PatientDetailPage({
  params,
  searchParams,
}: PatientDetailPageProps) {
  const clinicId = z.string().uuid().safeParse(params.clinicId);
  const patientId = z.string().uuid().safeParse(params.patientId);

  if (!clinicId.success || !patientId.success) {
    notFound();
  }

  let membership;

  try {
    membership = await requireClinicMembership(clinicId.data);
  } catch (error) {
    if (error instanceof ClinicAccessDeniedError) {
      notFound();
    }

    throw error;
  }

  const [
    patient,
    insurancePolicies,
    odontogramEntries,
    odontogramTreatmentPlans,
    treatmentPlans,
    clinicalRecords,
    prescriptions,
    medicineCatalogue,
    treatmentEstimates,
    patientAppointments,
    recalls,
    financialEntries,
    insuranceClaimsResult,
    preAuthorizations,
    messageHistory,
  ] = await Promise.all([
    measureServerOperation("patient360.patient", () =>
      getClinicPatient(membership.clinicId, patientId.data),
    ),
    measureServerOperation("patient360.insurance_policies", () =>
      listInsurancePolicies(membership.clinicId, "", patientId.data),
    ),
    measureServerOperation("patient360.odontogram_entries", () =>
      listPatientOdontogramEntries(membership.clinicId, patientId.data),
    ),
    measureServerOperation("patient360.odontogram_treatment_plans", () =>
      listPatientOdontogramTreatmentPlans(membership.clinicId, patientId.data),
    ),
    measureServerOperation("patient360.treatment_plans", () =>
      listPatientTreatmentPlans(membership.clinicId, patientId.data),
    ),
    measureServerOperation("patient360.clinical_records", () =>
      listPatientDentalClinicalRecords(membership.clinicId, patientId.data),
    ),
    measureServerOperation("patient360.prescriptions", () =>
      listPatientPrescriptions(membership.clinicId, patientId.data),
    ),
    measureServerOperation("patient360.medicine_catalogue", () =>
      listClinicPrescriptionMedicineCatalogue(membership.clinicId),
    ),
    measureServerOperation("patient360.estimates", () =>
      listPatientTreatmentEstimates(membership.clinicId, patientId.data),
    ),
    measureServerOperation("patient360.appointments", () =>
      listPatientAppointments(membership.clinicId, patientId.data),
    ),
    measureServerOperation("patient360.recalls", () =>
      listPatientRecalls(membership.clinicId, patientId.data),
    ),
    measureServerOperation("patient360.financial_entries", () =>
      listPatientTreatmentFinancialEntries(membership.clinicId, patientId.data),
    ),
    measureServerOperation("patient360.insurance_claims", () =>
      listInsuranceClaims(membership.clinicId, {
        query: "",
        patientId: patientId.data,
        page: 1,
      }),
    ),
    measureServerOperation("patient360.pre_authorizations", () =>
      listInsurancePreAuthorizations(membership.clinicId, "", patientId.data),
    ),
    measureServerOperation("patient360.message_history", () =>
      listPatientMessageHistory(membership.clinicId, patientId.data),
    ),
  ]);

  if (!patient) {
    notFound();
  }
  const correctionSource = prescriptions.find(
    (prescription) => prescription.id === searchParams?.amendsPrescriptionId,
  );
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(new Date());
  const patientPath = `/clinic/${membership.clinicId}/patients/${patient.id}`;
  const appointmentPath = `/clinic/${membership.clinicId}/appointments`;
  const treatmentPath = `${patientPath}/treatments`;
  const recallPath = `/clinic/${membership.clinicId}/recalls/new?patientId=${patient.id}`;
  const claimsPath = `/clinic/${membership.clinicId}/insurance/claims?patientId=${patient.id}`;
  const chartEntries = odontogramEntries.map((entry) => ({
    ...entry,
    createdAt: entry.createdAt.toISOString(),
  }));
  const treatmentVisitOptions = treatmentPlans.flatMap((plan) =>
    plan.visits.map((visit) => ({
      id: visit.id,
      visitNumber: visit.visitNumber,
      dueDate: visit.dueDate,
      status: visit.status,
      treatmentPlan: { id: plan.id, name: plan.name },
    })),
  );
  const { allergies, medicalHistory } =
    getPatient360MedicalAlerts(clinicalRecords);
  const timeline = buildPatient360Timeline([
    {
      id: `patient-${patient.id}`,
      occurredAt: patient.createdAt,
      kind: "patient",
      title: "Patient record created",
      href: patientPath,
    },
    ...patientAppointments.upcoming.map((appointment) => ({
      id: `appointment-${appointment.id}`,
      occurredAt: appointment.scheduledAt,
      kind: "appointment",
      title: `Appointment: ${appointment.type}`,
      description: `${appointment.dentistName} · ${appointment.chairLabel}`,
      href: `${appointmentPath}?date=${new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
      }).format(appointment.scheduledAt)}&view=day`,
    })),
    ...patientAppointments.past.map((appointment) => ({
      id: `appointment-${appointment.id}`,
      occurredAt: appointment.scheduledAt,
      kind: "appointment",
      title: `Appointment: ${appointment.type}`,
      description: `${appointment.dentistName} · ${appointment.chairLabel} · ${appointment.status}`,
      href: `${appointmentPath}?date=${new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
      }).format(appointment.scheduledAt)}&view=day`,
    })),
    ...recalls.map((recall) => ({
      id: `recall-${recall.id}`,
      occurredAt: recall.createdAt,
      kind: "recall",
      title: `Recall: ${recall.customName || recall.type.replaceAll("_", " ")}`,
      description: `Due ${new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeZone: "Asia/Kolkata",
      }).format(recall.dueDate)} · ${recall.status}`,
      href: recallPath,
    })),
    ...treatmentPlans.map((plan) => ({
      id: `treatment-plan-${plan.id}`,
      occurredAt: plan.createdAt,
      kind: "treatment-plan",
      title: `Treatment plan: ${plan.name}`,
      description: plan.status.replaceAll("_", " "),
      href: treatmentPath,
    })),
    ...clinicalRecords.map((record) => ({
      id: `clinical-record-${record.id}`,
      occurredAt: record.createdAt,
      kind: "clinical-record",
      title: "Clinical record",
      description: record.diagnosis || record.chiefComplaints || undefined,
      href: "#clinical-records",
    })),
    ...odontogramEntries.map((entry) => ({
      id: `odontogram-${entry.id}`,
      occurredAt: entry.createdAt,
      kind: "odontogram",
      title: `Odontogram entry · tooth ${entry.toothNumber}`,
      description: entry.treatmentName || entry.finding || entry.entryType,
      href: "#odontogram",
    })),
    ...prescriptions.map((prescription) => ({
      id: `prescription-${prescription.id}`,
      occurredAt: prescription.finalizedAt ?? prescription.createdAt,
      kind: "prescription",
      title: "Prescription finalized",
      description: prescription.medicines
        .map((medicine) => medicine.medicineName)
        .join(", "),
      href: "#prescriptions",
    })),
    ...treatmentEstimates.map((estimate) => ({
      id: `estimate-${estimate.id}`,
      occurredAt: estimate.finalizedAt ?? estimate.createdAt,
      kind: "estimate",
      title: `Treatment estimate · v${estimate.version}`,
      description: estimate.treatmentPlan.name,
      href: "#estimates",
    })),
    ...financialEntries.map((entry) => ({
      id: `financial-${entry.id}`,
      occurredAt: entry.paidAt,
      kind: entry.entryType.toLowerCase(),
      title: `${getPatient360FinancialEntryLabel(entry.entryType)} · ${entry.treatmentPlan.name}`,
      description: entry.receiptNumber
        ? `Receipt ${entry.receiptNumber}`
        : undefined,
      href: "#patient-financial-history",
    })),
    ...insuranceClaimsResult.claims.map((claim) => ({
      id: `insurance-claim-${claim.id}`,
      occurredAt: claim.createdAt,
      kind: "insurance-claim",
      title: "Insurance claim",
      description: `${claim.policy.provider.name} · ${claim.status.replaceAll("_", " ")}`,
      href: claimsPath,
    })),
    ...preAuthorizations.map((authorization) => ({
      id: `insurance-preauth-${authorization.id}`,
      occurredAt: authorization.createdAt,
      kind: "insurance",
      title: "Insurance pre-authorization",
      description: `${authorization.policy.provider.name} · ${authorization.status.replaceAll("_", " ")}`,
      href: claimsPath,
    })),
    ...messageHistory.map((message) => ({
      id: `message-${message.id}`,
      occurredAt: message.createdAt,
      kind: "message",
      title: message.templateNameSnapshot || "Patient message",
      description: message.status.replaceAll("_", " "),
      href: "#patient-activity",
    })),
  ]);

  return (
    <AppShell activeSection="patients" clinicId={membership.clinicId}>
      <div className="mx-auto max-w-6xl">
        <Link
          className="inline-flex min-h-9 items-center gap-2 rounded-md text-sm font-medium text-slate-600 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={`/clinic/${membership.clinicId}/patients`}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to patients
        </Link>

        <header className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-teal-50 text-teal-800">
              <UserRound aria-hidden="true" className="size-6" />
            </span>
            <div>
              <p className="text-sm font-medium text-teal-700">
                Patient record
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
                {patient.fullName}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                {formatIndianPhoneNumber(patient.phoneNumber)}
              </p>
              {patient.email && (
                <p className="mt-1 text-sm text-slate-600">{patient.email}</p>
              )}
              {patient.archivedAt && <p className="mt-2 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">Archived {dateFormatter.format(patient.archivedAt)}</p>}
              {patient.portalAccessEnabled && (
                <p className="mt-1 text-xs font-medium text-teal-800">
                  Patient portal enabled
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {membership.role === ClinicRole.OWNER && (
              <a
                className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                href={`${patientPath}/export`}
              >
                Export patient data
              </a>
            )}
            <Link
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              href={`${patientPath}/edit`}
            >
              <Pencil aria-hidden="true" className="size-4" />
              Edit patient
            </Link>
          </div>
        </header>

        <nav
          aria-label="Patient profile navigation"
          className="mt-6 flex flex-wrap gap-2"
        >
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            href={appointmentPath}
          >
            Appointments
          </Link>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            href={treatmentPath}
          >
            Treatment plans
          </Link>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            href={`/clinic/${membership.clinicId}/recalls/new?patientId=${patient.id}`}
          >
            Create preventive recall
          </Link>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            href={`/clinic/${membership.clinicId}/insurance/policies/new?patientId=${patient.id}`}
          >
            Add insurance policy
          </Link>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            href="#patient-activity"
          >
            Activity
          </Link>
        </nav>

        <Patient360Overview
          allergies={allergies}
          claims={insuranceClaimsResult.claims.map((claim) => ({
            ...claim,
            amountClaimed: Number(claim.amountClaimed),
          }))}
          clinicId={membership.clinicId}
          financialEntries={financialEntries.map((entry) => ({
            ...entry,
            amount: Number(entry.amount),
          }))}
          medicalHistory={medicalHistory}
          messages={messageHistory}
          pastAppointments={patientAppointments.past}
          patientId={patient.id}
          preAuthorizations={preAuthorizations}
          recalls={recalls}
          timeline={timeline}
          treatmentPlans={treatmentPlans}
          upcomingAppointmentCount={patientAppointments.upcomingCount}
          upcomingAppointments={patientAppointments.upcoming}
        />

        <section className="mt-7" id="odontogram">
          <OdontogramBoard
            clinicId={membership.clinicId}
            entries={chartEntries}
            patientId={patient.id}
            treatmentPlans={odontogramTreatmentPlans}
          />
        </section>

        <section className="mt-7" id="clinical-records">
          <ClinicalRecordsPanel
            clinicId={membership.clinicId}
            patientId={patient.id}
            records={clinicalRecords}
            visits={treatmentVisitOptions}
            odontogramEntries={chartEntries.map((entry) => ({
              id: entry.id,
              toothNumber: entry.toothNumber,
              dentition: entry.dentition,
              entryType: entry.entryType,
              finding: entry.finding,
            }))}
          />
        </section>

        <section className="mt-7" id="prescriptions">
          <PrescriptionsPanel
            catalogue={medicineCatalogue}
            clinicId={membership.clinicId}
            correctionSource={correctionSource}
            initialVisitId={searchParams?.prescriptionVisitId}
            patientId={patient.id}
            patientName={patient.fullName}
            prescriptions={prescriptions}
            today={today}
            visits={treatmentVisitOptions}
          />
        </section>

        <section className="mt-7" id="estimates">
          <PatientEstimatesPanel
            clinicId={membership.clinicId}
            estimates={treatmentEstimates}
            patientId={patient.id}
          />
        </section>

        <section
          className="mt-7 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
          id="patient-policies"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Insurance policies
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Policy references are masked in this summary.
              </p>
            </div>
            <Link
              className="inline-flex min-h-9 items-center rounded-md border border-input px-3 text-sm font-medium hover:bg-slate-50"
              href={`/clinic/${membership.clinicId}/insurance/policies/new?patientId=${patient.id}`}
            >
              Add policy
            </Link>
          </div>
          {insurancePolicies.length ? (
            <ul className="mt-4 divide-y divide-slate-100">
              {insurancePolicies.map((policy) => {
                const expired =
                  policy.validUntil.toISOString().slice(0, 10) < today;
                return (
                  <li
                    className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
                    key={policy.id}
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {policy.provider.name} ·{" "}
                        {maskPolicyIdentifier(policy.policyNumber)}
                      </p>
                      <p className="text-xs text-slate-500">
                        Valid through {dateFormatter.format(policy.validUntil)}
                        {policy.coverageLimit
                          ? ` · Limit ₹${Number(policy.coverageLimit).toLocaleString("en-IN")}`
                          : ""}
                        {policy.deductible !== null
                          ? ` · Deductible ₹${Number(policy.deductible).toLocaleString("en-IN")}`
                          : ""}
                        {policy.coPaymentPercent !== null
                          ? ` · Co-pay ${policy.coPaymentPercent.toString()}%`
                          : ""}
                      </p>
                      {(policy.coverageNotes || policy.exclusions) && (
                        <details className="mt-2 text-xs text-slate-600">
                          <summary className="cursor-pointer font-medium text-teal-800">
                            Coverage notes and exclusions
                          </summary>
                          {policy.coverageNotes && (
                            <p className="mt-1 whitespace-pre-wrap">
                              {policy.coverageNotes}
                            </p>
                          )}
                          {policy.exclusions && (
                            <p className="mt-1 whitespace-pre-wrap">
                              Exclusions: {policy.exclusions}
                            </p>
                          )}
                        </details>
                      )}
                    </div>
                    <span
                      className={
                        expired
                          ? "text-xs font-semibold text-red-700"
                          : "text-xs font-semibold text-emerald-700"
                      }
                    >
                      {expired ? "Expired" : "Current"}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
              No insurance policies are recorded for this patient.
            </p>
          )}
          <Link
            className="mt-4 inline-flex min-h-9 items-center text-sm font-medium text-teal-800 hover:underline"
            href={`/clinic/${membership.clinicId}/insurance/claims?patientId=${patient.id}`}
          >
            View this patient&apos;s insurance claims
          </Link>
        </section>

        <section
          aria-labelledby="patient-details-title"
          className="mt-7 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
        >
          <h2
            className="text-base font-semibold text-slate-900"
            id="patient-details-title"
          >
            Patient details
          </h2>
          <dl className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                WhatsApp consent
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {patient.whatsappOptIn ? (
                  <>
                    <span className="font-medium text-emerald-800">
                      Opted in
                    </span>
                    {patient.whatsappOptedInAt && (
                      <span className="mt-1 block text-slate-500">
                        Recorded{" "}
                        {dateFormatter.format(patient.whatsappOptedInAt)}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="font-medium text-slate-600">
                    Not opted in — WhatsApp follow-up is not allowed
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Created
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {dateFormatter.format(patient.createdAt)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Last updated
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {dateFormatter.format(patient.updatedAt)}
              </dd>
            </div>
          </dl>
          <div className="mt-6 border-t border-slate-100 pt-5">
            <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Notes
            </h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {patient.notes || "No notes added."}
            </p>
          </div>
        </section>

        {membership.role === "OWNER" && (
          <section
            aria-labelledby="delete-patient-title"
            className="mt-6 rounded-xl border border-red-200 bg-white p-5 sm:p-6"
          >
            <h2
              className="text-sm font-semibold text-slate-900"
              id="delete-patient-title"
            >
              Delete patient
            </h2>
            <p className="mb-4 mt-1 text-sm leading-5 text-slate-600">
              Deletion is available only for an empty patient record with no
              linked clinical, appointment, financial, insurance, recall,
              message, prescription, or export history. Records with history
              must be retained; deleting a patient never removes that linked
              history.
            </p>
            <DeletePatientButton
              clinicId={membership.clinicId}
              patientId={patient.id}
            />
          </section>
        )}
      </div>
    </AppShell>
  );
}
