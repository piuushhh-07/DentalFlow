import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { OdontogramDentition, OdontogramSurface } from "@prisma/client";

import { dentalClinicalRecordInputSchema } from "@/features/clinical-records/lib/clinical-record-validation";

describe("dental clinical records validation", () => {
  it("accepts a valid record with optional tooth findings", () => {
    const parsed = dentalClinicalRecordInputSchema.safeParse({
      visitId: "11111111-1111-4111-8111-111111111111",
      medicalHistory: "No significant medical history",
      dentalHistory: "Previous fillings",
      allergies: "No known allergies",
      chiefComplaints: "Pain on chewing in the upper right area",
      clinicalExamination: "No swelling, mild tenderness with cavity noted.",
      diagnosis: "Caries of upper right first molar",
      treatmentRecommendations: "Restore and review in 6 weeks",
      clinicalNotes: "Patient advised to maintain oral hygiene.",
      findings: [
        {
          toothNumber: 16,
          dentition: OdontogramDentition.PERMANENT,
          toothFindingLabel: "Caries",
          summary: "Occlusal caries with localized tenderness",
          surfaces: [OdontogramSurface.OCCLUSAL],
          notes: "Tooth appears responsive to cold",
          relatedOdontogramEntryId: "11111111-1111-4111-8111-111111111111",
        },
      ],
    });

    assert.equal(parsed.success, true);
  });

  it("requires a complaint and examination summary", () => {
    assert.equal(
      dentalClinicalRecordInputSchema.safeParse({
        chiefComplaints: "",
        clinicalExamination: "",
        findings: [],
      }).success,
      false,
    );
  });

  it("rejects invalid tooth details and duplicate surfaces", () => {
    assert.equal(
      dentalClinicalRecordInputSchema.safeParse({
        chiefComplaints: "Sensitivity",
        clinicalExamination: "Tenderness on exam",
        findings: [
          {
            toothNumber: 19,
            dentition: OdontogramDentition.PERMANENT,
            surfaces: [OdontogramSurface.MESIAL, OdontogramSurface.MESIAL],
          },
        ],
      }).success,
      false,
    );
  });
});
