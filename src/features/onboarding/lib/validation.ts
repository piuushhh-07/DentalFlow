import { z } from "zod";

const indianMobilePhoneSchema = z
  .string()
  .trim()
  .min(10, "Enter a valid 10-digit Indian mobile number.")
  .max(18, "Enter a valid Indian mobile number.")
  .transform((phone) => phone.replace(/[\s()-]/g, ""))
  .transform((phone) => phone.replace(/^0(?=[6-9]\d{9}$)/, ""))
  .transform((phone) => {
    const match = phone.match(/^(?:\+91|91)?([6-9]\d{9})$/);
    return match ? `+91${match[1]}` : phone;
  })
  .pipe(
    z.string().regex(/^\+91[6-9]\d{9}$/, "Enter a valid Indian mobile number."),
  );

const timeZoneSchema = z.string().refine(
  (timeZone) => {
    try {
      new Intl.DateTimeFormat("en-IN", { timeZone });
      return true;
    } catch {
      return false;
    }
  },
  { message: "Choose a valid timezone." },
);

export const clinicOnboardingSchema = z.object({
  name: z.string().trim().min(2).max(160),
  phoneNumber: indianMobilePhoneSchema,
  timeZone: timeZoneSchema.default("Asia/Kolkata"),
  contactEmail: z.preprocess(
    (email) => (typeof email === "string" ? email.trim() || null : email),
    z.string().email().max(254).nullable(),
  ),
  address: z
    .string()
    .trim()
    .max(400)
    .transform((address) => address || null),
});

export type ClinicOnboardingInput = z.output<typeof clinicOnboardingSchema>;

export function normalizeIndianPhoneNumber(phone: string): string | null {
  const result = indianMobilePhoneSchema.safeParse(phone);
  return result.success ? result.data : null;
}
