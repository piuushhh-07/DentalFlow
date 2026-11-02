import {
  OdontogramDentition,
  OdontogramEntryType,
  OdontogramFinding,
  OdontogramSurface,
  OdontogramTreatmentStatus,
} from "@prisma/client";
import { z } from "zod";

export const permanentToothNumbers = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28, 48, 47, 46,
  45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
] as const;

export const primaryToothNumbers = [
  55, 54, 53, 52, 51, 61, 62, 63, 64, 65, 85, 84, 83, 82, 81, 71, 72, 73, 74,
  75,
] as const;

const permanentToothSet: ReadonlySet<number> = new Set(permanentToothNumbers);
const primaryToothSet: ReadonlySet<number> = new Set(primaryToothNumbers);

export function isValidFdiTooth(
  dentition: OdontogramDentition,
  toothNumber: number,
): boolean {
  return dentition === OdontogramDentition.PERMANENT
    ? permanentToothSet.has(toothNumber)
    : primaryToothSet.has(toothNumber);
}

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

export const odontogramEntrySchema = z
  .object({
    toothNumber: z.coerce.number().int().min(11).max(85),
    dentition: z.nativeEnum(OdontogramDentition),
    entryType: z.nativeEnum(OdontogramEntryType),
    finding: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.nativeEnum(OdontogramFinding).optional(),
    ),
    treatmentName: optionalText(160),
    treatmentStatus: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.nativeEnum(OdontogramTreatmentStatus).optional(),
    ),
    surfaces: z.array(z.nativeEnum(OdontogramSurface)).max(7),
    notes: optionalText(2000),
    treatmentPlanId: optionalUuid,
    supersedesEntryId: optionalUuid,
  })
  .superRefine((entry, context) => {
    if (!isValidFdiTooth(entry.dentition, entry.toothNumber)) {
      context.addIssue({
        code: "custom",
        message: "Choose a valid FDI tooth number for the selected dentition.",
        path: ["toothNumber"],
      });
    }

    if (new Set(entry.surfaces).size !== entry.surfaces.length) {
      context.addIssue({
        code: "custom",
        message: "A tooth surface can only be selected once.",
        path: ["surfaces"],
      });
    }

    if (entry.entryType === OdontogramEntryType.FINDING) {
      if (!entry.finding || entry.treatmentName || entry.treatmentStatus) {
        context.addIssue({
          code: "custom",
          message: "Choose a finding and do not enter treatment details.",
          path: ["finding"],
        });
      }
    } else if (
      entry.finding ||
      !entry.treatmentName ||
      !entry.treatmentStatus
    ) {
      context.addIssue({
        code: "custom",
        message: "Enter a treatment name and status without a finding.",
        path: ["treatmentName"],
      });
    }
  });

export type OdontogramEntryInput = z.infer<typeof odontogramEntrySchema>;
