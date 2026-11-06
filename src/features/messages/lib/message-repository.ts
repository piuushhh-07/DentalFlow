import "server-only";

import {
  MessageLogStatus,
  Prisma,
  PreventiveRecallStatus,
  TreatmentVisitStatus,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { canTransitionTreatmentVisit } from "@/features/treatments/lib/treatment-validation";
import {
  assertWhatsAppConsent,
  isSameManualReminderSubmission,
  toWhatsAppNumber,
} from "@/features/messages/lib/whatsapp";

export type ManualReminderInput = Readonly<{
  clinicId: string;
  senderUserId: string;
  clientRequestId: string;
  kind: "treatment-visit" | "preventive-recall";
  relatedRecordId: string;
  message: string;
  templateId: string | null;
}>;

export type ManualReminderResult = Readonly<{
  id: string;
  manuallyConfirmedSentAt: Date;
  alreadyRecorded: boolean;
}>;

export class ReminderRecordNotFoundError extends Error {
  constructor() {
    super("The reminder record is not available in this clinic.");
    this.name = "ReminderRecordNotFoundError";
  }
}

export class ReminderRecordInactiveError extends Error {
  constructor() {
    super("This record is no longer eligible for a WhatsApp reminder.");
    this.name = "ReminderRecordInactiveError";
  }
}

export class ReminderIdempotencyConflictError extends Error {
  constructor() {
    super(
      "This reminder submission key was already used for different content.",
    );
    this.name = "ReminderIdempotencyConflictError";
  }
}

export class ReminderTemplateNotFoundError extends Error {
  constructor() {
    super("The selected message template is not available in this clinic.");
    this.name = "ReminderTemplateNotFoundError";
  }
}

function relationIds(input: ManualReminderInput) {
  return {
    treatmentVisitId:
      input.kind === "treatment-visit" ? input.relatedRecordId : null,
    preventiveRecallId:
      input.kind === "preventive-recall" ? input.relatedRecordId : null,
  };
}

async function getExistingRecord(clinicId: string, clientRequestId: string) {
  return prisma.messageLog.findUnique({
    where: {
      clinicId_clientRequestId: { clinicId, clientRequestId },
    },
    select: {
      id: true,
      senderUserId: true,
      patientId: true,
      treatmentVisitId: true,
      preventiveRecallId: true,
      messageSnapshot: true,
      manuallyConfirmedSentAt: true,
      status: true,
      messageTemplateId: true,
      templateNameSnapshot: true,
    },
  });
}

export async function recordManualWhatsAppReminder(
  input: ManualReminderInput,
): Promise<ManualReminderResult> {
  const existing = await getExistingRecord(
    input.clinicId,
    input.clientRequestId,
  );
  if (existing) {
    const patientId =
      input.kind === "treatment-visit"
        ? (
            await prisma.treatmentVisit.findFirst({
              where: {
                id: input.relatedRecordId,
                clinicId: input.clinicId,
              },
              select: { patientId: true },
            })
          )?.patientId
        : (
            await prisma.preventiveRecall.findFirst({
              where: {
                id: input.relatedRecordId,
                clinicId: input.clinicId,
              },
              select: { patientId: true },
            })
          )?.patientId;
    if (
      !patientId ||
      existing.senderUserId === null ||
      !isSameManualReminderSubmission(existing, input, patientId) ||
      !existing.manuallyConfirmedSentAt
    ) {
      throw new ReminderIdempotencyConflictError();
    }

    return {
      id: existing.id,
      manuallyConfirmedSentAt: existing.manuallyConfirmedSentAt,
      alreadyRecorded: true,
    };
  }

  return prisma.$transaction(
    async (transaction) => {
      const related = relationIds(input);
      let patientId: string;
      let visitStatus: TreatmentVisitStatus | null = null;

      if (input.kind === "treatment-visit") {
        const visit = await transaction.treatmentVisit.findFirst({
          where: {
            id: input.relatedRecordId,
            clinicId: input.clinicId,
          },
          select: { patientId: true, status: true },
        });
        if (!visit) throw new ReminderRecordNotFoundError();
        if (
          !canTransitionTreatmentVisit(
            visit.status,
            TreatmentVisitStatus.REMINDER_SENT,
          )
        ) {
          throw new ReminderRecordInactiveError();
        }
        patientId = visit.patientId;
        visitStatus = visit.status;
      } else {
        const recall = await transaction.preventiveRecall.findFirst({
          where: {
            id: input.relatedRecordId,
            clinicId: input.clinicId,
          },
          select: { patientId: true, status: true },
        });
        if (!recall) throw new ReminderRecordNotFoundError();
        if (recall.status !== PreventiveRecallStatus.ACTIVE) {
          throw new ReminderRecordInactiveError();
        }
        patientId = recall.patientId;
      }

      const patient = await transaction.patient.findFirst({
        where: { id: patientId, clinicId: input.clinicId },
        select: {
          id: true,
          phoneNumber: true,
          whatsappOptIn: true,
          whatsappOptedInAt: true,
        },
      });
      if (!patient) throw new ReminderRecordNotFoundError();
      assertWhatsAppConsent(patient);
      toWhatsAppNumber(patient.phoneNumber);

      const messageTemplate = input.templateId
        ? await transaction.messageTemplate.findFirst({
            where: {
              id: input.templateId,
              clinicId: input.clinicId,
              isActive: true,
            },
            select: { id: true, name: true },
          })
        : null;
      if (input.templateId && !messageTemplate) {
        throw new ReminderTemplateNotFoundError();
      }

      const timestamp = new Date();
      const created = await transaction.messageLog.create({
        data: {
          clinicId: input.clinicId,
          patientId: patient.id,
          treatmentVisitId: related.treatmentVisitId,
          preventiveRecallId: related.preventiveRecallId,
          messageTemplateId: messageTemplate?.id ?? null,
          senderUserId: input.senderUserId,
          channel: "WHATSAPP",
          status: MessageLogStatus.MANUALLY_RECORDED_SENT,
          recipientPhoneSnapshot: patient.phoneNumber,
          templateNameSnapshot:
            messageTemplate?.name ?? "WhatsApp reminder (default)",
          messageSnapshot: input.message,
          clientRequestId: input.clientRequestId,
          manuallyConfirmedSentAt: timestamp,
        },
        select: { id: true },
      });

      if (input.kind === "treatment-visit") {
        if (visitStatus === null) {
          throw new ReminderRecordInactiveError();
        }
        const visit = await transaction.treatmentVisit.updateMany({
          where: {
            id: input.relatedRecordId,
            clinicId: input.clinicId,
            patientId: patient.id,
            status: visitStatus,
          },
          data: { status: TreatmentVisitStatus.REMINDER_SENT },
        });
        if (visit.count !== 1) throw new ReminderRecordInactiveError();
      }

      return {
        id: created.id,
        manuallyConfirmedSentAt: timestamp,
        alreadyRecorded: false,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function tryGetRecordedReminderAfterConflict(
  input: ManualReminderInput,
): Promise<ManualReminderResult | null> {
  const existing = await getExistingRecord(
    input.clinicId,
    input.clientRequestId,
  );
  if (
    !existing ||
    existing.status !== MessageLogStatus.MANUALLY_RECORDED_SENT ||
    !existing.manuallyConfirmedSentAt
  ) {
    return null;
  }

  const related = relationIds(input);
  if (
    existing.senderUserId !== input.senderUserId ||
    existing.treatmentVisitId !== related.treatmentVisitId ||
    existing.preventiveRecallId !== related.preventiveRecallId ||
    existing.messageSnapshot !== input.message ||
    existing.messageTemplateId !== input.templateId
  ) {
    throw new ReminderIdempotencyConflictError();
  }

  return {
    id: existing.id,
    manuallyConfirmedSentAt: existing.manuallyConfirmedSentAt,
    alreadyRecorded: true,
  };
}

export function isMessageLogUniqueConflict(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }

  const target = error.meta?.target;
  const isRequestIdTarget = (field: unknown) =>
    typeof field === "string" &&
    (field.includes("clientRequestId") ||
      field.includes("message_logs_clinicId_clientRequestId_key"));
  return typeof target === "string"
    ? isRequestIdTarget(target)
    : Array.isArray(target) && target.some(isRequestIdTarget);
}
