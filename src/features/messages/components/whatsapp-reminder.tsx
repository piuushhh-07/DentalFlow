"use client";

import { MessageCircle, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useFormState } from "react-dom";

import {
  recordManuallySentWhatsAppReminder,
  type ManualReminderActionState,
} from "@/features/messages/actions";
import { MessageSubmitButton } from "@/features/messages/components/message-submit-button";
import {
  buildWhatsAppLink,
  InvalidWhatsAppPhoneError,
} from "@/features/messages/lib/whatsapp";
import { renderMessageTemplate } from "@/features/messages/lib/template-validation";

type WhatsAppReminderProps = Readonly<{
  clinicId: string;
  clinicName: string;
  clinicPhone: string;
  patientName: string;
  patientPhone: string;
  hasWhatsAppConsent: boolean;
  kind: "treatment-visit" | "preventive-recall";
  relatedRecordId: string;
  dueDate: string;
  treatmentName: string | null;
  visitNumber: number | null;
  totalVisits: number | null;
  templateId: string | null;
  templateContent: string;
  clientRequestId: string;
}>;

const initialState: ManualReminderActionState = {};

export function WhatsAppReminder({
  clinicId,
  clinicName,
  clinicPhone,
  patientName,
  patientPhone,
  hasWhatsAppConsent,
  kind,
  relatedRecordId,
  dueDate,
  treatmentName,
  visitNumber,
  totalVisits,
  templateId,
  templateContent,
  clientRequestId,
}: WhatsAppReminderProps) {
  const [state, formAction] = useFormState(
    recordManuallySentWhatsAppReminder,
    initialState,
  );
  const templateValues = {
    patient_name: patientName,
    clinic_name: clinicName,
    treatment_name: treatmentName,
    visit_number: visitNumber,
    total_visits: totalVisits,
    due_date: dueDate,
    clinic_phone: clinicPhone || "our clinic",
  };
  const [message, setMessage] = useState(() =>
    renderMessageTemplate(templateContent, templateValues),
  );
  const [opened, setOpened] = useState(false);
  const messageLink = (() => {
    try {
      return buildWhatsAppLink(patientPhone, message);
    } catch (error) {
      if (error instanceof InvalidWhatsAppPhoneError) {
        return null;
      }
      throw error;
    }
  })();

  if (!hasWhatsAppConsent) {
    return (
      <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        WhatsApp reminders are disabled: recorded patient opt-in is required.
      </p>
    );
  }

  if (state.success) {
    return (
      <p
        aria-live="polite"
        className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
        role="status"
      >
        <span className="font-semibold">{state.success}</span>
        {state.recordedAt && (
          <span className="mt-1 block text-xs">
            Recorded{" "}
            {new Intl.DateTimeFormat("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Kolkata",
            }).format(new Date(state.recordedAt))}
          </span>
        )}
      </p>
    );
  }

  return (
    <section
      aria-label="WhatsApp reminder"
      className="mt-4 rounded-lg border border-teal-100 bg-teal-50/50 p-4"
    >
      <div className="flex items-start gap-2">
        <MessageCircle
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-teal-800"
        />
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            WhatsApp reminder
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Opens WhatsApp for you to send manually. DentalFlow cannot verify
            delivery. Keep the message neutral and avoid unnecessary health
            details.
          </p>
        </div>
      </div>

      <label
        className="mt-4 block text-xs font-medium text-slate-700"
        htmlFor={`whatsapp-message-${relatedRecordId}`}
      >
        Editable message
      </label>
      <textarea
        className="mt-1 min-h-24 w-full resize-y rounded-md border border-input bg-white px-3 py-2 text-sm leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        id={`whatsapp-message-${relatedRecordId}`}
        maxLength={2000}
        onChange={(event) => setMessage(event.target.value)}
        value={message}
      />

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        {messageLink ? (
          <a
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#128C7E] px-4 text-sm font-semibold text-white hover:bg-[#0f776b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
            href={messageLink}
            onClick={() => setOpened(true)}
            rel="noopener noreferrer"
            target="_blank"
          >
            <MessageCircle aria-hidden="true" className="size-4" />
            Open WhatsApp chat
          </a>
        ) : (
          <p className="text-sm text-red-700">
            WhatsApp cannot open because this phone number is invalid.
          </p>
        )}
        {!opened && (
          <span className="text-xs text-slate-500">
            Opening the chat does not create a sent-message record.
          </span>
        )}
      </div>
      {opened && (
        <form
          action={formAction}
          className="mt-4 border-t border-teal-100 pt-4"
        >
          <input name="clinicId" type="hidden" value={clinicId} />
          <input name="kind" type="hidden" value={kind} />
          <input name="relatedRecordId" type="hidden" value={relatedRecordId} />
          <input name="clientRequestId" type="hidden" value={clientRequestId} />
          <input name="templateId" type="hidden" value={templateId ?? ""} />
          <input name="message" type="hidden" value={message} />
          <label className="flex cursor-pointer items-start gap-2 text-sm leading-5 text-slate-700">
            <input
              className="mt-0.5 size-4 shrink-0 accent-teal-700"
              name="confirmSent"
              required
              type="checkbox"
              value="on"
            />
            <span>
              I sent this message manually in WhatsApp. This is my confirmation,
              not a WhatsApp-verified delivery receipt.
            </span>
          </label>
          {state.error && (
            <p className="mt-2 text-sm text-red-700" role="alert">
              {state.error}
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <MessageSubmitButton />
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <ShieldCheck aria-hidden="true" className="size-3.5" />
              Manually recorded
            </span>
          </div>
        </form>
      )}
    </section>
  );
}
