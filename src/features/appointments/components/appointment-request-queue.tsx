"use client";

import { useFormState } from "react-dom";

import {
  approveAppointmentRequestAction,
  rejectAppointmentRequestAction,
  type AppointmentActionState,
} from "@/features/appointments/actions";

type AppointmentRequest = Readonly<{
  id: string;
  patientName: string;
  phoneNumber: string;
  requestedAt: Date;
  notes: string | null;
  dentist: { name: string } | null;
  chair: { label: string } | null;
}>;

const initialState: AppointmentActionState = {};

function RequestActions({
  clinicId,
  requestId,
}: {
  clinicId: string;
  requestId: string;
}) {
  const [approveState, approveAction] = useFormState(
    approveAppointmentRequestAction,
    initialState,
  );
  const [rejectState, rejectAction] = useFormState(
    rejectAppointmentRequestAction,
    initialState,
  );

  return (
    <div className="mt-4">
      {approveState.error && (
        <p className="mb-2 text-sm text-red-700" role="alert">
          {approveState.error}
        </p>
      )}
      {approveState.success && (
        <p className="mb-2 text-sm text-emerald-800" role="status">
          {approveState.success}
        </p>
      )}
      {rejectState.error && (
        <p className="mb-2 text-sm text-red-700" role="alert">
          {rejectState.error}
        </p>
      )}
      {rejectState.success && (
        <p className="mb-2 text-sm text-emerald-800" role="status">
          {rejectState.success}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <form action={approveAction}>
          <input name="clinicId" type="hidden" value={clinicId} />
          <input name="requestId" type="hidden" value={requestId} />
          <button
            className="h-9 rounded-md bg-teal-800 px-3 text-sm font-medium text-white hover:bg-teal-900"
            type="submit"
          >
            Approve and schedule
          </button>
        </form>
        <form action={rejectAction}>
          <input name="clinicId" type="hidden" value={clinicId} />
          <input name="requestId" type="hidden" value={requestId} />
          <button
            className="h-9 rounded-md border border-slate-300 px-3 text-sm font-medium hover:bg-slate-50"
            type="submit"
          >
            Decline
          </button>
        </form>
      </div>
    </div>
  );
}

export function AppointmentRequestQueue({
  clinicId,
  requests,
}: {
  clinicId: string;
  requests: readonly AppointmentRequest[];
}) {
  if (requests.length === 0) {
    return <p className="text-sm text-slate-600">No pending booking requests.</p>;
  }

  return (
    <ul className="space-y-3">
      {requests.map((request) => (
        <li
          className="rounded-lg border border-slate-200 p-4"
          key={request.id}
        >
          <p className="font-semibold text-slate-900">{request.patientName}</p>
          <p className="mt-1 text-sm text-slate-600">
            {request.phoneNumber} ·{" "}
            {new Intl.DateTimeFormat("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Kolkata",
            }).format(request.requestedAt)}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {request.dentist?.name ?? "Dentist"} ·{" "}
            {request.chair?.label ?? "Chair"}
          </p>
          {request.notes && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
              {request.notes}
            </p>
          )}
          <RequestActions clinicId={clinicId} requestId={request.id} />
        </li>
      ))}
    </ul>
  );
}
