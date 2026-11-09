"use client";

import { useFormState } from "react-dom";

import {
  createScheduleResourceAction,
  renameScheduleResourceAction,
  setScheduleResourceActiveAction,
  type AppointmentActionState,
} from "@/features/appointments/actions";
import { AppointmentSubmitButton } from "@/features/appointments/components/appointment-submit-button";

type ScheduleResourceFormProps = Readonly<{
  clinicId: string;
  dentists: readonly Readonly<{ id: string; name: string; active: boolean }>[];
  chairs: readonly Readonly<{ id: string; label: string; active: boolean }>[];
}>;

const fieldClass =
  "h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-teal-700";
const initialState: AppointmentActionState = {};

function ResourceRow({
  clinicId,
  kind,
  resourceId,
  name,
  active,
}: Readonly<{
  clinicId: string;
  kind: "dentist" | "chair";
  resourceId: string;
  name: string;
  active: boolean;
}>) {
  const [renameState, renameAction] = useFormState(
    renameScheduleResourceAction,
    initialState,
  );
  const [statusState, statusAction] = useFormState(
    setScheduleResourceActiveAction,
    initialState,
  );
  const state = renameState.error || renameState.success ? renameState : statusState;

  return (
    <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-slate-900">{name}</p>
          <p
            className={`mt-1 text-xs font-semibold ${
              active ? "text-emerald-700" : "text-slate-500"
            }`}
          >
            {active ? "Active" : "Inactive"}
          </p>
        </div>
        <form action={statusAction}>
          <input name="clinicId" type="hidden" value={clinicId} />
          <input name="kind" type="hidden" value={kind} />
          <input name="resourceId" type="hidden" value={resourceId} />
          <input name="active" type="hidden" value={active ? "false" : "true"} />
          <AppointmentSubmitButton
            label={active ? "Deactivate" : "Activate"}
          />
        </form>
      </div>
      <form action={renameAction} className="mt-3 flex items-center gap-2">
        <input name="clinicId" type="hidden" value={clinicId} />
        <input name="kind" type="hidden" value={kind} />
        <input name="resourceId" type="hidden" value={resourceId} />
        <label className="sr-only" htmlFor={`${kind}-${resourceId}-name`}>
          Rename {name}
        </label>
        <input
          className={fieldClass}
          defaultValue={name}
          id={`${kind}-${resourceId}-name`}
          maxLength={120}
          minLength={2}
          name="name"
          required
        />
        <AppointmentSubmitButton label="Rename" />
      </form>
      {state.error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="mt-2 text-sm text-emerald-700" role="status">
          {state.success}
        </p>
      )}
    </article>
  );
}

export function ScheduleResourceForm({
  clinicId,
  dentists,
  chairs,
}: ScheduleResourceFormProps) {
  const [dentistState, dentistAction] = useFormState(
    createScheduleResourceAction,
    initialState,
  );
  const [chairState, chairAction] = useFormState(
    createScheduleResourceAction,
    initialState,
  );

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Dentists</h3>
        <form action={dentistAction} className="mb-3 flex items-center gap-2">
          <input name="clinicId" type="hidden" value={clinicId} />
          <input name="kind" type="hidden" value="dentist" />
          <label className="sr-only" htmlFor="dentist-name">
            Dentist name
          </label>
          <input
            className={fieldClass}
            id="dentist-name"
            maxLength={120}
            minLength={2}
            name="name"
            placeholder="Dentist name"
            required
          />
          <AppointmentSubmitButton label="Add dentist" />
        </form>
        {dentistState.error && <p className="mb-2 text-sm text-red-700">{dentistState.error}</p>}
        {dentistState.success && <p className="mb-2 text-sm text-emerald-700">{dentistState.success}</p>}
        {dentists.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            No dentists configured.
          </p>
        ) : (
          <div className="space-y-2">
            {dentists.map((dentist) => (
              <ResourceRow
                active={dentist.active}
                clinicId={clinicId}
                kind="dentist"
                key={dentist.id}
                name={dentist.name}
                resourceId={dentist.id}
              />
            ))}
          </div>
        )}
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Treatment chairs</h3>
        <form action={chairAction} className="mb-3 flex items-center gap-2">
          <input name="clinicId" type="hidden" value={clinicId} />
          <input name="kind" type="hidden" value="chair" />
          <label className="sr-only" htmlFor="chair-name">
            Chair label
          </label>
          <input
            className={fieldClass}
            id="chair-name"
            maxLength={120}
            minLength={2}
            name="name"
            placeholder="Chair label"
            required
          />
          <AppointmentSubmitButton label="Add chair" />
        </form>
        {chairState.error && <p className="mb-2 text-sm text-red-700">{chairState.error}</p>}
        {chairState.success && <p className="mb-2 text-sm text-emerald-700">{chairState.success}</p>}
        {chairs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            No treatment chairs configured.
          </p>
        ) : (
          <div className="space-y-2">
            {chairs.map((chair) => (
              <ResourceRow
                active={chair.active}
                clinicId={clinicId}
                kind="chair"
                key={chair.id}
                name={chair.label}
                resourceId={chair.id}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
