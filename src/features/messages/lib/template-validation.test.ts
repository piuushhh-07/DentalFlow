import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  formatTemplateDate,
  renderMessageTemplate,
  templateContentSchema,
  validateTemplateContent,
} from "@/features/messages/lib/template-validation";

describe("WhatsApp template validation and rendering", () => {
  it("substitutes all supported values as plain text", () => {
    const rendered = renderMessageTemplate(
      "{{patient_name}} · {{clinic_name}} · {{treatment_name}} · {{visit_number}}/{{total_visits}} · {{due_date}} · {{clinic_phone}}",
      {
        patient_name: "Asha",
        clinic_name: "DentalFlow",
        treatment_name: "Checkup",
        visit_number: 2,
        total_visits: 3,
        due_date: "15 Oct 2026",
        clinic_phone: "+91 98765 43210",
      },
    );
    assert.equal(
      rendered,
      "Asha · DentalFlow · Checkup · 2/3 · 15 Oct 2026 · +91 98765 43210",
    );
  });

  it("rejects unsupported and incomplete placeholders", () => {
    assert.deepEqual(validateTemplateContent("Hello {{patient_email}}"), [
      "Unsupported placeholder: {{patient_email}}.",
    ]);
    assert.equal(
      templateContentSchema.safeParse("{{patient_name").success,
      false,
    );
    assert.equal(
      templateContentSchema.safeParse("{{ clinic_name }}").success,
      false,
    );
  });

  it("safely substitutes missing values with empty text", () => {
    assert.equal(
      renderMessageTemplate("Visit {{visit_number}}/{{total_visits}}", {
        visit_number: 1,
      }),
      "Visit 1/",
    );
    assert.equal(renderMessageTemplate("Hello {{patient_name}}", {}), "Hello ");
  });

  it("blocks HTML tags and formats dates for Indian users", () => {
    assert.equal(
      templateContentSchema.safeParse("<img src=x onerror=alert(1)>").success,
      false,
    );
    assert.equal(
      formatTemplateDate(new Date("2026-10-15T00:00:00.000Z")),
      "15 Oct 2026",
    );
  });

  it("does not treat inserted HTML-like patient data as executable template markup", () => {
    assert.equal(
      renderMessageTemplate("Hello {{patient_name}}", {
        patient_name: "<img src=x onerror=alert(1)>",
      }),
      "Hello <img src=x onerror=alert(1)>",
    );
  });
});
