import { updateAutomatedWhatsAppAction } from "@/features/messages/actions";

export function WhatsAppAutomationSettings({
  clinicId,
  enabled,
}: {
  clinicId: string;
  enabled: boolean;
}) {
  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold text-slate-900">
            Automatic appointment reminders
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            {enabled
              ? "Enabled. A configured scheduler sends an approved Meta template about 24 hours before eligible appointments."
              : "Disabled. No messages will be sent automatically for this clinic."}
          </p>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">
            Delivery requires an approved WhatsApp Business template with three
            body parameters in this order: patient name, clinic name, and
            appointment time. Only patients with recorded WhatsApp consent are
            included. Delivery outcomes are recorded in message logs.
          </p>
        </div>
        <form action={updateAutomatedWhatsAppAction}>
          <input name="clinicId" type="hidden" value={clinicId} />
          <input
            name="enabled"
            type="hidden"
            value={enabled ? "false" : "true"}
          />
          <button
            className="h-10 shrink-0 rounded-md border border-slate-300 px-4 text-sm font-medium hover:bg-slate-50"
            type="submit"
          >
            Turn automation {enabled ? "off" : "on"}
          </button>
        </form>
      </div>
    </section>
  );
}
