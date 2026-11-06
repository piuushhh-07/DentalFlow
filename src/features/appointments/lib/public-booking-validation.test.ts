import assert from "node:assert/strict";
import test from "node:test";

import { publicBookingRequestSchema } from "@/features/appointments/lib/public-booking-validation";

test("validates and normalizes a public booking request", () => {
  const parsed = publicBookingRequestSchema.safeParse({
    slug: "bright-smile-1234",
    patientName: "  Asha Patel ",
    phoneNumber: "09876-543210",
    date: "2026-11-10",
    time: "09:30",
    dentistId: "20000000-0000-4000-8000-000000000002",
    chairId: "20000000-0000-4000-8000-000000000003",
    notes: "  Please call before confirming ",
    website: "",
  });

  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.patientName, "Asha Patel");
  assert.equal(parsed.data.phoneNumber, "+919876543210");
  assert.equal(parsed.data.notes, "Please call before confirming");
});

test("rejects malformed or bot-filled public booking requests", () => {
  const invalid = publicBookingRequestSchema.safeParse({
    slug: "bright-smile",
    patientName: "Asha Patel",
    phoneNumber: "12345",
    date: "2026-02-31",
    time: "29:00",
    dentistId: "not-an-id",
    chairId: "not-an-id",
    notes: "",
    website: "spam",
  });

  assert.equal(invalid.success, false);
});
