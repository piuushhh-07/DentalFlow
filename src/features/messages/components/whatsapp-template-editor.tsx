"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";

import {
  saveWhatsAppReminderTemplate,
  type WhatsAppTemplateActionState,
} from "@/features/messages/actions";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_WHATSAPP_TEMPLATE,
  renderMessageTemplate,
  templateVariables,
  type TemplateValues,
} from "@/features/messages/lib/template-validation";

type WhatsAppTemplateEditorProps = Readonly<{
  clinicId: string;
  initialContent: string;
  previewValues?: TemplateValues;
  examplePatientName?: string;
}>;

const initialState: WhatsAppTemplateActionState = {};

export function WhatsAppTemplateEditor({
  clinicId,
  initialContent,
  previewValues,
  examplePatientName,
}: WhatsAppTemplateEditorProps) {
  const [state, formAction] = useFormState(
    saveWhatsAppReminderTemplate,
    initialState,
  );
  const [content, setContent] = useState(initialContent);

  useEffect(() => {
    if (state.resetToDefault) setContent(DEFAULT_WHATSAPP_TEMPLATE);
  }, [state.resetToDefault]);

  const preview = previewValues
    ? renderMessageTemplate(content, previewValues)
    : null;

  return (
    <form action={formAction} className="space-y-6">
      <input name="clinicId" type="hidden" value={clinicId} />
      <label className="block">
        <span className="text-sm font-medium text-slate-800">
          WhatsApp reminder message
        </span>
        <textarea
          className="mt-2 min-h-48 w-full rounded-md border border-input bg-white px-3 py-2 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          maxLength={2000}
          name="content"
          onChange={(event) => setContent(event.target.value)}
          required
          value={content}
        />
      </label>
      <p className="text-xs text-slate-500">
        Plain text only. Templates are limited to 2,000 characters. Avoid
        unnecessary health information.
      </p>

      <section
        aria-label="Supported template variables"
        className="rounded-lg border border-slate-200 bg-slate-50 p-4"
      >
        <h2 className="text-sm font-semibold text-slate-800">
          Supported placeholders
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {templateVariables.map((variable) => (
            <code
              className="rounded bg-white px-2 py-1 text-xs text-teal-900 ring-1 ring-slate-200"
              key={variable}
            >
              {`{{${variable}}}`}
            </code>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          If a value is unavailable for a patient or follow-up, its placeholder
          is replaced with an empty string.
        </p>
      </section>

      {preview !== null && (
        <section
          aria-label="Template preview"
          className="rounded-xl border border-teal-100 bg-teal-50/60 p-4"
        >
          <h2 className="text-sm font-semibold text-slate-900">Live preview</h2>
          <p className="mt-1 text-xs text-slate-600">
            Example patient: {examplePatientName}
          </p>
          <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-white p-4 text-sm leading-6 text-slate-800">
            {preview || "The preview is empty."}
          </p>
        </section>
      )}

      {state.error && (
        <p className="text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="text-sm text-emerald-800" role="status">
          {state.success}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button formNoValidate name="intent" type="submit" value="save">
          Save template
        </Button>
        <Button name="intent" type="submit" value="reset" variant="outline">
          Reset to default
        </Button>
      </div>
    </form>
  );
}
