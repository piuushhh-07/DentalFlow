import { z } from "zod";

import { normalizeIndianPhoneNumber } from "@/features/onboarding/lib/validation";

const indianPhoneSchema = z
  .string()
  .trim()
  .transform((value, context) => {
    const phoneNumber = normalizeIndianPhoneNumber(value);
    if (!phoneNumber) {
      context.addIssue({
        code: "custom",
        message: "Enter a valid Indian mobile number.",
      });
      return z.NEVER;
    }
    return phoneNumber;
  });

export const publicBookingRequestSchema = z.object({
  slug: z.string().trim().min(1).max(180),
  patientName: z.string().trim().min(2).max(160),
  phoneNumber: indianPhoneSchema,
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      return (
        !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
      );
    }, "Choose a valid date."),
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Choose a valid time."),
  dentistId: z.string().uuid(),
  chairId: z.string().uuid(),
  notes: z.string().trim().max(1000).transform((value) => value || null),
  website: z.string().max(0).optional(),
});

export type PublicBookingRequestInput = z.output<
  typeof publicBookingRequestSchema
>;
