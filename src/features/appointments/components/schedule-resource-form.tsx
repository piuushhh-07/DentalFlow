import { createScheduleResourceAction } from "@/features/appointments/actions";

type ScheduleResourceFormProps = Readonly<{
  clinicId: string;
}>;

const fieldClass =
  "h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-teal-700";

export function ScheduleResourceForm({
  clinicId,
}: ScheduleResourceFormProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[
        { kind: "dentist", label: "Dentist", placeholder: "Dentist name" },
        { kind: "chair", label: "Chair", placeholder: "Chair label" },
      ].map(({ kind, label, placeholder }) => (
        <form
          action={createScheduleResourceAction}
          className="flex items-center gap-2"
          key={kind}
        >
          <input name="clinicId" type="hidden" value={clinicId} />
          <input name="kind" type="hidden" value={kind} />
          <label className="sr-only" htmlFor={`${kind}-name`}>
            {label} name
          </label>
          <input
            className={fieldClass}
            id={`${kind}-name`}
            maxLength={120}
            minLength={2}
            name="name"
            placeholder={placeholder}
            required
          />
          <button
            className="h-10 shrink-0 rounded-md border border-slate-300 px-3 text-sm font-medium hover:bg-slate-50"
            type="submit"
          >
            Add {label.toLowerCase()}
          </button>
        </form>
      ))}
    </div>
  );
}
