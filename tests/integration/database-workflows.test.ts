import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import {
  InsuranceClaimStatus,
  InsuranceClaimType,
  InsuranceDocumentType,
  InsurancePreAuthorizationStatus,
  AppointmentStatus,
  BillingInterval,
  BillingPaymentStatus,
  BillingSubscriptionStatus,
  ClinicRole,
  OdontogramDentition,
  OdontogramEntryType,
  OdontogramFinding,
  OdontogramSurface,
  OdontogramTreatmentStatus,
  PreventiveRecallStatus,
  PreventiveRecallType,
  TreatmentEstimateStatus,
  TreatmentType,
  TreatmentVisitStatus,
  PrismaClient,
} from "@prisma/client";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AppointmentConflictError,
  AppointmentPatientNotFoundError,
  AppointmentVisitAlreadyScheduledError,
  AppointmentVisitNotFoundError,
  createClinicAppointment,
  countClinicAppointments,
  listClinicAppointments,
  updateClinicAppointment,
  updateClinicAppointmentStatus,
} from "@/features/appointments/lib/appointment-repository";
import { createAppointmentSchema } from "@/features/appointments/lib/appointment-validation";
import {
  createClinicPatient,
  deleteClinicPatient,
  getClinicPatient,
  updateClinicPatient,
} from "@/features/patients/lib/patient-repository";
import {
  createPatientOdontogramEntry,
  OdontogramCorrectionNotFoundError,
  OdontogramPatientNotFoundError,
} from "@/features/odontogram/lib/odontogram-repository";
import { odontogramEntrySchema } from "@/features/odontogram/lib/odontogram-validation";
import {
  createDentalClinicalRecord,
  DentalClinicalRecordPatientNotFoundError,
} from "@/features/clinical-records/lib/clinical-record-repository";
import { dentalClinicalRecordInputSchema } from "@/features/clinical-records/lib/clinical-record-validation";
import {
  authorizeClinicMembership,
  ClinicAccessDeniedError,
  authorizeClinicRole,
  ClinicRoleDeniedError,
} from "@/features/auth/lib/authorization";
import { patientInputSchema } from "@/features/patients/lib/patient-validation";
import {
  createClinicTreatmentPlan,
  getClinicTreatmentPlan,
  TreatmentPatientNotFoundError,
  TreatmentVisitTransitionError,
  updateClinicTreatmentVisitStatus,
} from "@/features/treatments/lib/treatment-repository";
import { createTreatmentPlanSchema } from "@/features/treatments/lib/treatment-validation";
import {
  createClinicRecall,
  getClinicRecall,
  RecallPatientNotFoundError,
  updateClinicRecallStatus,
} from "@/features/recalls/lib/recall-repository";
import { getClinicToday } from "@/features/follow-ups/lib/follow-up-validation";
import { isDuplicateActiveRecall } from "@/features/recalls/lib/recall-validation";
import { listFollowUpQueue } from "@/features/follow-ups/lib/follow-up-repository";
import { WhatsAppConsentRequiredError } from "@/features/messages/lib/whatsapp";
import {
  recordManualWhatsAppReminder,
  ReminderIdempotencyConflictError,
  ReminderRecordNotFoundError,
} from "@/features/messages/lib/message-repository";
import {
  createInsuranceClaim,
  createInsuranceDocumentRequirement,
  createInsurancePolicy,
  createInsurancePayment,
  createInsurancePreAuthorization,
  createInsuranceProvider,
  authorizeInsuranceDocumentUpload,
  completeInsuranceDocumentStorageCleanup,
  getInsuranceClaim,
  getInsuranceDashboard,
  InsuranceRecordNotFoundError,
  InsuranceValidationError,
  registerInsuranceDocumentUpload,
  updateInsuranceClaimStatus,
  updateInsuranceDocumentStatus,
  updateInsurancePreAuthorizationStatus,
} from "@/features/insurance/lib/insurance-repository";
import {
  claimInputSchema,
  policyInputSchema,
  providerInputSchema,
} from "@/features/insurance/lib/insurance-validation";
import {
  createTreatmentPlanFinancialEntry,
  getClinicTreatmentFinanceSummary,
  getTreatmentPaymentReceipt,
  listClinicTreatmentCatalogue,
  saveClinicTreatmentCatalogueItem,
  updateTreatmentPlanFinance,
} from "@/features/treatments/lib/treatment-finance";
import {
  treatmentCatalogueItemSchema,
  treatmentFinancialEntrySchema,
  treatmentPlanFinanceSchema,
} from "@/features/treatments/lib/treatment-finance-validation";
import { getClinicReportMetrics } from "@/features/reports/lib/report-repository";
import { getClinicReportDateRange } from "@/features/reports/lib/report-validation";
import { createSupabaseTestClient } from "./test-supabase-client";
import { getClinicBillingPortalData } from "@/features/billing/lib/billing-repository";
import { processRazorpayWebhook } from "@/features/billing/lib/razorpay-webhook";
import { BillingLimitReachedError } from "@/features/billing/lib/billing-entitlements";
import {
  createDigitalPrescription,
  listClinicPrescriptionMedicineCatalogue,
  listPatientPrescriptions,
  PrescriptionAlreadyAmendedError,
  PrescriptionPatientNotFoundError,
  PrescriptionVisitNotFoundError,
} from "@/features/prescriptions/lib/prescription-repository";
import { createPrescriptionSchema } from "@/features/prescriptions/lib/prescription-validation";
import {
  TreatmentEstimateActorNotAuthorizedError,
  createTreatmentEstimate,
  getClinicTreatmentEstimate,
  listPatientTreatmentEstimates,
  TreatmentEstimateProcedureError,
  TreatmentEstimateSourceNotFoundError,
  TreatmentEstimateTransitionError,
  transitionTreatmentEstimate,
} from "@/features/estimates/lib/estimate-repository";
import { createTreatmentEstimateSchema } from "@/features/estimates/lib/estimate-validation";

if (
  process.env.DENTALFLOW_INTEGRATION_RUNNER !==
  "verified-disposable-supabase-target"
) {
  throw new Error(
    "Run database integration tests only through `npm run test:integration`.",
  );
}

const prisma = new PrismaClient();
const freshReader = new PrismaClient();
const marker = `DentalFlow integration ${randomUUID()}`;
const uploadedStoragePaths: string[] = [];
const uploadedStoragePathsB: string[] = [];
let userAId: string;
let userBId: string;
let clinicAId: string;
let clinicBId: string;
let supabaseA: SupabaseClient;
let supabaseB: SupabaseClient;

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing integration-test setting ${name}.`);
  return value;
}

function syntheticPhone(): string {
  return `+919${randomInt(100_000_000, 999_999_999)}`;
}

function subscriptionWebhookBody(
  eventType: string,
  providerSubscriptionId: string,
  status: string,
  createdAt: Date,
  payment?: {
    id: string;
    status: string;
    errorCode?: string;
  },
  notesClinicId?: string,
): string {
  return JSON.stringify({
    entity: "event",
    event: eventType,
    created_at: Math.floor(createdAt.getTime() / 1000),
    payload: {
      subscription: {
        entity: {
          id: providerSubscriptionId,
          status,
          customer_id: `cust_${randomUUID().replaceAll("-", "")}`,
          current_start: Math.floor(createdAt.getTime() / 1000),
          current_end: Math.floor(createdAt.getTime() / 1000) + 2_592_000,
          notes: notesClinicId ? { clinic_id: notesClinicId } : {},
        },
      },
      ...(payment
        ? {
            payment: {
              entity: {
                id: payment.id,
                status: payment.status,
                amount: 50000,
                currency: "INR",
                error_code: payment.errorCode ?? null,
                invoice_id: `inv_${randomUUID().replaceAll("-", "")}`,
                created_at: Math.floor(createdAt.getTime() / 1000),
              },
            },
          }
        : {}),
    },
  });
}

function safePrismaErrorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    /^P\d{4}$/.test(error.code)
  ) {
    return error.code;
  }
  return undefined;
}

async function signInTestUser(
  supabase: SupabaseClient,
  email: string,
  password: string,
): Promise<string> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    throw new Error(
      "A synthetic Supabase Auth test account could not sign in.",
    );
  }
  return data.user.id;
}

async function createClinicFixture(userId: string, name: string) {
  await prisma.userProfile.upsert({
    where: { id: userId },
    update: { displayName: name },
    create: { id: userId, displayName: name },
  });
  const clinic = await prisma.clinic.create({
    data: {
      name,
      publicBookingSlug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${randomUUID().slice(0, 8)}`,
      timeZone: "Asia/Kolkata",
      memberships: {
        create: { userId, role: "OWNER" },
      },
    },
    select: { id: true },
  });
  return clinic.id;
}

async function uploadAndVerifyInsuranceDocument(
  claimId: string,
  documentId: string,
): Promise<string> {
  const storagePath = `${clinicAId}/${claimId}/${documentId}/${randomUUID()}.pdf`;
  uploadedStoragePaths.push(storagePath);
  await authorizeInsuranceDocumentUpload(
    clinicAId,
    claimId,
    documentId,
    storagePath,
  );
  await uploadInsuranceStorageObject(supabaseA, storagePath);
  await registerInsuranceDocumentUpload(
    clinicAId,
    userAId,
    claimId,
    documentId,
    storagePath,
  );
  await updateInsuranceDocumentStatus(clinicAId, userAId, claimId, documentId, {
    status: "VERIFIED",
    rejectionReason: null,
  });
  return storagePath;
}

async function uploadInsuranceStorageObject(
  client: SupabaseClient,
  storagePath: string,
): Promise<void> {
  const { error: uploadError } = await client.storage
    .from("dentalflow-insurance-private")
    .upload(
      storagePath,
      new Blob(["%PDF-1.4\n% synthetic test fixture\n%%EOF"], {
        type: "application/pdf",
      }),
      { contentType: "application/pdf", upsert: false },
    );
  assert.equal(
    uploadError,
    null,
    "Synthetic file upload must pass the clinic Storage policy.",
  );
}

before(async () => {
  const supabaseUrl = env("DENTALFLOW_TEST_SUPABASE_URL");
  const anonKey = env("DENTALFLOW_TEST_SUPABASE_ANON_KEY");
  const clientOptions = {
    auth: { autoRefreshToken: false, persistSession: false },
  };
  supabaseA = createSupabaseTestClient(supabaseUrl, anonKey, clientOptions);
  supabaseB = createSupabaseTestClient(supabaseUrl, anonKey, clientOptions);
  [userAId, userBId] = await Promise.all([
    signInTestUser(
      supabaseA,
      env("DENTALFLOW_TEST_USER_A_EMAIL"),
      env("DENTALFLOW_TEST_USER_A_PASSWORD"),
    ),
    signInTestUser(
      supabaseB,
      env("DENTALFLOW_TEST_USER_B_EMAIL"),
      env("DENTALFLOW_TEST_USER_B_PASSWORD"),
    ),
  ]);
  assert.notEqual(
    userAId,
    userBId,
    "The two synthetic Auth users must differ.",
  );
  clinicAId = await createClinicFixture(userAId, `${marker} A`);
  clinicBId = await createClinicFixture(userBId, `${marker} B`);
});

after(async () => {
  const cleanupErrors: string[] = [];
  if (uploadedStoragePaths.length > 0 && supabaseA) {
    const { error } = await supabaseA.storage
      .from("dentalflow-insurance-private")
      .remove(uploadedStoragePaths);
    if (error)
      cleanupErrors.push("Could not remove the synthetic private test file.");
  }
  if (uploadedStoragePathsB.length > 0 && supabaseB) {
    const { error } = await supabaseB.storage
      .from("dentalflow-insurance-private")
      .remove(uploadedStoragePathsB);
    if (error)
      cleanupErrors.push(
        "Could not remove the clinic B synthetic private test file.",
      );
  }
  await freshReader.$disconnect();
  await prisma.$disconnect();
  if (cleanupErrors.length > 0) {
    throw new Error(cleanupErrors.join(" "));
  }
});

