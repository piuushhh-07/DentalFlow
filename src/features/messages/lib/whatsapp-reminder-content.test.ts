import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildWhatsAppReminderContent } from "@/features/messages/lib/whatsapp-reminder-content";

describe("WhatsApp automated reminder content", () => {
  it("uses the latest patient and clinic details in the provider parameters and audit snapshot", () => {
    const result = buildWhatsAppReminderContent({
      patientName: "Updated Patient",
      clinicName: "Updated Dental Clinic",
      timeZone: "Asia/Kolkata",
      scheduledAt: new Date("2026-12-01T04:30:00.000Z"),
      templateName: "appointment_reminder",
      templateLanguage: "en",
    });

    assert.deepEqual(result.parameters, [
      "Updated Patient",
      "Updated Dental Clinic",
      result.appointmentTime,
    ]);
    assert.match(result.appointmentTime, /1 Dec 2026/);
    assert.match(result.messageSnapshot, /Updated Patient/);
    assert.match(result.messageSnapshot, /Updated Dental Clinic/);
    assert.match(result.messageSnapshot, /appointment_reminder/);
    assert.match(result.messageSnapshot, /"language":"en"/);
  });

  it("formats the appointment using the clinic's current timezone", () => {
    const scheduledAt = new Date("2026-12-01T04:30:00.000Z");
    const india = buildWhatsAppReminderContent({
      patientName: "Patient",
      clinicName: "Clinic",
      timeZone: "Asia/Kolkata",
      scheduledAt,
      templateName: "reminder",
      templateLanguage: "en",
    });
    const losAngeles = buildWhatsAppReminderContent({
      patientName: "Patient",
      clinicName: "Clinic",
      timeZone: "America/Los_Angeles",
      scheduledAt,
      templateName: "reminder",
      templateLanguage: "en",
    });

    assert.notEqual(india.appointmentTime, losAngeles.appointmentTime);
    assert.match(india.appointmentTime, /1 Dec 2026/);
    assert.match(losAngeles.appointmentTime, /30 Nov 2026/);
  });
});
