"use client";

import { useFormState } from "react-dom";

import {
  reviewPatientAppointmentCancellationRequest,
  type PatientCancellationActionState,
} from "@/features/appointments/patient-cancellation-actions";

type CancellationRequest = Readonly<{
  id: string;
  reason: string | null;
  createdAt: Date;
  patient: { fullName: string; phoneNumber: string };
  appointment: { scheduledAt: Date; type: string };
}>;

const initialState: PatientCancellationActionState = {};

function ReviewActions({ clinicId, requestId }: { clinicId: string; requestId: string }) {
  const [state, action] = useFormState(reviewPatientAppointmentCancellationRequest, initialState);
  return (
    <form action={action} className="mt-3 space-y-2">
      <input name="clinicId" type="hidden" value={clinicId} />
      <input name="requestId" type="hidden" value={requestId} />
      <label className="block text-xs font-medium text-slate-600">
        Review note (optional)
        <input className="mt-1 min-h-9 w-full rounded-md border border-slate-300 px-3 text-sm" name="reviewerNotes" maxLength={500} />
      </label>
      {state.error && <p className="text-sm text-red-700" role="alert">{state.error}</p>}
      {state.success && <p className="text-sm text-emerald-800" role="status">{state.success}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="min-h-9 rounded-md bg-teal-800 px-3 text-xs font-semibold text-white hover:bg-teal-900" name="decision" value="APPROVED" type="submit">Approve & cancel appointment</button>
        <button className="min-h-9 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50" name="decision" value="REJECTED" type="submit">Decline request</button>
      </div>
    </form>
  );
}

export function PatientCancellationRequestQueue({
  clinicId,
  requests,
}: {
  clinicId: string;
  requests: readonly CancellationRequest[];
}) {
  if (requests.length === 0) return <p className="text-sm text-slate-600">No pending patient cancellation requests.</p>;
  return (
    <ul className="space-y-3">
      {requests.map((request) => (
        <li className="rounded-lg border border-slate-200 p-4" key={request.id}>
          <p className="font-semibold text-slate-900">{request.patient.fullName}</p>
          <p className="mt-1 text-sm text-slate-600">{request.patient.phoneNumber} · {request.appointment.type}</p>
          <p className="mt-1 text-sm text-slate-600">
            {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(request.appointment.scheduledAt)}
          </p>
          {request.reason && <p className="mt-2 text-sm text-slate-700">Reason: {request.reason}</p>}
          <ReviewActions clinicId={clinicId} requestId={request.id} />
        </li>
      ))}
    </ul>
  );
}
