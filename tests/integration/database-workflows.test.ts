import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import {
  InsuranceClaimStatus,
  InsuranceClaimType,
  InsuranceDocumentType,
  InsurancePreAuthorizationStatus,
  AppointmentStatus,
  PreventiveRecallStatus,
  PreventiveRecallType,
  TreatmentType,
  TreatmentVisitStatus,
  PrismaClient,
} from "@prisma/client";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AppointmentConflictError,
  AppointmentPatientNotFoundError,
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
  getClinicPatient,
  updateClinicPatient,
} from "@/features/patients/lib/patient-repository";
import {
  authorizeClinicMembership,
  ClinicAccessDeniedError,
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
  const { error: uploadError } = await supabaseA.storage
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
    "appointments persist, link only same-clinic visits, enforce conflicts and update reports",
    async () => {
      const appointmentDate = getClinicToday();
      const appointmentInput = createAppointmentSchema.parse({
        patientId: patientA.id,
        treatmentVisitId: persistedPlan.visits[0].id,
        date: appointmentDate,
        time: "23:00",
        durationMinutes: 30,
        dentistName: `${marker} Dentist`,
        chairLabel: `${marker} Chair`,
        type: "Synthetic appointment",
        notes: "Synthetic appointment record.",
      });
      const appointment = await createClinicAppointment(
        clinicAId,
        appointmentInput,
      );
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
      await assert.rejects(
        createClinicAppointment(clinicAId, {
          ...appointmentInput,
          time: "23:15",
        }),
        AppointmentConflictError,
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

      const range = getClinicReportDateRange(new Date(), "Asia/Kolkata");
      const metrics = await getClinicReportMetrics(clinicAId, range);
      assert.ok(metrics.appointments >= 1);
    },
  );

  await t.test(
    "treatment catalogue, payment, refund and receipt persist in the financial ledger",
    async () => {
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