test("existing clinic workflows persist and enforce tenant boundaries", async (t) => {
  const patientInput = patientInputSchema.parse({
    fullName: `${marker} Patient A`,
    phoneNumber: syntheticPhone(),
    whatsappOptIn: true,
    notes: "Synthetic integration-test record.",
  });
  const patientA = await createClinicPatient(clinicAId, patientInput);
  const persistedPatientA = await freshReader.patient.findFirst({
    where: { id: patientA.id, clinicId: clinicAId },
  });
  assert.ok(persistedPatientA);
  assert.equal(persistedPatientA.fullName, patientInput.fullName);

  const planInput = createTreatmentPlanSchema.parse({
    type: TreatmentType.ROOT_CANAL,
    customName: "",
    notes: "Synthetic treatment plan.",
    totalVisits: 2,
    dueDates: ["2099-01-10", "2099-02-10"],
  });

  await t.test(
    "prescriptions preserve clinic scope, visit links, history, and amendments",
    async () => {
      const clinicAPlan = await createClinicTreatmentPlan(
        clinicAId,
        patientA.id,
        createTreatmentPlanSchema.parse({
          type: TreatmentType.CUSTOM,
          customName: "Synthetic prescription visit plan",
          notes: "",
          totalVisits: 1,
          dueDates: ["2099-01-10"],
        }),
      );
      assert.equal(
        await deleteClinicPatient(clinicAId, patientA.id),
        false,
        "A patient with a treatment plan must be retained.",
      );
      assert.ok(
        await freshReader.patient.findFirst({
          where: { id: patientA.id, clinicId: clinicAId },
          select: { id: true },
        }),
        "The patient and linked treatment history must remain intact.",
      );
      const clinicAPlanWithVisits = await getClinicTreatmentPlan(
        clinicAId,
        patientA.id,
        clinicAPlan.id,
      );
      const clinicBPatient = await createClinicPatient(
        clinicBId,
        patientInputSchema.parse({
          fullName: `${marker} Prescription Patient B`,
          phoneNumber: syntheticPhone(),
          whatsappOptIn: false,
          notes: "",
        }),
      );
      const clinicBPlan = await createClinicTreatmentPlan(
        clinicBId,
        clinicBPatient.id,
        createTreatmentPlanSchema.parse({
          type: TreatmentType.CUSTOM,
          customName: "Synthetic other-clinic visit plan",
          notes: "",
          totalVisits: 1,
          dueDates: ["2099-01-11"],
        }),
      );
      const clinicBPlanWithVisits = await getClinicTreatmentPlan(
        clinicBId,
        clinicBPatient.id,
        clinicBPlan.id,
      );
      const clinicAVisit = clinicAPlanWithVisits?.visits[0];
      const clinicBVisit = clinicBPlanWithVisits?.visits[0];
      assert.ok(clinicAVisit);
      assert.ok(clinicBVisit);
      const input = createPrescriptionSchema.parse({
        visitId: clinicAVisit.id,
        prescriptionDate: "2026-11-02",
        followUpDate: "2026-11-12",
        diagnosisNotes: "Synthetic dentist-entered clinical note.",
        additionalAdvice: "Synthetic dentist-entered advice.",
        authorRegistrationNumber: "SYNTHETIC-REG-1",
        authorConfirmed: true,
        saveToCatalogue: true,
        medicines: [
          {
            medicineName: "Synthetic medicine one",
            dosage: "One unit",
            route: "Oral",
            frequency: "As directed",
            duration: "Three days",
            quantity: "3 tablets",
            instructions: "Synthetic instructions.",
          },
          {
            medicineName: "Synthetic medicine two",
            dosage: "One unit",
            route: "Topical",
            frequency: "Once daily",
            duration: "Five days",
            quantity: "1 tube",
            instructions: "",
          },
        ],
      });

      const original = await createDigitalPrescription(
        clinicAId,
        patientA.id,
        userAId,
        input,
      );
      const originalHistory = await listPatientPrescriptions(
        clinicAId,
        patientA.id,
      );
      assert.equal(originalHistory.length, 1);
      assert.equal(originalHistory[0].medicines.length, 2);
      assert.equal(originalHistory[0].visitId, clinicAVisit.id);
      assert.equal(originalHistory[0].authorUserId, userAId);
      assert.equal(originalHistory[0].audits[0].action, "CREATED");
      await assert.rejects(
        prisma.digitalPrescription.update({
          where: { id: original.id },
          data: { diagnosisNotes: "Attempted overwrite must be rejected." },
        }),
      );
      await assert.rejects(
        prisma.digitalPrescriptionMedicine.create({
          data: {
            clinicId: clinicAId,
            patientId: patientA.id,
            prescriptionId: original.id,
            position: 2,
            medicineName: "Unapproved extra row",
            dosage: "One unit",
            route: "Oral",
            frequency: "Once",
            duration: "One day",
            quantity: "1",
          },
        }),
      );

      const catalogue =
        await listClinicPrescriptionMedicineCatalogue(clinicAId);
      const catalogueItem = catalogue.find(
        (item) => item.name === "Synthetic medicine one",
      );
      assert.ok(catalogueItem, "Manually entered medicine is reusable.");

      await assert.rejects(
        createDigitalPrescription(clinicAId, patientA.id, userAId, {
          ...input,
          visitId: clinicBVisit.id,
        }),
        PrescriptionVisitNotFoundError,
      );
      await assert.rejects(
        createDigitalPrescription(clinicAId, clinicBPatient.id, userAId, input),
        PrescriptionPatientNotFoundError,
      );
      await assert.rejects(
        createDigitalPrescription(clinicBId, clinicBPatient.id, userAId, {
          ...input,
          visitId: clinicBVisit.id,
        }),
        PrescriptionPatientNotFoundError,
      );

      const correctionInput = createPrescriptionSchema.parse({
        ...input,
        visitId: clinicAVisit.id,
        amendsPrescriptionId: original.id,
        amendmentReason: "Correcting the synthetic test record.",
        medicines: [
          {
            ...input.medicines[0],
            catalogueItemId: catalogueItem.id,
          },
        ],
      });
      const correction = await createDigitalPrescription(
        clinicAId,
        patientA.id,
        userAId,
        correctionInput,
      );
      const historyAfterCorrection = await listPatientPrescriptions(
        clinicAId,
        patientA.id,
      );
      assert.equal(historyAfterCorrection.length, 2);
      assert.equal(
        historyAfterCorrection.find((record) => record.id === original.id)
          ?.medicines.length,
        2,
        "Creating a correction must preserve the original prescription.",
      );
      assert.equal(
        historyAfterCorrection.find((record) => record.id === correction.id)
          ?.amendsPrescriptionId,
        original.id,
      );
      assert.equal(
        historyAfterCorrection.find((record) => record.id === correction.id)
          ?.audits[0].action,
        "AMENDED",
      );
      await assert.rejects(
        createDigitalPrescription(clinicAId, patientA.id, userAId, {
          ...correctionInput,
          medicines: input.medicines,
        }),
        PrescriptionAlreadyAmendedError,
      );
    },
  );

  await t.test(
    "treatment estimates enforce tenant scope, audit statuses, preserve versions, and avoid ledger entries",
    async () => {
      const clinicBPatient = await createClinicPatient(
        clinicBId,
        patientInputSchema.parse({
          fullName: `${marker} Estimate Patient B`,
          phoneNumber: syntheticPhone(),
          whatsappOptIn: false,
          notes: "",
        }),
      );
      const clinicAPlan = await createClinicTreatmentPlan(
        clinicAId,
        patientA.id,
        createTreatmentPlanSchema.parse({
          type: TreatmentType.CUSTOM,
          customName: "Synthetic estimate plan A",
          notes: "",
          totalVisits: 1,
          dueDates: ["2099-03-10"],
        }),
      );
      const clinicBPlan = await createClinicTreatmentPlan(
        clinicBId,
        clinicBPatient.id,
        createTreatmentPlanSchema.parse({
          type: TreatmentType.CUSTOM,
          customName: "Synthetic estimate plan B",
          notes: "",
          totalVisits: 1,
          dueDates: ["2099-03-11"],
        }),
      );
      const procedureA = await prisma.treatmentCatalogueItem.create({
        data: {
          clinicId: clinicAId,
          name: `${marker} estimate procedure A`,
          description: "Synthetic procedure description.",
          defaultPrice: "1250.00",
        },
      });
      const procedureB = await prisma.treatmentCatalogueItem.create({
        data: {
          clinicId: clinicBId,
          name: `${marker} estimate procedure B`,
          defaultPrice: "100.00",
        },
      });
      const input = createTreatmentEstimateSchema.parse({
        estimateDate: "2026-11-02",
        validityDate: "2099-12-31",
        discountAmount: "100.00",
        taxRate: "18.00",
        dentistRegistrationNumber: "SYNTHETIC-DENTIST-1",
        notes: "Synthetic estimate notes.",
        terms: "Synthetic validity terms.",
        lines: [
          {
            catalogueItemId: procedureA.id,
            description: "Custom quote description",
            quantity: 2,
            unitPrice: "1250.00",
          },
          {
            catalogueItemId: "",
            description: "Additional manually entered procedure",
            quantity: 1,
            unitPrice: "500.00",
          },
        ],
      });
      const clinicBEstimateInput = createTreatmentEstimateSchema.parse({
        ...input,
        lines: [
          {
            catalogueItemId: procedureB.id,
            description: "Synthetic clinic B procedure",
            quantity: 1,
            unitPrice: "100.00",
          },
        ],
        discountAmount: "0",
        taxRate: "0",
      });
      const clinicBEstimate = await createTreatmentEstimate(
        clinicBId,
        clinicBPatient.id,
        userBId,
        clinicBPlan.id,
        clinicBEstimateInput,
      );
      await assert.rejects(
        transitionTreatmentEstimate(
          clinicBId,
          clinicBPatient.id,
          clinicBEstimate.id,
          userAId,
          TreatmentEstimateStatus.SENT,
        ),
        TreatmentEstimateActorNotAuthorizedError,
      );

      const estimate = await createTreatmentEstimate(
        clinicAId,
        patientA.id,
        userAId,
        clinicAPlan.id,
        input,
      );
      const history = await listPatientTreatmentEstimates(
        clinicAId,
        patientA.id,
      );
      assert.equal(history.length, 1);
      assert.equal(history[0].subtotal.toFixed(2), "3000.00");
      assert.equal(history[0].discountAmount.toFixed(2), "100.00");
      assert.equal(history[0].taxAmount.toFixed(2), "522.00");
      assert.equal(history[0].totalAmount.toFixed(2), "3422.00");
      assert.equal(history[0].createdBy.user.displayName, `${marker} A`);

      await assert.rejects(
        createTreatmentEstimate(
          clinicAId,
          patientA.id,
          userAId,
          clinicAPlan.id,
          createTreatmentEstimateSchema.parse({
            ...input,
            lines: [
              {
                catalogueItemId: procedureB.id,
                description: "Cross-clinic procedure",
                quantity: 1,
                unitPrice: "100.00",
              },
            ],
            discountAmount: "0",
            taxRate: "0",
          }),
        ),
        TreatmentEstimateProcedureError,
      );
      await assert.rejects(
        createTreatmentEstimate(
          clinicAId,
          clinicBPatient.id,
          userAId,
          clinicBPlan.id,
          input,
        ),
        TreatmentEstimateSourceNotFoundError,
      );
      await assert.rejects(
        createTreatmentEstimate(
          clinicBId,
          clinicBPatient.id,
          userAId,
          clinicBPlan.id,
          input,
        ),
        TreatmentEstimateSourceNotFoundError,
      );
      assert.equal(
        await getClinicTreatmentEstimate(clinicBId, patientA.id, estimate.id),
        null,
      );

      await transitionTreatmentEstimate(
        clinicAId,
        patientA.id,
        estimate.id,
        userAId,
        TreatmentEstimateStatus.SENT,
      );
      await assert.rejects(
        transitionTreatmentEstimate(
          clinicAId,
          patientA.id,
          estimate.id,
          userAId,
          TreatmentEstimateStatus.CONVERTED,
        ),
        TreatmentEstimateTransitionError,
      );
      await transitionTreatmentEstimate(
        clinicAId,
        patientA.id,
        estimate.id,
        userAId,
        TreatmentEstimateStatus.ACCEPTED,
        "Patient accepted synthetic quotation.",
      );
      const financialEntriesBefore = await prisma.treatmentFinancialEntry.count(
        {
          where: {
            clinicId: clinicAId,
            patientId: patientA.id,
            treatmentPlanId: clinicAPlan.id,
          },
        },
      );
      await transitionTreatmentEstimate(
        clinicAId,
        patientA.id,
        estimate.id,
        userAId,
        TreatmentEstimateStatus.CONVERTED,
      );
      const financialEntriesAfter = await prisma.treatmentFinancialEntry.count({
        where: {
          clinicId: clinicAId,
          patientId: patientA.id,
          treatmentPlanId: clinicAPlan.id,
        },
      });
      assert.equal(financialEntriesAfter, financialEntriesBefore);

      const revisionInput = createTreatmentEstimateSchema.parse({
        ...input,
        revisionOfEstimateId: estimate.id,
        revisionReason: "Updated synthetic procedure pricing.",
        discountAmount: "0.00",
        lines: [
          {
            catalogueItemId: "",
            description: "Revised synthetic procedure",
            quantity: 1,
            unitPrice: "2200.00",
          },
        ],
      });
      const revision = await createTreatmentEstimate(
        clinicAId,
        patientA.id,
        userAId,
        clinicAPlan.id,
        revisionInput,
      );
      const revisedHistory = await listPatientTreatmentEstimates(
        clinicAId,
        patientA.id,
      );
      const revisedEstimateDetails = await getClinicTreatmentEstimate(
        clinicAId,
        patientA.id,
        revision.id,
      );
      assert.equal(revisedHistory.length, 2);
      assert.equal(
        revisedHistory.find((record) => record.id === estimate.id)?.status,
        TreatmentEstimateStatus.CONVERTED,
        "A revision must not mutate the accepted historical quotation.",
      );
      assert.equal(
        revisedHistory.find((record) => record.id === revision.id)?.version,
        2,
      );
      assert.equal(revisedEstimateDetails?.audits[0].action, "REVISED");
      await assert.rejects(
        prisma.treatmentEstimate.update({
          where: { id: estimate.id },
          data: { totalAmount: "0.00" },
        }),
      );
      await assert.rejects(
        prisma.treatmentEstimateLine.updateMany({
          where: { estimateId: estimate.id },
          data: { description: "Overwritten historical line" },
        }),
      );
    },
  );

  await t.test(
    "billing webhooks are idempotent, ordered, and scoped to their clinic",
    async () => {
      const billingPlan = await prisma.billingPlanVersion.create({
        data: {
          code: `integration-${randomUUID()}`,
          version: 1,
          displayName: `${marker} Billing Plan`,
          currency: "INR",
          amountMinor: 50000,
          interval: BillingInterval.MONTH,
          intervalCount: 1,
          totalBillingCycles: 12,
          trialDays: 14,
          graceDays: 7,
          entitlements: { maxPatients: 1, maxMonthlyAppointments: 1 },
          providerPlanId: `plan_${randomUUID().replaceAll("-", "")}`,
        },
      });
      const providerSubscriptionA = `sub_${randomUUID().replaceAll("-", "")}`;
      const providerSubscriptionB = `sub_${randomUUID().replaceAll("-", "")}`;
      const trialStartedAt = new Date("2026-10-24T12:00:00.000Z");
      const trialEndsAt = new Date(
        trialStartedAt.getTime() + 14 * 24 * 60 * 60 * 1000,
      );
      const subscriptionA = await prisma.clinicSubscription.create({
        data: {
          clinicId: clinicAId,
          planVersionId: billingPlan.id,
          status: BillingSubscriptionStatus.ACTIVE,
          providerSubscriptionId: providerSubscriptionA,
          trialStartedAt,
          trialEndsAt,
          currentPeriodStart: trialStartedAt,
          currentPeriodEnd: new Date(
            trialStartedAt.getTime() + 30 * 24 * 60 * 60 * 1000,
          ),
        },
      });
      const subscriptionB = await prisma.clinicSubscription.create({
        data: {
          clinicId: clinicBId,
          planVersionId: billingPlan.id,
          status: BillingSubscriptionStatus.CHECKOUT_PENDING,
          providerSubscriptionId: providerSubscriptionB,
        },
      });
      const paymentForB = `pay_${randomUUID().replaceAll("-", "")}`;
      const webhookEventIds: string[] = [];
      let capTestAppointmentId: string | undefined;

      try {
        await assert.rejects(
          createClinicPatient(
            clinicAId,
            patientInputSchema.parse({
              fullName: `${marker} over-limit patient`,
              phoneNumber: syntheticPhone(),
              whatsappOptIn: false,
              notes: "",
            }),
          ),
          BillingLimitReachedError,
        );
        const appointmentBase = {
          patientId: patientA.id,
          treatmentVisitId: "",
          date: "2099-12-30",
          durationMinutes: "30",
          dentistName: `${marker} billing limit`,
          chairLabel: `${marker} billing chair`,
          type: "Review",
          notes: "",
        };
        const capTestAppointment = await createClinicAppointment(
          clinicAId,
          createAppointmentSchema.parse({
            ...appointmentBase,
            time: "09:30",
          }),
        );
        capTestAppointmentId = capTestAppointment.id;
        await assert.rejects(
          createClinicAppointment(
            clinicAId,
            createAppointmentSchema.parse({
              ...appointmentBase,
              time: "10:30",
            }),
          ),
          BillingLimitReachedError,
        );

        await prisma.billingPayment.create({
          data: {
            clinicId: clinicBId,
            subscriptionId: subscriptionB.id,
            providerPaymentId: paymentForB,
            amountMinor: 50000,
            currency: "INR",
            status: BillingPaymentStatus.SUCCEEDED,
            paidAt: trialStartedAt,
          },
        });

        const submit = async (
          eventType: string,
          status: string,
          offsetMs: number,
          payment?: {
            id: string;
            status: string;
            errorCode?: string;
          },
          eventId = `evt_${randomUUID().replaceAll("-", "")}`,
        ) => {
          webhookEventIds.push(eventId);
          const result = await processRazorpayWebhook(
            eventId,
            subscriptionWebhookBody(
              eventType,
              providerSubscriptionA,
              status,
              new Date(trialStartedAt.getTime() + offsetMs),
              payment,
              clinicBId,
            ),
          );
          return result;
        };

        const authenticatedEventId = `evt_${randomUUID().replaceAll("-", "")}`;
        assert.equal(
          await submit(
            "subscription.authenticated",
            "authenticated",
            0,
            undefined,
            authenticatedEventId,
          ),
          "processed",
        );
        assert.equal(
          (
            await freshReader.clinicSubscription.findUniqueOrThrow({
              where: { id: subscriptionA.id },
            })
          ).status,
          BillingSubscriptionStatus.TRIALING,
        );

        const firstPayment = `pay_${randomUUID().replaceAll("-", "")}`;
        const chargeEventId = `evt_${randomUUID().replaceAll("-", "")}`;
        const chargeBody = subscriptionWebhookBody(
          "subscription.charged",
          providerSubscriptionA,
          "active",
          new Date(trialStartedAt.getTime() + 1_000),
          { id: firstPayment, status: "captured" },
          clinicBId,
        );
        webhookEventIds.push(chargeEventId);
        assert.equal(
          await processRazorpayWebhook(chargeEventId, chargeBody),
          "processed",
        );
        assert.equal(
          await processRazorpayWebhook(chargeEventId, chargeBody),
          "duplicate",
        );

        const failedPayment = `pay_${randomUUID().replaceAll("-", "")}`;
        await submit("subscription.pending", "pending", 2_000, {
          id: failedPayment,
          status: "failed",
          errorCode: "PAYMENT_FAILED",
        });
        const failedState =
          await freshReader.clinicSubscription.findUniqueOrThrow({
            where: { id: subscriptionA.id },
          });
        assert.equal(failedState.status, BillingSubscriptionStatus.PAST_DUE);
        const graceUntil = failedState.graceUntil;
        assert.ok(graceUntil);

        await submit("subscription.halted", "halted", 3_000, {
          id: failedPayment,
          status: "failed",
          errorCode: "PAYMENT_FAILED",
        });
        const haltedState =
          await freshReader.clinicSubscription.findUniqueOrThrow({
            where: { id: subscriptionA.id },
          });
        assert.equal(haltedState.graceUntil?.getTime(), graceUntil.getTime());
        const recoveryEventId = `evt_${randomUUID().replaceAll("-", "")}`;
        await submit(
          "subscription.charged",
          "active",
          4_000,
          { id: failedPayment, status: "captured" },
          recoveryEventId,
        );

        const cancellationTime = new Date(trialStartedAt.getTime() + 5_000);
        await submit("subscription.cancelled", "cancelled", 5_000);
        await submit("subscription.activated", "active", 4_500);

        const finalA = await getClinicBillingPortalData(clinicAId);
        const finalB = await getClinicBillingPortalData(clinicBId);
        assert.ok(finalA);
        assert.ok(finalB);
        assert.equal(finalA.id, subscriptionA.id);
        assert.equal(finalA.status, BillingSubscriptionStatus.CANCELLED);
        assert.ok(await getClinicPatient(clinicAId, patientA.id));
        assert.equal(finalA.payments.length, 2);
        assert.equal(
          finalA.payments.filter(
            (payment) => payment.status === BillingPaymentStatus.SUCCEEDED,
          ).length,
          2,
        );
        assert.equal(
          finalA.payments.some(
            (payment) => payment.providerPaymentId === paymentForB,
          ),
          false,
        );
        assert.equal(finalB.id, subscriptionB.id);
        assert.equal(finalB.payments.length, 1);
        assert.equal(finalB.payments[0].providerPaymentId, paymentForB);
        assert.equal(finalB.status, BillingSubscriptionStatus.CHECKOUT_PENDING);
        const {
          data: clinicBVisibleSubscription,
          error: clinicBSubscriptionReadError,
        } = await supabaseB
          .from("clinic_subscriptions")
          .select("id")
          .eq("id", subscriptionA.id);
        assert.ok(
          clinicBSubscriptionReadError || !clinicBVisibleSubscription?.length,
        );
        const { data: clinicBVisiblePayment, error: clinicBPaymentReadError } =
          await supabaseB
            .from("billing_payments")
            .select("id")
            .eq("clinicId", clinicAId);
        assert.ok(clinicBPaymentReadError || !clinicBVisiblePayment?.length);
        assert.ok(graceUntil);
        assert.ok(cancellationTime > trialStartedAt);

        const crossClinicMembership =
          await freshReader.clinicMembership.findUnique({
            where: {
              userId_clinicId: { userId: userBId, clinicId: clinicBId },
            },
          });
        assert.throws(
          () =>
            authorizeClinicMembership(
              userAId,
              clinicBId,
              crossClinicMembership,
            ),
          ClinicAccessDeniedError,
        );
      } finally {
        if (capTestAppointmentId) {
          await prisma.appointment.deleteMany({
            where: { id: capTestAppointmentId, clinicId: clinicAId },
          });
        }
        await prisma.billingWebhookEvent.deleteMany({
          where: { providerEventId: { in: webhookEventIds } },
        });
        await prisma.clinicSubscription.deleteMany({
          where: { id: { in: [subscriptionA.id, subscriptionB.id] } },
        });
        await prisma.billingPlanVersion.delete({
          where: { id: billingPlan.id },
        });
      }
    },
  );

  await t.test(
    "patients persist, reject invalid/duplicate records and isolate clinics",
    async () => {
      assert.equal(
        patientInputSchema.safeParse({
          fullName: "A",
          phoneNumber: "not-a-phone",
          whatsappOptIn: false,
          notes: "",
        }).success,
        false,
      );
      await assert.rejects(
        createClinicPatient(clinicAId, patientInput),
        (error: unknown) =>
          error instanceof Error && "code" in error && error.code === "P2002",
      );

      const patientB = await createClinicPatient(
        clinicBId,
        patientInputSchema.parse({
          fullName: `${marker} Patient B`,
          phoneNumber: syntheticPhone(),
          whatsappOptIn: false,
          notes: "",
        }),
      );
      assert.equal(await getClinicPatient(clinicAId, patientB.id), null);
      assert.equal(
        await updateClinicPatient(clinicAId, patientB.id, patientInput),
        false,
        "Clinic A cannot update a patient owned by clinic B.",
      );
      assert.equal(
        await deleteClinicPatient(clinicAId, patientB.id),
        false,
        "Clinic A cannot delete a patient owned by clinic B.",
      );
      assert.ok(
        await freshReader.patient.findFirst({
          where: { id: patientB.id, clinicId: clinicBId },
          select: { id: true },
        }),
        "A denied cross-clinic delete must leave the clinic B patient intact.",
      );
      await assert.rejects(
        createClinicTreatmentPlan(clinicAId, patientB.id, planInput),
        TreatmentPatientNotFoundError,
      );
      const membershipForA = await freshReader.clinicMembership.findUnique({
        where: {
          userId_clinicId: { userId: userAId, clinicId: clinicAId },
        },
      });
      assert.equal(
        authorizeClinicMembership(userAId, clinicAId, membershipForA).clinicId,
        clinicAId,
      );
      const noCrossClinicMembership =
        await freshReader.clinicMembership.findUnique({
          where: {
            userId_clinicId: { userId: userAId, clinicId: clinicBId },
          },
        });
      assert.throws(
        () =>
          authorizeClinicMembership(
            userAId,
            clinicBId,
            noCrossClinicMembership,
          ),
        ClinicAccessDeniedError,
      );

      const { data: visibleToA, error: readErrorA } = await supabaseA
        .from("patients")
        .select("id")
        .eq("id", patientA.id);
      assert.ok(readErrorA || !visibleToA?.length);
      const { data: visibleToB, error: readErrorB } = await supabaseB
        .from("patients")
        .select("id")
        .eq("id", patientA.id);
      assert.ok(readErrorB || !visibleToB?.length);

      const unauthorizedPhone = syntheticPhone();
      const { error: directInsertError } = await supabaseB
        .from("patients")
        .insert({
          clinicId: clinicAId,
          fullName: `${marker} Unauthorized`,
          phoneNumber: unauthorizedPhone,
          normalizedPhone: unauthorizedPhone,
          whatsappOptIn: false,
        });
      assert.ok(
        directInsertError,
        "Authenticated browser writes must be denied by RLS.",
      );
    },
  );

  const plan = await createClinicTreatmentPlan(
    clinicAId,
    patientA.id,
    planInput,
  );
  const persistedPlan = await freshReader.treatmentPlan.findFirst({
    where: { id: plan.id, clinicId: clinicAId },
    include: { visits: { orderBy: { visitNumber: "asc" } } },
  });
  assert.ok(persistedPlan);
  assert.equal(persistedPlan.visits.length, 2);

  await t.test(
    "odontogram entries remain clinic-scoped and corrections preserve history",
    async () => {
      const originalInput = odontogramEntrySchema.parse({
        toothNumber: "16",
        dentition: OdontogramDentition.PERMANENT,
        entryType: OdontogramEntryType.FINDING,
        finding: OdontogramFinding.DECAYED,
        treatmentName: "",
        treatmentStatus: "",
        surfaces: [OdontogramSurface.OCCLUSAL],
        notes: "Synthetic odontogram entry.",
        treatmentPlanId: plan.id,
        supersedesEntryId: "",
      });
      const original = await createPatientOdontogramEntry(
        clinicAId,
        patientA.id,
        userAId,
        originalInput,
      );
      await assert.rejects(
        createPatientOdontogramEntry(
          clinicAId,
          patientA.id,
          userAId,
          odontogramEntrySchema.parse({
            ...originalInput,
            entryType: OdontogramEntryType.TREATMENT,
            finding: "",
            treatmentName: "Root canal",
            treatmentStatus: OdontogramTreatmentStatus.PLANNED,
            supersedesEntryId: original.id,
          }),
        ),
        OdontogramCorrectionNotFoundError,
      );
      const correctionInput = odontogramEntrySchema.parse({
        ...originalInput,
        finding: OdontogramFinding.RESTORED,
        surfaces: [],
        notes: "Synthetic correction; original finding retained.",
        treatmentPlanId: "",
        supersedesEntryId: original.id,
      });
      const correction = await createPatientOdontogramEntry(
        clinicAId,
        patientA.id,
        userAId,
        correctionInput,
      );

      const persistedOriginal =
        await freshReader.odontogramEntry.findFirstOrThrow({
          where: {
            id: original.id,
            clinicId: clinicAId,
            patientId: patientA.id,
          },
          include: { supersededBy: true },
        });
      const persistedCorrection =
        await freshReader.odontogramEntry.findFirstOrThrow({
          where: {
            id: correction.id,
            clinicId: clinicAId,
            patientId: patientA.id,
          },
        });
      assert.equal(persistedOriginal.finding, OdontogramFinding.DECAYED);
      assert.equal(persistedOriginal.supersededBy?.id, correction.id);
      assert.equal(persistedCorrection.supersedesEntryId, original.id);
      await assert.rejects(
        createPatientOdontogramEntry(
          clinicAId,
          patientA.id,
          userAId,
          correctionInput,
        ),
        OdontogramCorrectionNotFoundError,
      );
      assert.equal(await deleteClinicPatient(clinicAId, patientA.id), false);
      assert.ok(
        await freshReader.patient.findFirst({
          where: { id: patientA.id, clinicId: clinicAId },
          select: { id: true },
        }),
      );

      await assert.rejects(
        createPatientOdontogramEntry(
          clinicBId,
          patientA.id,
          userBId,
          originalInput,
        ),
        OdontogramPatientNotFoundError,
      );

      const { data: browserVisible, error: browserReadError } = await supabaseA
        .from("odontogram_entries")
        .select("id")
        .eq("id", original.id);
      assert.ok(browserReadError || !browserVisible?.length);

      const { error: browserWriteError } = await supabaseA
        .from("odontogram_entries")
        .insert({
          clinicId: clinicAId,
          patientId: patientA.id,
          createdByUserId: userAId,
          toothNumber: 16,
          dentition: OdontogramDentition.PERMANENT,
          entryType: OdontogramEntryType.FINDING,
          finding: OdontogramFinding.HEALTHY,
          surfaces: [],
        });
      assert.ok(
        browserWriteError,
        "Authenticated browser writes to clinical chart data must be denied.",
      );

      const recordInput = dentalClinicalRecordInputSchema.parse({
        chiefComplaints: "Pain on biting in the upper right quadrant.",
        clinicalExamination:
          "Tenderness localised to tooth 16 with shallow occlusal caries.",
        medicalHistory: "No significant systemic concerns.",
        findings: [
          {
            toothNumber: 16,
            dentition: OdontogramDentition.PERMANENT,
            toothFindingLabel: "Caries",
            summary: "Occlusal surface caries with localized tenderness.",
            surfaces: [OdontogramSurface.OCCLUSAL],
            notes: "The lesion is limited to the occlusal surface.",
            relatedOdontogramEntryId: original.id,
          },
        ],
      });
      const record = await createDentalClinicalRecord(
        clinicAId,
        patientA.id,
        userAId,
        recordInput,
      );
      const persistedRecord =
        await freshReader.dentalClinicalRecord.findFirstOrThrow({
          where: { id: record.id, clinicId: clinicAId, patientId: patientA.id },
          include: { findings: true, audits: true },
        });
      assert.equal(
        persistedRecord.chiefComplaints,
        recordInput.chiefComplaints,
      );
      assert.equal(persistedRecord.findings[0]?.toothNumber, 16);
      assert.equal(persistedRecord.audits.length, 1);
      await assert.rejects(
        createDentalClinicalRecord(
          clinicBId,
          patientA.id,
          userBId,
          recordInput,
        ),
        DentalClinicalRecordPatientNotFoundError,
      );
    },
  );

  await t.test(
    "appointments persist, link only same-clinic visits, enforce conflicts and update reports",
    async () => {
      const appointmentDate = getClinicToday();
      const dentist = await prisma.clinicDentist.create({
        data: { clinicId: clinicAId, name: `${marker} Dentist` },
        select: { id: true },
      });
      const chair = await prisma.treatmentChair.create({
        data: { clinicId: clinicAId, label: `${marker} Chair` },
        select: { id: true },
      });
      const appointmentInput = createAppointmentSchema.parse({
        patientId: patientA.id,
        treatmentVisitId: persistedPlan.visits[0].id,
        date: appointmentDate,
        time: "23:00",
        durationMinutes: 30,
        dentistId: dentist.id,
        chairId: chair.id,
        type: "Synthetic appointment",
        notes: "Synthetic appointment record.",
      });
      const appointment = await createClinicAppointment(
        clinicAId,
        appointmentInput,
      );
      const activeBookingIndex = await freshReader.$queryRaw<
        Array<{ indexname: string; indexdef: string }>
      >`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'appointments_one_active_per_treatment_visit'
      `;
      assert.equal(activeBookingIndex.length, 1);
      assert.match(activeBookingIndex[0].indexdef, /UNIQUE INDEX/i);
      assert.match(activeBookingIndex[0].indexdef, /WHERE/i);

      const persistedAppointment =
        await freshReader.appointment.findFirstOrThrow({
          where: { id: appointment.id, clinicId: clinicAId },
          include: { patient: true, treatmentVisit: true },
        });
      assert.equal(persistedAppointment.patientId, patientA.id);
      assert.equal(
        persistedAppointment.treatmentVisitId,
        persistedPlan.visits[0].id,
      );
      assert.equal(
        await listClinicAppointments(clinicBId, appointmentDate).then((rows) =>
          rows.some((row) => row.id === appointment.id),
        ),
        false,
      );
      assert.equal(
        await countClinicAppointments(clinicAId, appointmentDate),
        1,
      );
      await assert.rejects(
        createClinicAppointment(clinicAId, {
          ...appointmentInput,
          time: "21:00",
        }),
        AppointmentVisitAlreadyScheduledError,
      );

      const crossClinicPatient = await createClinicPatient(
        clinicBId,
        patientInputSchema.parse({
          fullName: `${marker} Cross-clinic appointment patient`,
          phoneNumber: syntheticPhone(),
          whatsappOptIn: false,
          notes: "",
        }),
      );
      await assert.rejects(
        createClinicAppointment(clinicAId, {
          ...appointmentInput,
          patientId: crossClinicPatient.id,
        }),
        AppointmentPatientNotFoundError,
      );
      await assert.rejects(
        createClinicAppointment(clinicAId, {
          ...appointmentInput,
          treatmentVisitId: randomUUID(),
        }),
        AppointmentVisitNotFoundError,
      );
      const crossClinicPlan = await createClinicTreatmentPlan(
        clinicBId,
        crossClinicPatient.id,
        planInput,
      );
      const crossClinicPlanWithVisits =
        await freshReader.treatmentPlan.findFirstOrThrow({
          where: { id: crossClinicPlan.id, clinicId: clinicBId },
          include: { visits: { orderBy: { visitNumber: "asc" } } },
        });
      await assert.rejects(
        createClinicAppointment(clinicAId, {
          ...appointmentInput,
          treatmentVisitId: crossClinicPlanWithVisits.visits[0].id,
        }),
        AppointmentVisitNotFoundError,
      );
      await assert.rejects(
        createClinicAppointment(clinicAId, {
          ...appointmentInput,
          treatmentVisitId: null,
          time: "23:15",
        }),
        AppointmentConflictError,
      );

      const concurrentBookingInputs = [
        {
          ...appointmentInput,
          treatmentVisitId: persistedPlan.visits[1].id,
          time: "19:00",
          dentistName: `${marker} Concurrent dentist A`,
          chairLabel: `${marker} Concurrent chair A`,
        },
        {
          ...appointmentInput,
          treatmentVisitId: persistedPlan.visits[1].id,
          time: "19:00",
          dentistName: `${marker} Concurrent dentist B`,
          chairLabel: `${marker} Concurrent chair B`,
        },
      ];
      const concurrentBookings = await Promise.allSettled(
        concurrentBookingInputs.map((input) =>
          prisma.appointment.create({
            data: {
              clinicId: clinicAId,
              patientId: input.patientId,
              treatmentVisitId: input.treatmentVisitId,
              scheduledAt: new Date(`${input.date}T${input.time}:00+05:30`),
              durationMinutes: input.durationMinutes,
              dentistName: input.dentistName,
              chairLabel: input.chairLabel,
              type: input.type,
              notes: input.notes,
            },
            select: { id: true },
          }),
        ),
      );
      assert.equal(
        concurrentBookings.filter((result) => result.status === "fulfilled")
          .length,
        1,
        "Concurrent requests must create only one active booking for a visit.",
      );
      const concurrentBookingFailures = concurrentBookings
        .filter(
          (result): result is PromiseRejectedResult =>
            result.status === "rejected",
        )
        .map(({ reason }) => safePrismaErrorCode(reason));
      assert.deepEqual(
        concurrentBookingFailures,
        ["P2002"],
        "The database index must reject a concurrent duplicate booking.",
      );

      await updateClinicAppointment(clinicAId, appointment.id, {
        ...appointmentInput,
        time: "22:00",
        notes: "Appointment details updated.",
      });
      await updateClinicAppointmentStatus(
        clinicAId,
        appointment.id,
        AppointmentStatus.CONFIRMED,
      );
      assert.equal(
        (
          await freshReader.appointment.findFirstOrThrow({
            where: { id: appointment.id, clinicId: clinicAId },
          })
        ).status,
        AppointmentStatus.CONFIRMED,
      );
      await updateClinicAppointmentStatus(
        clinicAId,
        appointment.id,
        AppointmentStatus.CANCELLED,
      );
      const replacementAppointment = await createClinicAppointment(clinicAId, {
        ...appointmentInput,
        time: "22:00",
      });
      assert.ok(replacementAppointment.id);
      assert.equal(
        (
          await freshReader.treatmentVisit.findFirstOrThrow({
            where: {
              id: persistedPlan.visits[0].id,
              clinicId: clinicAId,
            },
          })
        ).status,
        TreatmentVisitStatus.PENDING,
        "Appointment status changes must not implicitly mutate visit status.",
      );

      const range = getClinicReportDateRange(new Date(), "Asia/Kolkata");
      const metrics = await getClinicReportMetrics(clinicAId, range);
      const otherClinicMetrics = await getClinicReportMetrics(clinicBId, range);

      assert.ok(metrics.appointments >= 1);
      assert.equal(
        otherClinicMetrics.appointments,
        0,
        "Raw SQL report metrics must not expose appointments from another clinic.",
      );
    },
  );

  await t.test(
    "treatment catalogue, payment, refund and receipt persist in the financial ledger",
    async () => {
      const rowSecurityTables = await freshReader.$queryRaw<
        Array<{ relname: string; relrowsecurity: boolean }>
      >`
        SELECT c.relname, c.relrowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN (
            'treatment_catalogue_items',
            'treatment_financial_entries'
          )
        ORDER BY c.relname
      `;
      assert.deepEqual(
        rowSecurityTables,
        [
          {
            relname: "treatment_catalogue_items",
            relrowsecurity: true,
          },
          {
            relname: "treatment_financial_entries",
            relrowsecurity: true,
          },
        ],
        "Treatment finance tables must have row-level security enabled.",
      );

      const catalogueInput = treatmentCatalogueItemSchema.parse({
        name: `${marker} Synthetic treatment`,
        description: "Synthetic integration test catalogue item.",
        defaultPrice: "12000.00",
      });
      const catalogueItem = await saveClinicTreatmentCatalogueItem(
        clinicAId,
        catalogueInput,
      );
      assert.ok(
        (await listClinicTreatmentCatalogue(clinicAId)).some(
          (item) => item.id === catalogueItem.id,
        ),
      );

      for (const supabase of [supabaseA, supabaseB]) {
        const { data, error } = await supabase
          .from("treatment_catalogue_items")
          .select("id")
          .eq("id", catalogueItem.id);
        assert.ok(
          error || !data?.length,
          "Authenticated browser users must not read finance catalogue rows.",
        );
      }
      const { error: catalogueInsertError } = await supabaseB
        .from("treatment_catalogue_items")
        .insert({
          clinicId: clinicAId,
          name: `${marker} Unauthorized catalogue item`,
        });
      assert.ok(
        catalogueInsertError,
        "Authenticated browser users must not write finance catalogue rows.",
      );

      const clinicBCatalogueItem = await saveClinicTreatmentCatalogueItem(
        clinicBId,
        treatmentCatalogueItemSchema.parse({
          name: `${marker} Clinic B treatment`,
          description: "",
          defaultPrice: "500.00",
        }),
      );
      await assert.rejects(
        updateTreatmentPlanFinance(
          clinicAId,
          patientA.id,
          plan.id,
          treatmentPlanFinanceSchema.parse({
            estimatedAmount: "12000.00",
            finalAmount: "10000.00",
            catalogItemId: clinicBCatalogueItem.id,
            status: "ACTIVE",
          }),
        ),
        /active treatment from this clinic/,
      );

      await updateTreatmentPlanFinance(
        clinicAId,
        patientA.id,
        plan.id,
        treatmentPlanFinanceSchema.parse({
          estimatedAmount: "12000.00",
          finalAmount: "10000.00",
          catalogItemId: catalogueItem.id,
          status: "ACTIVE",
        }),
      );

      const paymentInput = treatmentFinancialEntrySchema.parse({
        entryType: "PAYMENT",
        amount: "1500.00",
        paymentMethod: "UPI",
        paidAt: new Date().toISOString(),
        reference: `PAY-${randomUUID()}`,
        notes: "",
        requestKey: randomUUID(),
      });
      const payment = await createTreatmentPlanFinancialEntry(
        clinicAId,
        patientA.id,
        plan.id,
        userAId,
        paymentInput,
      );
      for (const supabase of [supabaseA, supabaseB]) {
        const { data, error } = await supabase
          .from("treatment_financial_entries")
          .select("id")
          .eq("id", payment.id);
        assert.ok(
          error || !data?.length,
          "Authenticated browser users must not read financial ledger rows.",
        );
      }
      const { error: financialEntryInsertError } = await supabaseB
        .from("treatment_financial_entries")
        .insert({
          clinicId: clinicAId,
          patientId: patientA.id,
          treatmentPlanId: plan.id,
          createdByUserId: userAId,
          entryType: "PAYMENT",
          paymentMethod: "CASH",
          amount: "1.00",
          requestKey: randomUUID(),
          requestHash: "0".repeat(64),
          paidAt: new Date().toISOString(),
        });
      assert.ok(
        financialEntryInsertError,
        "Authenticated browser users must not write financial ledger rows.",
      );

      const receipt = await getTreatmentPaymentReceipt(
        clinicAId,
        patientA.id,
        plan.id,
        payment.id,
      );
      assert.ok(receipt);
      assert.equal(receipt.receiptNumber, payment.receiptNumber);
      assert.equal(receipt.patient.fullName, patientInput.fullName);

      const refundInput = treatmentFinancialEntrySchema.parse({
        entryType: "REFUND",
        amount: "250.00",
        paidAt: new Date().toISOString(),
        notes: "Synthetic partial refund.",
        requestKey: randomUUID(),
      });
      await createTreatmentPlanFinancialEntry(
        clinicAId,
        patientA.id,
        plan.id,
        userAId,
        refundInput,
      );
      const summary = await getClinicTreatmentFinanceSummary(clinicAId);
      assert.equal(summary.collectionsThisMonth, 1250);
      const persistedEntries =
        await freshReader.treatmentFinancialEntry.findMany({
          where: { clinicId: clinicAId, treatmentPlanId: plan.id },
        });
      assert.equal(persistedEntries.length, 2);

      const paymentArmPlan = await createClinicTreatmentPlan(
        clinicAId,
        patientA.id,
        planInput,
      );
      const refundArmPlan = await createClinicTreatmentPlan(
        clinicAId,
        patientA.id,
        planInput,
      );
      const reproductionPlanFinance = treatmentPlanFinanceSchema.parse({
        estimatedAmount: "12000.00",
        finalAmount: "10000.00",
        catalogItemId: catalogueItem.id,
        status: "ACTIVE",
      });
      await updateTreatmentPlanFinance(
        clinicAId,
        patientA.id,
        paymentArmPlan.id,
        reproductionPlanFinance,
      );
      await updateTreatmentPlanFinance(
        clinicAId,
        patientA.id,
        refundArmPlan.id,
        reproductionPlanFinance,
      );

      const reproductionPaidAt = new Date().toISOString();
      const paymentArmBaselineInput = treatmentFinancialEntrySchema.parse({
        entryType: "PAYMENT",
        amount: "1500.00",
        paymentMethod: "UPI",
        paidAt: reproductionPaidAt,
        notes: "",
        requestKey: randomUUID(),
      });
      console.info("[financial-ledger-repro] baseline-payment.payment-arm");
      await createTreatmentPlanFinancialEntry(
        clinicAId,
        patientA.id,
        paymentArmPlan.id,
        userAId,
        paymentArmBaselineInput,
      );

      const refundArmBaselineInput = treatmentFinancialEntrySchema.parse({
        entryType: "PAYMENT",
        amount: "1500.00",
        paymentMethod: "UPI",
        paidAt: reproductionPaidAt,
        notes: "",
        requestKey: randomUUID(),
      });
      console.info("[financial-ledger-repro] baseline-payment.refund-arm");
      await createTreatmentPlanFinancialEntry(
        clinicAId,
        patientA.id,
        refundArmPlan.id,
        userAId,
        refundArmBaselineInput,
      );

      const measuredPaymentInput = treatmentFinancialEntrySchema.parse({
        entryType: "PAYMENT",
        amount: "250.00",
        paymentMethod: "UPI",
        paidAt: reproductionPaidAt,
        notes: "",
        requestKey: randomUUID(),
      });
      console.info("[financial-ledger-repro] measured-payment");
      const measuredPayment = await createTreatmentPlanFinancialEntry(
        clinicAId,
        patientA.id,
        paymentArmPlan.id,
        userAId,
        measuredPaymentInput,
      );
      assert.ok(measuredPayment.id);
      assert.ok(measuredPayment.receiptNumber);

      const measuredRefundInput = treatmentFinancialEntrySchema.parse({
        entryType: "REFUND",
        amount: "250.00",
        paidAt: reproductionPaidAt,
        notes: "Synthetic controlled reproduction refund.",
        requestKey: randomUUID(),
      });
      console.info("[financial-ledger-repro] measured-refund");
      const measuredRefund = await createTreatmentPlanFinancialEntry(
        clinicAId,
        patientA.id,
        refundArmPlan.id,
        userAId,
        measuredRefundInput,
      );
      assert.ok(measuredRefund.id);
      assert.equal(measuredRefund.receiptNumber, null);
    },
  );

  await t.test(
    "treatment visits persist status changes, deny foreign IDs and handle concurrent updates",
    async () => {
      assert.equal(
        await getClinicTreatmentPlan(clinicAId, patientA.id, plan.id).then(
          (result) => result?.id,
        ),
        plan.id,
      );
      assert.equal(
        await getClinicTreatmentPlan(clinicBId, patientA.id, plan.id),
        null,
      );
      await assert.rejects(
        createClinicTreatmentPlan(clinicAId, randomUUID(), planInput),
        TreatmentPatientNotFoundError,
      );

      const visit = persistedPlan.visits[0];
      await updateClinicTreatmentVisitStatus(
        clinicAId,
        patientA.id,
        plan.id,
        visit.id,
        TreatmentVisitStatus.COMPLETED,
      );
      assert.equal(
        (
          await freshReader.treatmentVisit.findUniqueOrThrow({
            where: { id: visit.id },
          })
        ).status,
        TreatmentVisitStatus.COMPLETED,
      );
      assert.equal(
        (
          await freshReader.appointment.findFirstOrThrow({
            where: {
              clinicId: clinicAId,
              treatmentVisitId: visit.id,
              status: AppointmentStatus.SCHEDULED,
            },
          })
        ).status,
        AppointmentStatus.SCHEDULED,
        "Completing a treatment visit must not implicitly complete its appointment.",
      );
      await assert.rejects(
        updateClinicTreatmentVisitStatus(
          clinicAId,
          patientA.id,
          plan.id,
          visit.id,
          TreatmentVisitStatus.PENDING,
        ),
        TreatmentVisitTransitionError,
      );

      const nextVisit = persistedPlan.visits[1];
      const updates = await Promise.allSettled([
        updateClinicTreatmentVisitStatus(
          clinicAId,
          patientA.id,
          plan.id,
          nextVisit.id,
          TreatmentVisitStatus.CONFIRMED,
        ),
        updateClinicTreatmentVisitStatus(
          clinicAId,
          patientA.id,
          plan.id,
          nextVisit.id,
          TreatmentVisitStatus.RESCHEDULED,
        ),
      ]);
      assert.ok(updates.some((result) => result.status === "fulfilled"));
      const finalVisit = await freshReader.treatmentVisit.findUniqueOrThrow({
        where: { id: nextVisit.id },
      });
      for (const result of updates) {
        if (result.status === "rejected") {
          const reason = result.reason;
          const errorDetails =
            reason instanceof Error
              ? `name=${reason.name}, message=${reason.message}, code=${
                  "code" in reason ? String(reason.code) : "unavailable"
                }`
              : `name=unknown, message=${String(reason)}, code=unavailable`;
          assert.ok(
            reason instanceof Error &&
              "code" in reason &&
              reason.code === "P2034",
            `Concurrent treatment update may fail only on a serialization conflict. ${errorDetails}`,
          );
        }
      }
      assert.ok(
        [TreatmentVisitStatus.CONFIRMED, TreatmentVisitStatus.RESCHEDULED].some(
          (status) => status === finalVisit.status,
        ),
      );
    },
  );

  await t.test(
    "recalls persist, prevent concurrent duplicates and stay clinic-scoped",
    async () => {
      const recallInput = {
        type: PreventiveRecallType.CLEANING,
        customName: null,
        intervalMonths: null,
        dueDate: "2099-03-10",
        notes: "Synthetic recall.",
      };
      const concurrentCreates = await Promise.allSettled([
        createClinicRecall(clinicAId, patientA.id, recallInput),
        createClinicRecall(clinicAId, patientA.id, recallInput),
      ]);
      assert.equal(
        concurrentCreates.filter((result) => result.status === "fulfilled")
          .length,
        1,
      );
      const rejected = concurrentCreates.find(
        (result) => result.status === "rejected",
      );
      assert.ok(rejected && rejected.status === "rejected");
      assert.ok(
        rejected.reason instanceof Error &&
          "code" in rejected.reason &&
          ["P2002", "P2034"].includes(String(rejected.reason.code)),
        "Concurrent duplicate recall may fail only on a uniqueness/serialization conflict.",
      );
      await assert.rejects(
        createClinicRecall(clinicAId, patientA.id, recallInput),
        (error: unknown) => isDuplicateActiveRecall(error),
      );

      const successfulRecall = concurrentCreates.find(
        (result) => result.status === "fulfilled",
      );
      assert.ok(successfulRecall && successfulRecall.status === "fulfilled");
      const recallId = successfulRecall.value.id;
      const recall = await getClinicRecall(clinicAId, recallId);
      assert.ok(recall);
      assert.equal(recall.status, PreventiveRecallStatus.ACTIVE);
      assert.equal(await getClinicRecall(clinicBId, recallId), null);
      await assert.rejects(
        createClinicRecall(clinicAId, randomUUID(), recallInput),
        RecallPatientNotFoundError,
      );

      await updateClinicRecallStatus(
        clinicAId,
        recallId,
        PreventiveRecallStatus.COMPLETED,
      );
      assert.equal(
        (
          await freshReader.preventiveRecall.findUniqueOrThrow({
            where: { id: recallId },
          })
        ).status,
        PreventiveRecallStatus.COMPLETED,
      );
    },
  );

  await t.test(
    "manual WhatsApp records are consent-aware, durable and idempotent",
    async () => {
      const visit = persistedPlan.visits[1];
      const messageInput = {
        clinicId: clinicAId,
        senderUserId: userAId,
        clientRequestId: randomUUID(),
        kind: "treatment-visit" as const,
        relatedRecordId: visit.id,
        message: "Synthetic reminder for integration testing.",
        templateId: null,
      };
      const first = await recordManualWhatsAppReminder(messageInput);
      const retry = await recordManualWhatsAppReminder(messageInput);
      assert.equal(retry.id, first.id);
      assert.equal(retry.alreadyRecorded, true);
      assert.ok(
        await freshReader.messageLog.findFirst({
          where: {
            id: first.id,
            clinicId: clinicAId,
            status: "MANUALLY_RECORDED_SENT",
          },
        }),
      );
      await assert.rejects(
        recordManualWhatsAppReminder({
          ...messageInput,
          message: "Changed message must not reuse the idempotency key.",
        }),
        ReminderIdempotencyConflictError,
      );
      await assert.rejects(
        recordManualWhatsAppReminder({
          ...messageInput,
          clientRequestId: randomUUID(),
          relatedRecordId: randomUUID(),
        }),
        ReminderRecordNotFoundError,
      );
      await assert.rejects(
        recordManualWhatsAppReminder({
          ...messageInput,
          clinicId: clinicBId,
        }),
        ReminderRecordNotFoundError,
      );

      const noConsentPatient = await createClinicPatient(
        clinicAId,
        patientInputSchema.parse({
          fullName: `${marker} No Consent`,
          phoneNumber: syntheticPhone(),
          whatsappOptIn: false,
          notes: "",
        }),
      );
      const noConsentPlan = await createClinicTreatmentPlan(
        clinicAId,
        noConsentPatient.id,
        createTreatmentPlanSchema.parse({
          type: TreatmentType.ROOT_CANAL,
          customName: "",
          notes: "Synthetic treatment plan without messaging consent.",
          totalVisits: 1,
          dueDates: ["2099-04-10"],
        }),
      );
      const noConsentVisit = await freshReader.treatmentVisit.findFirstOrThrow({
        where: { treatmentPlanId: noConsentPlan.id },
      });
      await assert.rejects(
        recordManualWhatsAppReminder({
          ...messageInput,
          clientRequestId: randomUUID(),
          relatedRecordId: noConsentVisit.id,
        }),
        WhatsAppConsentRequiredError,
      );
    },
  );

  await t.test(
    "database-backed follow-up queue returns only the requested clinic's records",
    async () => {
      const clinicToday = "2099-01-01";
      const queue = await listFollowUpQueue(
        clinicAId,
        "reminder-sent",
        marker,
        1,
        clinicToday,
      );
      assert.ok(
        queue.items.some(
          (item) =>
            item.patientId === patientA.id &&
            item.clinicId === clinicAId &&
            item.kind === "treatment-visit",
        ),
      );
      const otherClinicQueue = await listFollowUpQueue(
        clinicBId,
        "reminder-sent",
        marker,
        1,
        clinicToday,
      );
      assert.equal(otherClinicQueue.items.length, 0);
    },
  );

  await t.test(
    "insurance records, audit history and private Storage enforce clinic ownership",
    async () => {
      const providerData = providerInputSchema.parse({
        name: `${marker} Synthetic TPA`,
        kind: "TPA",
        phoneNumber: "",
        email: "",
        website: "",
        claimInstructions: "",
        notes: "Synthetic integration-test provider.",
      });
      const provider = await createInsuranceProvider(clinicAId, providerData);
      await assert.rejects(
        createInsuranceProvider(clinicAId, providerData),
        (error: unknown) =>
          error instanceof Error && "code" in error && error.code === "P2002",
      );

      const policyData = policyInputSchema.parse({
        patientId: patientA.id,
        providerId: provider.id,
        policyNumber: `TEST-${randomUUID()}`,
        memberReference: "",
        validFrom: "2020-01-01",
        validUntil: "2100-12-31",
        coverageLimit: "50000",
        deductible: "1000",
        coPaymentPercent: "10",
        exclusions: "",
        coverageNotes: "Synthetic test policy only.",
      });
      const policy = await createInsurancePolicy(clinicAId, policyData);
      assert.ok(
        await freshReader.insurancePolicy.findFirst({
          where: { id: policy.id, clinicId: clinicAId, patientId: patientA.id },
        }),
      );

      const preAuthorization = await createInsurancePreAuthorization(
        clinicAId,
        userAId,
        {
          patientId: patientA.id,
          policyId: policy.id,
          treatmentPlanId: plan.id,
          proposedTreatment: "Synthetic dental procedure",
          estimatedCost: "10000.00",
          requestReference: `PRE-${randomUUID()}`,
        },
      );
      await assert.rejects(
        updateInsurancePreAuthorizationStatus(
          clinicAId,
          userAId,
          preAuthorization.id,
          {
            status: InsurancePreAuthorizationStatus.APPROVED,
            approvedAmount: "7000.00",
            conditions: null,
            expiresAt: null,
            rejectionReason: null,
          },
        ),
        InsuranceValidationError,
      );
      await updateInsurancePreAuthorizationStatus(
        clinicAId,
        userAId,
        preAuthorization.id,
        {
          status: InsurancePreAuthorizationStatus.SUBMITTED,
          approvedAmount: null,
          conditions: null,
          expiresAt: null,
          rejectionReason: null,
        },
      );
      await updateInsurancePreAuthorizationStatus(
        clinicAId,
        userAId,
        preAuthorization.id,
        {
          status: InsurancePreAuthorizationStatus.PARTIALLY_APPROVED,
          approvedAmount: "7000.00",
          conditions: "Synthetic approval conditions.",
          expiresAt: new Date("2099-12-31T23:59:59.999Z"),
          rejectionReason: null,
        },
      );
      assert.equal(
        (
          await freshReader.insurancePreAuthorization.findUniqueOrThrow({
            where: { id: preAuthorization.id },
          })
        ).status,
        InsurancePreAuthorizationStatus.PARTIALLY_APPROVED,
      );

      const claimData = claimInputSchema.parse({
        patientId: patientA.id,
        policyId: policy.id,
        treatmentPlanId: plan.id,
        preAuthorizationId: preAuthorization.id,
        type: InsuranceClaimType.CASHLESS,
        treatmentDetails: "Synthetic dental procedure",
        treatmentDate: "2099-01-10",
        estimatedCost: "10000",
        amountClaimed: "8000",
        claimReference: "",
        notes: "Synthetic integration-test claim.",
      });
      const claim = await createInsuranceClaim(clinicAId, userAId, claimData);
      const storedClaim = await freshReader.insuranceClaim.findFirst({
        where: { id: claim.id, clinicId: clinicAId },
        include: { documents: true, activities: true },
      });
      assert.ok(storedClaim);
      assert.equal(storedClaim.status, InsuranceClaimStatus.DRAFT);
      assert.equal(storedClaim.documents.length, 3);
      assert.ok(storedClaim.activities.length >= 4);
      assert.equal(await getInsuranceClaim(clinicBId, claim.id), null);
      const { data: browserVisibleClaims, error: browserClaimReadError } =
        await supabaseB
          .from("insurance_claims")
          .select("id")
          .eq("id", claim.id);
      assert.ok(browserClaimReadError || !browserVisibleClaims?.length);
      assert.equal(
        claimInputSchema.safeParse({
          ...claimData,
          amountClaimed: "not-a-currency-amount",
        }).success,
        false,
      );

      await assert.rejects(
        createInsuranceClaim(clinicAId, userAId, {
          ...claimData,
          policyId: randomUUID(),
        }),
        InsuranceRecordNotFoundError,
      );
      await assert.rejects(
        updateInsuranceClaimStatus(clinicAId, userAId, claim.id, {
          status: InsuranceClaimStatus.PAID,
          approvedAmount: null,
          rejectionReason: null,
        }),
        InsuranceValidationError,
      );

      await assert.rejects(
        createInsuranceDocumentRequirement(clinicBId, userBId, claim.id, {
          type: InsuranceDocumentType.OTHER,
          name: `${marker} cross-clinic document`,
        }),
        InsuranceRecordNotFoundError,
      );

      const clinicADocument = storedClaim.documents[0];
      assert.ok(clinicADocument);
      await assert.rejects(
        updateInsuranceDocumentStatus(
          clinicBId,
          userBId,
          claim.id,
          clinicADocument.id,
          { status: "REJECTED", rejectionReason: "Cross-clinic test." },
        ),
        InsuranceRecordNotFoundError,
        "Clinic B cannot change the status of Clinic A's insurance document.",
      );
      await assert.rejects(
        authorizeInsuranceDocumentUpload(
          clinicBId,
          claim.id,
          clinicADocument.id,
          `${clinicBId}/${claim.id}/${clinicADocument.id}/${randomUUID()}.pdf`,
        ),
        InsuranceRecordNotFoundError,
        "Clinic B cannot authorize uploads against Clinic A's claim or document.",
      );

      for (const document of storedClaim.documents) {
        await uploadAndVerifyInsuranceDocument(claim.id, document.id);
      }

      await updateInsuranceClaimStatus(clinicAId, userAId, claim.id, {
        status: InsuranceClaimStatus.SUBMITTED,
        approvedAmount: null,
        rejectionReason: null,
      });
      await updateInsuranceClaimStatus(clinicAId, userAId, claim.id, {
        status: InsuranceClaimStatus.UNDER_REVIEW,
        approvedAmount: null,
        rejectionReason: null,
      });
      await updateInsuranceClaimStatus(clinicAId, userAId, claim.id, {
        status: InsuranceClaimStatus.PARTIALLY_APPROVED,
        approvedAmount: "5000.00",
        rejectionReason: null,
      });
      await createInsurancePayment(clinicAId, userAId, claim.id, {
        kind: "INSURER_PAYMENT",
        amount: "1000.00",
        paidAt: new Date("2099-01-10T12:00:00.000Z"),
        reference: `PAY-${randomUUID()}`,
        notes: "Synthetic partial insurer payment.",
      });
      const finalClaim = await freshReader.insuranceClaim.findUniqueOrThrow({
        where: { id: claim.id },
        include: { payments: true },
      });
      assert.equal(finalClaim.status, InsuranceClaimStatus.PARTIALLY_APPROVED);
      assert.equal(finalClaim.payments.length, 1);
      assert.equal(finalClaim.payments[0].amount.toString(), "1000");
      assert.equal(
        (await getInsuranceDashboard(clinicAId)).outstandingInsurerPayments,
        "4000.00",
      );

      const uploadedPath =
        uploadedStoragePaths[uploadedStoragePaths.length - 1];
      assert.ok(uploadedPath);
      const { data: allowedDownload, error: allowedDownloadError } =
        await supabaseA.storage
          .from("dentalflow-insurance-private")
          .download(uploadedPath);
      assert.equal(allowedDownloadError, null);
      assert.ok(allowedDownload);
      const { data: deniedDownload, error: deniedDownloadError } =
        await supabaseB.storage
          .from("dentalflow-insurance-private")
          .download(uploadedPath);
      assert.ok(deniedDownloadError || !deniedDownload);

      const replaceableDocument = await createInsuranceDocumentRequirement(
        clinicAId,
        userAId,
        claim.id,
        {
          type: InsuranceDocumentType.OTHER,
          name: `${marker} replaceable document`,
        },
      );
      const originalPath = `${clinicAId}/${claim.id}/${replaceableDocument.id}/${randomUUID()}.pdf`;
      uploadedStoragePaths.push(originalPath);
      await authorizeInsuranceDocumentUpload(
        clinicAId,
        claim.id,
        replaceableDocument.id,
        originalPath,
      );
      await uploadInsuranceStorageObject(supabaseA, originalPath);
      await registerInsuranceDocumentUpload(
        clinicAId,
        userAId,
        claim.id,
        replaceableDocument.id,
        originalPath,
      );
      await updateInsuranceDocumentStatus(
        clinicAId,
        userAId,
        claim.id,
        replaceableDocument.id,
        { status: "REJECTED", rejectionReason: "Synthetic test rejection." },
      );

      const otherDocument = await createInsuranceDocumentRequirement(
        clinicAId,
        userAId,
        claim.id,
        {
          type: InsuranceDocumentType.OTHER,
          name: `${marker} other document`,
        },
      );
      const arbitrarySiblingPath = `${clinicAId}/${claim.id}/${replaceableDocument.id}/${randomUUID()}.pdf`;
      const arbitraryClinicPath = `${clinicAId}/${claim.id}/${replaceableDocument.id}/${randomUUID()}.pdf`;
      const differentDocumentPath = `${clinicAId}/${claim.id}/${otherDocument.id}/${randomUUID()}.pdf`;
      uploadedStoragePaths.push(
        arbitrarySiblingPath,
        arbitraryClinicPath,
        differentDocumentPath,
      );
      const unauthorizedUpload = await supabaseA.storage
        .from("dentalflow-insurance-private")
        .upload(
          arbitrarySiblingPath,
          new Blob(["synthetic unauthorized upload"], {
            type: "application/pdf",
          }),
          { contentType: "application/pdf", upsert: false },
        );
      assert.ok(
        unauthorizedUpload.error,
        "A Storage upload without an exact-path intent must be denied.",
      );
      await authorizeInsuranceDocumentUpload(
        clinicAId,
        claim.id,
        otherDocument.id,
        differentDocumentPath,
      );
      await uploadInsuranceStorageObject(supabaseA, differentDocumentPath);
      await registerInsuranceDocumentUpload(
        clinicAId,
        userAId,
        claim.id,
        otherDocument.id,
        differentDocumentPath,
      );

      const replacementPath = `${clinicAId}/${claim.id}/${replaceableDocument.id}/${randomUUID()}.pdf`;
      const concurrentReplacementPath = `${clinicAId}/${claim.id}/${replaceableDocument.id}/${randomUUID()}.pdf`;
      uploadedStoragePaths.push(replacementPath);
      uploadedStoragePaths.push(concurrentReplacementPath);
      await Promise.all([
        authorizeInsuranceDocumentUpload(
          clinicAId,
          claim.id,
          replaceableDocument.id,
          replacementPath,
        ),
        authorizeInsuranceDocumentUpload(
          clinicAId,
          claim.id,
          replaceableDocument.id,
          concurrentReplacementPath,
        ),
      ]);
      await uploadInsuranceStorageObject(supabaseA, replacementPath);
      await uploadInsuranceStorageObject(supabaseA, concurrentReplacementPath);
      const concurrentRegistrations = await Promise.all([
        registerInsuranceDocumentUpload(
          clinicAId,
          userAId,
          claim.id,
          replaceableDocument.id,
          replacementPath,
        ),
        registerInsuranceDocumentUpload(
          clinicAId,
          userAId,
          claim.id,
          replaceableDocument.id,
          concurrentReplacementPath,
        ),
      ]);
      assert.equal(
        concurrentRegistrations.filter(
          (registration) => registration.registered,
        ).length,
        1,
        "Only one concurrent replacement may become the current document.",
      );
      const winningReplacementPath = concurrentRegistrations[0].registered
        ? replacementPath
        : concurrentReplacementPath;
      const losingReplacementPath = concurrentRegistrations[0].registered
        ? concurrentReplacementPath
        : replacementPath;
      assert.ok(
        concurrentRegistrations.some(
          (registration) =>
            !registration.registered && registration.cleanupAuthorized,
        ),
        "The losing upload must receive exact-path cleanup authorization.",
      );
      const queuedClaim = await getInsuranceClaim(clinicAId, claim.id);
      const queuedDocument = queuedClaim?.documents.find(
        (document) => document.id === replaceableDocument.id,
      );
      assert.deepEqual(
        queuedDocument?.pendingCleanupPaths.sort(),
        [originalPath, losingReplacementPath].sort(),
        "Both superseded and losing-upload paths must remain available for retries.",
      );

      const replacedFileCleanup = await supabaseA.storage
        .from("dentalflow-insurance-private")
        .remove([originalPath]);
      assert.equal(
        replacedFileCleanup.error,
        null,
        "The exact superseded path must remain deletable for replacement cleanup.",
      );
      assert.equal(
        await completeInsuranceDocumentStorageCleanup(
          clinicAId,
          claim.id,
          replaceableDocument.id,
          originalPath,
        ),
        true,
      );
      const crossClinicCleanup = await supabaseB.storage
        .from("dentalflow-insurance-private")
        .remove([losingReplacementPath]);
      assert.ok(
        crossClinicCleanup.error || crossClinicCleanup.data.length === 0,
        "A different clinic cannot retry another clinic's cleanup.",
      );
      const cleanupAfterDeniedRetry = await getInsuranceClaim(
        clinicAId,
        claim.id,
      );
      assert.ok(
        cleanupAfterDeniedRetry?.documents
          .find((document) => document.id === replaceableDocument.id)
          ?.pendingCleanupPaths.includes(losingReplacementPath),
        "A failed unauthorized delete must not consume the cleanup authorization.",
      );
      const losingUploadCleanup = await supabaseA.storage
        .from("dentalflow-insurance-private")
        .remove([losingReplacementPath]);
      assert.equal(losingUploadCleanup.error, null);
      assert.equal(
        await completeInsuranceDocumentStorageCleanup(
          clinicAId,
          claim.id,
          replaceableDocument.id,
          losingReplacementPath,
        ),
        true,
        "The losing concurrent upload's cleanup authorization must be finalizable.",
      );

      const arbitrarySiblingDelete = await supabaseA.storage
        .from("dentalflow-insurance-private")
        .remove([arbitrarySiblingPath]);
      assert.ok(
        arbitrarySiblingDelete.error ||
          arbitrarySiblingDelete.data.length === 0,
        "An unregistered sibling object must not be deleted.",
      );
      const arbitraryClinicDelete = await supabaseA.storage
        .from("dentalflow-insurance-private")
        .remove([arbitraryClinicPath]);
      assert.ok(
        arbitraryClinicDelete.error || arbitraryClinicDelete.data.length === 0,
        "An arbitrary object under a member clinic prefix must not be deletable.",
      );

      const differentDocumentStillExists = await supabaseA.storage
        .from("dentalflow-insurance-private")
        .download(differentDocumentPath);
      assert.equal(differentDocumentStillExists.error, null);
      assert.ok(
        differentDocumentStillExists.data,
        "A registered current document remains accessible.",
      );
      const differentDocumentCleanup = await supabaseA.storage
        .from("dentalflow-insurance-private")
        .remove([differentDocumentPath]);
      assert.ok(
        differentDocumentCleanup.error ||
          differentDocumentCleanup.data.length === 0,
        "A registered current document must not be directly deletable.",
      );

      const registeredDocumentDelete = await supabaseA.storage
        .from("dentalflow-insurance-private")
        .remove([winningReplacementPath]);
      assert.ok(
        registeredDocumentDelete.error ||
          registeredDocumentDelete.data.length === 0,
        "A current document must be deletable only through replacement cleanup.",
      );
      const currentDocumentStillExists = await supabaseA.storage
        .from("dentalflow-insurance-private")
        .download(winningReplacementPath);
      assert.equal(currentDocumentStillExists.error, null);
      assert.ok(
        currentDocumentStillExists.data,
        "Denied direct deletion must preserve the current document object.",
      );
      assert.equal(
        await completeInsuranceDocumentStorageCleanup(
          clinicAId,
          claim.id,
          replaceableDocument.id,
          winningReplacementPath,
        ),
        false,
        "A current object cannot have its cleanup authorization finalized.",
      );
      const interruptedUploadPath = `${clinicAId}/${claim.id}/${otherDocument.id}/${randomUUID()}.pdf`;
      await authorizeInsuranceDocumentUpload(
        clinicAId,
        claim.id,
        otherDocument.id,
        interruptedUploadPath,
      );
      await uploadInsuranceStorageObject(supabaseA, interruptedUploadPath);
      const pendingUploadClaim = await getInsuranceClaim(clinicAId, claim.id);
      assert.ok(
        pendingUploadClaim?.documents
          .find((document) => document.id === otherDocument.id)
          ?.pendingCleanupPaths.includes(interruptedUploadPath),
        "An upload interrupted before document registration must remain tracked.",
      );
      const failedUploadCleanup = await supabaseA.storage
        .from("dentalflow-insurance-private")
        .remove([interruptedUploadPath]);
      assert.equal(failedUploadCleanup.error, null);
      const cleanupBeforeFinalization = await getInsuranceClaim(
        clinicAId,
        claim.id,
      );
      assert.ok(
        cleanupBeforeFinalization?.documents
          .find((document) => document.id === otherDocument.id)
          ?.pendingCleanupPaths.includes(interruptedUploadPath),
        "A deleted object remains queued until cleanup finalization succeeds.",
      );
      assert.equal(
        await completeInsuranceDocumentStorageCleanup(
          clinicAId,
          claim.id,
          otherDocument.id,
          interruptedUploadPath,
        ),
        true,
        "The upload intent can be finalized after Storage deletion.",
      );

      const clinicBPatient = await createClinicPatient(
        clinicBId,
        patientInputSchema.parse({
          fullName: `${marker} Insurance Patient B`,
          phoneNumber: syntheticPhone(),
          whatsappOptIn: false,
          notes: "",
        }),
      );
      const clinicBProvider = await createInsuranceProvider(
        clinicBId,
        providerData,
      );
      const clinicBPolicy = await createInsurancePolicy(clinicBId, {
        ...policyData,
        patientId: clinicBPatient.id,
        providerId: clinicBProvider.id,
        policyNumber: `TEST-${randomUUID()}`,
      });
      const clinicBClaim = await createInsuranceClaim(clinicBId, userBId, {
        ...claimData,
        patientId: clinicBPatient.id,
        policyId: clinicBPolicy.id,
        treatmentPlanId: null,
        preAuthorizationId: null,
        type: InsuranceClaimType.REIMBURSEMENT,
      });
      const clinicBDocument = await createInsuranceDocumentRequirement(
        clinicBId,
        userBId,
        clinicBClaim.id,
        {
          type: InsuranceDocumentType.OTHER,
          name: `${marker} clinic B document`,
        },
      );
      const clinicBStoragePath = `${clinicBId}/${clinicBClaim.id}/${clinicBDocument.id}/${randomUUID()}.pdf`;
      uploadedStoragePathsB.push(clinicBStoragePath);
      await authorizeInsuranceDocumentUpload(
        clinicBId,
        clinicBClaim.id,
        clinicBDocument.id,
        clinicBStoragePath,
      );
      await uploadInsuranceStorageObject(supabaseB, clinicBStoragePath);
      await registerInsuranceDocumentUpload(
        clinicBId,
        userBId,
        clinicBClaim.id,
        clinicBDocument.id,
        clinicBStoragePath,
      );
      await supabaseA.storage
        .from("dentalflow-insurance-private")
        .remove([clinicBStoragePath]);
      const clinicBFileStillExists = await supabaseB.storage
        .from("dentalflow-insurance-private")
        .download(clinicBStoragePath);
      assert.equal(clinicBFileStillExists.error, null);
      assert.ok(clinicBFileStillExists.data);
      const clinicBCleanup = await supabaseB.storage
        .from("dentalflow-insurance-private")
        .remove([clinicBStoragePath]);
      assert.equal(clinicBCleanup.error, null);

      const reimbursement = await createInsuranceClaim(clinicAId, userAId, {
        ...claimData,
        treatmentPlanId: null,
        preAuthorizationId: null,
        type: InsuranceClaimType.REIMBURSEMENT,
        treatmentDetails: "Synthetic reimbursement procedure",
        amountClaimed: "3000.00",
      });
      await createInsurancePayment(clinicAId, userAId, reimbursement.id, {
        kind: "PATIENT_PAYMENT",
        amount: "3000.00",
        paidAt: new Date("2099-01-10T12:00:00.000Z"),
        reference: `PAT-${randomUUID()}`,
        notes: "Synthetic patient payment.",
      });
      const reimbursementDocuments =
        await freshReader.insuranceDocument.findMany({
          where: { claimId: reimbursement.id, clinicId: clinicAId },
        });
      assert.equal(reimbursementDocuments.length, 3);
      for (const document of reimbursementDocuments) {
        await uploadAndVerifyInsuranceDocument(reimbursement.id, document.id);
      }
      await updateInsuranceClaimStatus(clinicAId, userAId, reimbursement.id, {
        status: InsuranceClaimStatus.SUBMITTED,
        approvedAmount: null,
        rejectionReason: null,
      });
      await updateInsuranceClaimStatus(clinicAId, userAId, reimbursement.id, {
        status: InsuranceClaimStatus.REJECTED,
        approvedAmount: null,
        rejectionReason: "Synthetic test rejection.",
      });
      await updateInsuranceClaimStatus(clinicAId, userAId, reimbursement.id, {
        status: InsuranceClaimStatus.SUBMITTED,
        approvedAmount: null,
        rejectionReason: null,
      });
      const resubmittedClaim =
        await freshReader.insuranceClaim.findUniqueOrThrow({
          where: { id: reimbursement.id },
          include: { payments: true },
        });
      assert.equal(resubmittedClaim.resubmissionCount, 1);
      assert.equal(resubmittedClaim.payments.length, 1);
      assert.equal(resubmittedClaim.payments[0].kind, "PATIENT_PAYMENT");
    },
  );

  await t.test(
    "staff memberships cannot use owner-only clinic permissions",
    async () => {
      assert.equal(
        await freshReader.clinicMembership.findUnique({
          where: {
            userId_clinicId: { userId: userBId, clinicId: clinicAId },
          },
        }),
        null,
        "A user from another clinic must not access this clinic before membership.",
      );
      assert.throws(
        () => authorizeClinicMembership(userBId, clinicAId, null),
        ClinicAccessDeniedError,
      );
      await prisma.clinicMembership.create({
        data: {
          clinicId: clinicAId,
          userId: userBId,
          role: ClinicRole.STAFF,
        },
      });
      const staffMembership =
        await freshReader.clinicMembership.findUniqueOrThrow({
          where: {
            userId_clinicId: { userId: userBId, clinicId: clinicAId },
          },
          select: { userId: true, clinicId: true, role: true },
        });
      const verifiedStaffMembership = authorizeClinicMembership(
        userBId,
        clinicAId,
        staffMembership,
      );

      assert.equal(
        authorizeClinicRole(verifiedStaffMembership, [
          ClinicRole.OWNER,
          ClinicRole.STAFF,
        ]).role,
        ClinicRole.STAFF,
      );
      assert.throws(
        () => authorizeClinicRole(verifiedStaffMembership, [ClinicRole.OWNER]),
        ClinicRoleDeniedError,
      );

      const revokedAt = new Date();
      const revokeResult = await prisma.clinicMembership.updateMany({
        where: {
          userId: userBId,
          clinicId: clinicAId,
          role: ClinicRole.STAFF,
          revokedAt: null,
        },
        data: { revokedAt },
      });
      assert.equal(revokeResult.count, 1);

      const revokedMembership =
        await freshReader.clinicMembership.findUniqueOrThrow({
          where: {
            userId_clinicId: { userId: userBId, clinicId: clinicAId },
          },
          select: { userId: true, clinicId: true, role: true, revokedAt: true },
        });
      assert.ok(revokedMembership.revokedAt);
      assert.throws(
        () => authorizeClinicMembership(userBId, clinicAId, revokedMembership),
        ClinicAccessDeniedError,
        "A revoked membership must remain auditable but lose access immediately.",
      );
    },
  );

  await t.test(
    "synthetic Supabase Auth session can be signed out",
    async () => {
      const authenticated = await supabaseB.auth.getUser();
      assert.equal(authenticated.data.user?.id, userBId);

      const signOutResult = await supabaseB.auth.signOut();
      assert.equal(signOutResult.error, null);

      const signedOut = await supabaseB.auth.getUser();
      assert.equal(signedOut.data.user, null);
    },
  );
});
