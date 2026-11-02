"use client";

import { useEffect, useMemo, useState } from "react";
import { useDemoData } from "@/features/demo/components/demo-provider";
import type {
  DemoEstimate,
  DemoOdontogramEntry,
  DemoPatient,
  DemoPrescription,
  DemoToothSurface,
  DemoTreatmentPlan,
} from "@/features/demo/lib/demo-types";

const clinicName = "Sunrise Dental Studio";
const permanentTeeth = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28, 38, 37, 36,
  35, 34, 33, 32, 31, 41, 42, 43, 44, 45, 46, 47, 48,
];
const surfaces: DemoToothSurface[] = [
  "Mesial",
  "Distal",
  "Occlusal",
  "Buccal",
  "Lingual",
];
const findingColors: Record<string, string> = {
  Decay: "bg-red-600",
  Fracture: "bg-red-600",
  Sensitivity: "bg-orange-500",
  Missing: "bg-slate-700",
  Restored: "bg-emerald-600",
  Healthy: "bg-emerald-600",
  Planned: "bg-amber-500",
  "In progress": "bg-blue-600",
  Completed: "bg-emerald-600",
};

type PrintRequest =
  | { kind: "estimate"; id: string }
  | { kind: "prescription"; id: string }
  | null;

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${value}T00:00:00+05:30`));
}

function currency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

function clinicMark() {
  return (
    <span
      aria-label="Sunrise Dental Studio logo"
      className="grid size-12 shrink-0 place-items-center rounded-xl bg-teal-800 text-sm font-bold tracking-wide text-white"
      role="img"
    >
      SD
    </span>
  );
}

export function DemoClinicalWorkflow({
  patient,
  plans,
  onBookAppointment,
  onCreatePlan,
}: Readonly<{
  patient: DemoPatient;
  plans: DemoTreatmentPlan[];
  onBookAppointment: () => void;
  onCreatePlan: () => void;
}>) {
  const { data, updateData } = useDemoData();
  const record = data.clinicalRecords.find(
    (item) => item.patientId === patient.id,
  );
  const [complaint, setComplaint] = useState(record?.chiefComplaint ?? "");
  const [medicalHistory, setMedicalHistory] = useState(
    record?.medicalHistory ?? "",
  );
  const [allergies, setAllergies] = useState(record?.allergies ?? "");
  const [examination, setExamination] = useState(record?.examination ?? "");
  const [diagnosis, setDiagnosis] = useState(record?.dentistDiagnosis ?? "");
  const [recommendations, setRecommendations] = useState(
    record?.recommendations ?? "",
  );
  const [toothNumber, setToothNumber] = useState(16);
  const [finding, setFinding] = useState("Decay");
  const [status, setStatus] =
    useState<DemoOdontogramEntry["status"]>("Finding");
  const [selectedSurfaces, setSelectedSurfaces] = useState<DemoToothSurface[]>(
    [],
  );
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<
    "UPI" | "Cash" | "Card" | "Bank transfer"
  >("UPI");
  const [medicineName, setMedicineName] = useState("");
  const [medicineDosage, setMedicineDosage] = useState("");
  const [medicineRoute, setMedicineRoute] = useState("Oral");
  const [medicineFrequency, setMedicineFrequency] = useState("");
  const [medicineDuration, setMedicineDuration] = useState("");
  const [medicineInstructions, setMedicineInstructions] = useState("");
  const [prescriptionNotes, setPrescriptionNotes] = useState("");
  const [prescriptionAdvice, setPrescriptionAdvice] = useState("");
  const [printRequest, setPrintRequest] = useState<PrintRequest>(null);

  const patientEntries = data.odontogramEntries.filter(
    (entry) => entry.patientId === patient.id,
  );
  const patientPrescriptions = data.prescriptions.filter(
    (item) => item.patientId === patient.id,
  );
  const patientClaims = data.insuranceClaims.filter(
    (item) => item.patientId === patient.id,
  );
  const patientPayments = data.payments.filter(
    (item) => item.patientId === patient.id,
  );
  const selectedEstimate = useMemo(() => {
    if (printRequest?.kind !== "estimate") return null;
    return data.estimates.find((item) => item.id === printRequest.id) ?? null;
  }, [data.estimates, printRequest]);
  const selectedPrescription = useMemo(() => {
    if (printRequest?.kind !== "prescription") return null;
    return (
      data.prescriptions.find((item) => item.id === printRequest.id) ?? null
    );
  }, [data.prescriptions, printRequest]);

  useEffect(() => {
    if (!printRequest) return;
    const handleAfterPrint = () => setPrintRequest(null);
    window.addEventListener("afterprint", handleAfterPrint);
    const timeout = window.setTimeout(() => window.print(), 100);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, [printRequest]);

  useEffect(() => {
    if (!planId && plans[0]) setPlanId(plans[0].id);
  }, [planId, plans]);

  function saveClinicalRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextRecord = {
      id: record?.id ?? newId("clinical"),
      patientId: patient.id,
      chiefComplaint: complaint.trim(),
      medicalHistory: medicalHistory.trim(),
      allergies: allergies.trim(),
      examination: examination.trim(),
      dentistDiagnosis: diagnosis.trim(),
      recommendations: recommendations.trim(),
      createdAt: record?.createdAt ?? new Date().toISOString(),
    };
    updateData((current) => ({
      ...current,
      clinicalRecords: [
        ...current.clinicalRecords.filter(
          (item) => item.patientId !== patient.id,
        ),
        nextRecord,
      ],
    }));
  }

  function saveToothEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entry: DemoOdontogramEntry = {
      id: newId("tooth"),
      patientId: patient.id,
      toothNumber,
      finding: finding.trim(),
      surfaces: selectedSurfaces,
      status,
      createdAt: new Date().toISOString(),
    };
    updateData((current) => ({
      ...current,
      odontogramEntries: [...current.odontogramEntries, entry],
    }));
    setSelectedSurfaces([]);
  }

  function saveEstimate() {
    const plan = plans.find((item) => item.id === planId);
    if (!plan) return;
    const estimate: DemoEstimate = {
      id: newId("estimate"),
      patientId: patient.id,
      planId: plan.id,
      date: todayKey(),
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10),
      items: plan.procedures.map((item) => ({
        description: `${item.name} · ${item.treatmentArea}`,
        amount: item.amount,
      })),
      discount: 0,
      taxRate: 0,
    };
    updateData((current) => ({
      ...current,
      estimates: [...current.estimates, estimate],
    }));
    setPrintRequest({ kind: "estimate", id: estimate.id });
  }

  function savePrescription(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prescription: DemoPrescription = {
      id: newId("rx"),
      patientId: patient.id,
      date: todayKey(),
      dentist: "Dr. Kavya Shah",
      clinicalNotes: prescriptionNotes.trim(),
      medicines: [
        {
          name: medicineName.trim(),
          dosage: medicineDosage.trim(),
          route: medicineRoute,
          frequency: medicineFrequency.trim(),
          duration: medicineDuration.trim(),
          instructions: medicineInstructions.trim(),
        },
      ],
      advice: prescriptionAdvice.trim(),
    };
    updateData((current) => ({
      ...current,
      prescriptions: [...current.prescriptions, prescription],
    }));
    setMedicineName("");
    setMedicineDosage("");
    setMedicineFrequency("");
    setMedicineDuration("");
    setMedicineInstructions("");
    setPrescriptionNotes("");
    setPrescriptionAdvice("");
  }

  function savePayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(paymentAmount);
    if (!planId || !Number.isFinite(amount) || amount <= 0) return;
    updateData((current) => ({
      ...current,
      payments: [
        {
          id: newId("payment"),
          patientId: patient.id,
          planId,
          date: todayKey(),
          amount: Math.round(amount * 100) / 100,
          method: paymentMethod,
        },
        ...current.payments,
      ],
    }));
    setPaymentAmount("");
  }

  const estimates = data.estimates.filter(
    (item) => item.patientId === patient.id,
  );

  return (
    <section
      className="mt-5 space-y-5"
      aria-label="Clinical and treatment workflow"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-100 bg-teal-50 p-4">
        <p className="text-sm text-teal-950">
          Continue the visit workflow for <strong>{patient.name}</strong>.
        </p>
        <button
          className="button-primary"
          onClick={onBookAppointment}
          type="button"
        >
          Book appointment
        </button>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Clinical examination">
          <form className="space-y-3" onSubmit={saveClinicalRecord}>
            <label className="field-label">
              Chief complaint
              <textarea
                className="field-input min-h-20"
                maxLength={2000}
                onChange={(event) => setComplaint(event.target.value)}
                required
                value={complaint}
              />
            </label>
            <label className="field-label">
              Medical history
              <textarea
                className="field-input min-h-16"
                maxLength={4000}
                onChange={(event) => setMedicalHistory(event.target.value)}
                value={medicalHistory}
              />
            </label>
            <label className="field-label">
              Allergies
              <input
                className="field-input"
                maxLength={2000}
                onChange={(event) => setAllergies(event.target.value)}
                value={allergies}
              />
            </label>
            <label className="field-label">
              Clinical examination
              <textarea
                className="field-input min-h-20"
                maxLength={4000}
                onChange={(event) => setExamination(event.target.value)}
                required
                value={examination}
              />
            </label>
            <label className="field-label">
              Dentist-entered diagnosis
              <textarea
                className="field-input min-h-16"
                maxLength={4000}
                onChange={(event) => setDiagnosis(event.target.value)}
                value={diagnosis}
              />
            </label>
            <label className="field-label">
              Treatment recommendations
              <textarea
                className="field-input min-h-16"
                maxLength={4000}
                onChange={(event) => setRecommendations(event.target.value)}
                value={recommendations}
              />
            </label>
            <button className="button-primary" type="submit">
              Save clinical exam
            </button>
            {record ? (
              <p className="text-xs text-slate-500">
                Demo record saved{" "}
                {new Date(record.createdAt).toLocaleString("en-IN")}
              </p>
            ) : null}
          </form>
        </Panel>

        <Panel title="FDI odontogram">
          <p className="mb-3 text-xs leading-5 text-slate-600">
            Select a permanent tooth, mark surfaces and record a dentist-entered
            finding or treatment status. Demo entries save in this browser.
          </p>
          <div
            aria-label="Permanent teeth, FDI numbering"
            className="grid grid-cols-4 gap-1.5 sm:grid-cols-8"
            role="group"
          >
            {permanentTeeth.map((tooth) => {
              const latest = patientEntries.find(
                (entry) => entry.toothNumber === tooth,
              );
              return (
                <button
                  aria-label={`Tooth ${tooth}${latest ? `, ${latest.finding}, ${latest.status}` : ""}`}
                  aria-pressed={toothNumber === tooth}
                  className={`relative min-h-11 rounded-lg border text-sm font-semibold ${
                    toothNumber === tooth
                      ? "border-teal-800 bg-teal-800 text-white"
                      : "border-slate-200 bg-white text-slate-800 hover:bg-teal-50"
                  }`}
                  key={tooth}
                  onClick={() => setToothNumber(tooth)}
                  type="button"
                >
                  {tooth}
                  {latest ? (
                    <span
                      aria-hidden="true"
                      className={`absolute right-1 top-1 size-2 rounded-full ${findingColors[latest.status] ?? findingColors[latest.finding] ?? "bg-amber-500"}`}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate-600">
            Red/orange: findings · amber: planned · blue: in progress · green:
            completed.
          </p>
          <form
            className="mt-4 space-y-3 border-t border-slate-100 pt-4"
            onSubmit={saveToothEntry}
          >
            <p className="text-sm font-semibold">Tooth {toothNumber}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="field-label">
                Finding / treatment
                <input
                  className="field-input"
                  maxLength={160}
                  onChange={(event) => setFinding(event.target.value)}
                  required
                  value={finding}
                />
              </label>
              <label className="field-label">
                Status
                <select
                  className="field-input"
                  onChange={(event) =>
                    setStatus(
                      event.target.value as DemoOdontogramEntry["status"],
                    )
                  }
                  value={status}
                >
                  <option>Finding</option>
                  <option>Planned</option>
                  <option>In progress</option>
                  <option>Completed</option>
                </select>
              </label>
            </div>
            <fieldset>
              <legend className="text-xs font-semibold text-slate-600">
                Surfaces
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {surfaces.map((surface) => (
                  <label
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm"
                    key={surface}
                  >
                    <input
                      checked={selectedSurfaces.includes(surface)}
                      className="size-4 accent-teal-700"
                      onChange={(event) =>
                        setSelectedSurfaces((current) =>
                          event.target.checked
                            ? [...current, surface]
                            : current.filter((value) => value !== surface),
                        )
                      }
                      type="checkbox"
                    />
                    {surface}
                  </label>
                ))}
              </div>
            </fieldset>
            <button className="button-primary" type="submit">
              Save tooth entry
            </button>
          </form>
          {patientEntries.length ? (
            <ul className="mt-4 space-y-2 border-t border-slate-100 pt-3">
              {patientEntries
                .slice()
                .reverse()
                .slice(0, 4)
                .map((entry) => (
                  <li
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                    key={entry.id}
                  >
                    <span>
                      Tooth {entry.toothNumber} · {entry.finding}
                      {entry.surfaces.length
                        ? ` · ${entry.surfaces.join(", ")}`
                        : ""}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                      <span
                        className={`size-2 rounded-full ${findingColors[entry.status] ?? "bg-amber-500"}`}
                      />
                      {entry.status}
                    </span>
                  </li>
                ))}
            </ul>
          ) : null}
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Treatment estimate">
          {plans.length ? (
            <>
              <label className="field-label">
                Treatment plan
                <select
                  className="field-input"
                  onChange={(event) => setPlanId(event.target.value)}
                  value={planId}
                >
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </label>
              {estimates.length ? (
                <ul className="my-3 space-y-2 text-sm">
                  {estimates.map((estimate) => (
                    <li
                      className="flex flex-wrap items-center justify-between gap-2"
                      key={estimate.id}
                    >
                      <span>
                        Estimate · {formatDate(estimate.date)} ·{" "}
                        {currency(
                          estimate.items.reduce(
                            (sum, item) => sum + item.amount,
                            0,
                          ) - estimate.discount,
                        )}
                      </span>
                      <button
                        className="button-secondary"
                        onClick={() =>
                          setPrintRequest({
                            kind: "estimate",
                            id: estimate.id,
                          })
                        }
                        type="button"
                      >
                        Print / Save as PDF
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <button
                className="button-primary mt-3"
                onClick={saveEstimate}
                type="button"
              >
                Create and print estimate
              </button>
            </>
          ) : (
            <div>
              <p className="text-sm text-slate-600">
                Create a treatment plan to prepare a quotation for this patient.
              </p>
              <button
                className="button-primary mt-3"
                onClick={onCreatePlan}
                type="button"
              >
                Create treatment plan
              </button>
            </div>
          )}
        </Panel>

        <Panel title="Prescription">
          <form className="space-y-3" onSubmit={savePrescription}>
            <p className="text-xs leading-5 text-slate-600">
              Documentation only. The dentist enters and confirms every medicine
              and instruction; this demo does not recommend treatment.
            </p>
            <label className="field-label">
              Medicine name
              <input
                className="field-input"
                maxLength={200}
                onChange={(event) => setMedicineName(event.target.value)}
                required
                value={medicineName}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="field-label">
                Dosage
                <input
                  className="field-input"
                  onChange={(event) => setMedicineDosage(event.target.value)}
                  required
                  value={medicineDosage}
                />
              </label>
              <label className="field-label">
                Route
                <select
                  className="field-input"
                  onChange={(event) => setMedicineRoute(event.target.value)}
                  value={medicineRoute}
                >
                  <option>Oral</option>
                  <option>Topical</option>
                  <option>Other</option>
                </select>
              </label>
              <label className="field-label">
                Frequency
                <input
                  className="field-input"
                  onChange={(event) => setMedicineFrequency(event.target.value)}
                  required
                  value={medicineFrequency}
                />
              </label>
              <label className="field-label">
                Duration
                <input
                  className="field-input"
                  onChange={(event) => setMedicineDuration(event.target.value)}
                  required
                  value={medicineDuration}
                />
              </label>
            </div>
            <label className="field-label">
              Instructions
              <input
                className="field-input"
                onChange={(event) =>
                  setMedicineInstructions(event.target.value)
                }
                value={medicineInstructions}
              />
            </label>
            <label className="field-label">
              Clinical notes (optional)
              <textarea
                className="field-input min-h-16"
                onChange={(event) => setPrescriptionNotes(event.target.value)}
                value={prescriptionNotes}
              />
            </label>
            <label className="field-label">
              Additional advice
              <textarea
                className="field-input min-h-16"
                onChange={(event) => setPrescriptionAdvice(event.target.value)}
                value={prescriptionAdvice}
              />
            </label>
            <button className="button-primary" type="submit">
              Save dentist-entered prescription
            </button>
          </form>
          {patientPrescriptions.length ? (
            <ul className="mt-4 space-y-2 border-t border-slate-100 pt-3">
              {patientPrescriptions.map((prescription) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  key={prescription.id}
                >
                  <span>
                    {formatDate(prescription.date)} ·{" "}
                    {prescription.medicines.map((item) => item.name).join(", ")}
                  </span>
                  <button
                    className="button-secondary"
                    onClick={() =>
                      setPrintRequest({
                        kind: "prescription",
                        id: prescription.id,
                      })
                    }
                    type="button"
                  >
                    Print / Save as PDF
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Record payment">
          {plans.length ? (
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={savePayment}>
              <label className="field-label">
                Treatment plan
                <select
                  className="field-input"
                  onChange={(event) => setPlanId(event.target.value)}
                  value={planId}
                >
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Amount (INR)
                <input
                  className="field-input"
                  min="0.01"
                  onChange={(event) => setPaymentAmount(event.target.value)}
                  required
                  step="0.01"
                  type="number"
                  value={paymentAmount}
                />
              </label>
              <label className="field-label">
                Method
                <select
                  className="field-input"
                  onChange={(event) =>
                    setPaymentMethod(event.target.value as typeof paymentMethod)
                  }
                  value={paymentMethod}
                >
                  <option>UPI</option>
                  <option>Cash</option>
                  <option>Card</option>
                  <option>Bank transfer</option>
                </select>
              </label>
              <div className="flex items-end">
                <button className="button-primary" type="submit">
                  Record demo payment
                </button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-slate-600">
              Create a treatment plan before recording a payment.
            </p>
          )}
          {patientPayments.length ? (
            <ul className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-sm">
              {patientPayments.map((payment) => (
                <li className="flex justify-between gap-2" key={payment.id}>
                  <span>
                    {formatDate(payment.date)} · {payment.method}
                  </span>
                  <strong>{currency(payment.amount)}</strong>
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
        <Panel title="Insurance claims">
          {patientClaims.length ? (
            <ul className="space-y-3">
              {patientClaims.map((claim) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm"
                  key={claim.id}
                >
                  <span>
                    <strong className="block">{claim.provider}</strong>
                    <span className="text-xs text-slate-500">
                      {claim.reference}
                    </span>
                  </span>
                  <span className="text-right">
                    <strong className="block">{currency(claim.amount)}</strong>
                    <span className="text-xs text-slate-600">
                      {claim.status}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">
              No sample claims for this patient.
            </p>
          )}
        </Panel>
      </div>

      {selectedEstimate ? (
        <article
          className="hidden print:block"
          id="treatment-estimate-document"
        >
          <header className="flex items-center gap-4 border-b-2 border-teal-800 pb-5">
            {clinicMark()}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">
                Treatment quotation
              </p>
              <h1 className="text-2xl font-bold">{clinicName}</h1>
              <p className="text-sm text-slate-600">+91 98765 43210</p>
            </div>
          </header>
          <h2 className="mt-6 text-xl font-semibold">
            Prepared for {patient.name}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Issued {formatDate(selectedEstimate.date)} · Valid through{" "}
            {formatDate(selectedEstimate.validUntil)}
          </p>
          <table className="mt-6 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-300">
                <th className="py-2">Procedure</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {selectedEstimate.items.map((item, index) => (
                <tr className="border-b border-slate-200" key={index}>
                  <td className="py-3">{item.description}</td>
                  <td className="py-3 text-right">{currency(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-5 text-right text-lg font-bold">
            Total{" "}
            {currency(
              selectedEstimate.items.reduce(
                (sum, item) => sum + item.amount,
                0,
              ) - selectedEstimate.discount,
            )}
          </p>
          <p className="mt-8 border-t border-slate-200 pt-3 text-xs text-slate-500">
            Demo quotation only. This is an estimate, not a receipt or payment
            record.
          </p>
        </article>
      ) : null}
      {selectedPrescription ? (
        <article className="hidden print:block" id="prescription-document">
          <header className="flex items-center gap-4 border-b-2 border-teal-800 pb-5">
            {clinicMark()}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">
                Digital prescription · Demo
              </p>
              <h1 className="text-2xl font-bold">{clinicName}</h1>
              <p className="text-sm text-slate-600">+91 98765 43210</p>
            </div>
          </header>
          <div className="mt-6 grid grid-cols-2 gap-4">
            <p>
              <strong>Patient</strong>
              <br />
              {patient.name}
            </p>
            <p className="text-right">
              <strong>Prescription date</strong>
              <br />
              {formatDate(selectedPrescription.date)}
            </p>
          </div>
          <p className="mt-5">
            <strong>Prescribing dentist:</strong> {selectedPrescription.dentist}
          </p>
          {selectedPrescription.clinicalNotes ? (
            <p className="mt-4 whitespace-pre-wrap">
              <strong>Dentist-entered clinical notes:</strong>{" "}
              {selectedPrescription.clinicalNotes}
            </p>
          ) : null}
          <h2 className="mt-6 text-lg font-semibold">Medicines</h2>
          <ul className="mt-2 space-y-4">
            {selectedPrescription.medicines.map((medicine, index) => (
              <li className="border-b border-slate-200 pb-3" key={index}>
                <strong>{medicine.name}</strong>
                <p className="text-sm">
                  {medicine.dosage} · {medicine.route} · {medicine.frequency} ·{" "}
                  {medicine.duration}
                </p>
                {medicine.instructions ? (
                  <p className="text-sm">{medicine.instructions}</p>
                ) : null}
              </li>
            ))}
          </ul>
          {selectedPrescription.advice ? (
            <p className="mt-5 whitespace-pre-wrap">
              <strong>Additional advice:</strong> {selectedPrescription.advice}
            </p>
          ) : null}
          <footer className="mt-8 border-t border-slate-200 pt-3 text-xs text-slate-500">
            Fictional demo record. The dentist is responsible for reviewing and
            confirming all details.
          </footer>
        </article>
      ) : null}
    </section>
  );
}

function Panel({
  title,
  children,
}: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="mb-4 text-base font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}
