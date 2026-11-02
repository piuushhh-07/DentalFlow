import { OdontogramDentition, OdontogramSurface } from "@prisma/client";
import { z } from "zod";

import { isValidFdiTooth } from "@/features/odontogram/lib/odontogram-validation";

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

const toothFindingSchema = z
  .object({
    toothNumber: z.coerce.number().int().min(11).max(85).optional(),
    dentition: z.nativeEnum(OdontogramDentition).optional(),
    toothFindingLabel: optionalText(160),
    summary: optionalText(1000),
    surfaces: z.array(z.nativeEnum(OdontogramSurface)).max(7).default([]),
    notes: optionalText(2000),
    relatedOdontogramEntryId: optionalUuid,
  })
  .superRefine((finding, context) => {
    if (
      !finding.relatedOdontogramEntryId &&
      (finding.toothNumber === undefined || finding.dentition === undefined)
    ) {
      return;
    }

    if (
      !finding.relatedOdontogramEntryId &&
      finding.toothNumber !== undefined
    ) {
      if (finding.dentition === undefined) {
        context.addIssue({
          code: "custom",
          message: "Select a dentition for the tooth-specific finding.",
          path: ["dentition"],
        });
        return;
      }

      if (!isValidFdiTooth(finding.dentition, finding.toothNumber)) {
        context.addIssue({
          code: "custom",
          message:
            "Choose a valid FDI tooth number for the selected dentition.",
          path: ["toothNumber"],
        });
      }
    }

    if (finding.relatedOdontogramEntryId && finding.toothNumber !== undefined) {
      if (finding.dentition === undefined) {
        context.addIssue({
          code: "custom",
          message: "Choose a dentition when recording a manual tooth finding.",
          path: ["dentition"],
        });
      }
    }

    if (new Set(finding.surfaces).size !== finding.surfaces.length) {
      context.addIssue({
        code: "custom",
        message: "A tooth surface can only be selected once.",
        path: ["surfaces"],
      });
    }
  });

export const dentalClinicalRecordInputSchema = z.object({
  visitId: optionalUuid,
  medicalHistory: optionalText(4000),
  dentalHistory: optionalText(4000),
  allergies: optionalText(2000),
  chiefComplaints: z.string().trim().min(1).max(2000),
  clinicalExamination: z.string().trim().min(1).max(4000),
  diagnosis: optionalText(2000),
  treatmentRecommendations: optionalText(4000),
  clinicalNotes: optionalText(4000),
  findings: z.array(toothFindingSchema).max(12).default([]),
});

export type DentalClinicalRecordInput = z.infer<
  typeof dentalClinicalRecordInputSchema
>;
