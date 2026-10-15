import { z } from "zod";

export const DEFAULT_WHATSAPP_TEMPLATE =
  "Hello {{patient_name}}, this is {{clinic_name}}. This is a reminder about your upcoming visit on {{due_date}}. Please contact us at {{clinic_phone}} if you have any questions. Thank you.";

export const TEMPLATE_NAME = "WhatsApp reminder";

export const templateVariables = [
  "patient_name",
  "clinic_name",
  "treatment_name",
  "visit_number",
  "total_visits",
  "due_date",
  "clinic_phone",
] as const;

export type TemplateVariable = (typeof templateVariables)[number];
export type TemplateValues = Readonly<
  Partial<Record<TemplateVariable, string | number | null | undefined>>
>;

const supportedVariables = new Set<string>(templateVariables);

function isTemplateVariable(value: string): value is TemplateVariable {
  return supportedVariables.has(value);
}

export function validateTemplateContent(content: string): string[] {
  const errors: string[] = [];
  const withoutPlaceholders = content.replace(/\{\{[^{}]*\}\}/g, "");

  if (/[{}]/.test(withoutPlaceholders)) {
    errors.push("Use complete placeholders in the form {{patient_name}}.");
  }

  for (const [, variable] of Array.from(
    content.matchAll(/\{\{([^{}]*)\}\}/g),
  )) {
    if (!supportedVariables.has(variable)) {
      errors.push(`Unsupported placeholder: {{${variable}}}.`);
    }
  }

  if (/<\s*\/?\s*[a-z][^>]*>/i.test(content)) {
    errors.push("HTML tags are not supported; templates are plain text only.");
  }

  return Array.from(new Set(errors));
}

export const templateContentSchema = z
  .string()
  .trim()
  .min(1, "Enter a template message.")
  .max(2000, "Templates must be 2,000 characters or fewer.")
  .superRefine((content, context) => {
    for (const message of validateTemplateContent(content)) {
      context.addIssue({ code: "custom", message });
    }
  });

export function renderMessageTemplate(
  content: string,
  values: TemplateValues,
): string {
  return content.replace(/\{\{([^{}]*)\}\}/g, (_match, variable: string) => {
    if (!isTemplateVariable(variable)) return "";
    const value = values[variable];
    return value === null || value === undefined ? "" : String(value);
  });
}

export function formatTemplateDate(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(date);
}
