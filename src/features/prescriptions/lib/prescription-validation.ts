import { z } from "zod";

const optionalUuid = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().uuid().optional(),
);

const optionalText = (max: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(max).optional(),
  );

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }, "Enter a valid date.");

export const prescriptionMedicineInputSchema = z.object({
  catalogueItemId: optionalUuid,
  medicineName: z.string().trim().min(1, "Enter a medicine name.").max(200),
  dosage: z.string().trim().min(1, "Enter the dosage.").max(160),
  route: z
    .string()
    .trim()
    .min(1, "Enter the route of administration.")
    .max(100),
  frequency: z.string().trim().min(1, "Enter the frequency.").max(160),
  duration: z.string().trim().min(1, "Enter the duration.").max(120),
  quantity: z.string().trim().min(1, "Enter the quantity.").max(100),
  instructions: optionalText(1000),
});

export const createPrescriptionSchema = z
  .object({
    visitId: optionalUuid,
    amendsPrescriptionId: optionalUuid,
    amendmentReason: optionalText(1000),
    prescriptionDate: dateOnly,
    diagnosisNotes: optionalText(4000),
    additionalAdvice: optionalText(4000),
    followUpDate: z.preprocess(
      (value) => (value === "" ? undefined : value),
      dateOnly.optional(),
    ),
    authorRegistrationNumber: optionalText(100),
    authorConfirmed: z.literal(true, {
      error: "Confirm that you reviewed every medicine and instruction.",
    }),
    saveToCatalogue: z.boolean().default(false),
    medicines: z
      .array(prescriptionMedicineInputSchema)
      .min(1, "Add at least one medicine.")
      .max(20, "A prescription can include up to 20 medicines."),
  })
  .superRefine((input, context) => {
    if (input.amendsPrescriptionId && !input.amendmentReason) {
      context.addIssue({
        code: "custom",
        message: "Enter the reason for this prescription amendment.",
        path: ["amendmentReason"],
      });
    }

    if (!input.amendsPrescriptionId && input.amendmentReason) {
      context.addIssue({
        code: "custom",
        message: "An amendment reason requires an original prescription.",
        path: ["amendsPrescriptionId"],
      });
    }

    if (input.followUpDate && input.followUpDate < input.prescriptionDate) {
      context.addIssue({
        code: "custom",
        message: "The follow-up date cannot be before the prescription date.",
        path: ["followUpDate"],
      });
    }
  });

export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>;
