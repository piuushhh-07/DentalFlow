import "server-only";

import {
  AppointmentStatus,
  MessageLogStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  buildWhatsAppTemplateParameters,
  getWhatsAppCloudApiConfig,
  sendWhatsAppTemplateMessage,
  WhatsAppDeliveryError,
} from "@/features/messages/lib/whatsapp-cloud-api";

const MAX_DELIVERY_ATTEMPTS = 3;

async function listDueAppointments(now: Date) {
  const startsAt = new Date(now.getTime() + 23.5 * 60 * 60_000);
  const endsAt = new Date(now.getTime() + 24.5 * 60 * 60_000);
  return prisma.appointment.findMany({
    where: {
      status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
      scheduledAt: { gte: startsAt, lt: endsAt },
      clinic: { automatedWhatsAppEnabled: true },
      patient: {
        whatsappOptIn: true,
        whatsappOptedInAt: { not: null },
      },
    },
    orderBy: { scheduledAt: "asc" },
    take: 100,
    select: {
      id: true,
      clinicId: true,
      patientId: true,
      scheduledAt: true,
      patient: {
        select: {
          fullName: true,
          phoneNumber: true,
        },
      },
      clinic: {
        select: {
          name: true,
          timeZone: true,
        },
      },
    },
  });
}

async function claimAutomaticReminder(input: {
  clinicId: string;
  patientId: string;
  appointmentId: string;
  reminderKey: string;
  phoneNumber: string;
  templateName: string;
  messageSnapshot: string;
  now: Date;
}): Promise<string | null> {
  const existing = await prisma.messageLog.findUnique({
    where: {
      clinicId_automatedReminderKey: {
        clinicId: input.clinicId,
        automatedReminderKey: input.reminderKey,
      },
    },
    select: {
      id: true,
      status: true,
      deliveryAttemptCount: true,
    },
  });
  if (existing) {
    if (
      existing.status !== MessageLogStatus.AUTOMATIC_SEND_FAILED ||
      existing.deliveryAttemptCount >= MAX_DELIVERY_ATTEMPTS
    ) {
      return null;
    }
    const claimed = await prisma.messageLog.updateMany({
      where: {
        id: existing.id,
        status: MessageLogStatus.AUTOMATIC_SEND_FAILED,
        deliveryAttemptCount: { lt: MAX_DELIVERY_ATTEMPTS },
      },
      data: {
        status: MessageLogStatus.AUTOMATIC_SEND_PENDING,
        deliveryFailureCode: null,
        lastDeliveryAttemptAt: input.now,
        deliveryAttemptCount: { increment: 1 },
      },
    });
    return claimed.count === 1 ? existing.id : null;
  }

  try {
    const created = await prisma.messageLog.create({
      data: {
        clinicId: input.clinicId,
        patientId: input.patientId,
        appointmentId: input.appointmentId,
        senderUserId: null,
        status: MessageLogStatus.AUTOMATIC_SEND_PENDING,
        recipientPhoneSnapshot: input.phoneNumber,
        templateNameSnapshot: input.templateName,
        messageSnapshot: input.messageSnapshot,
        automatedReminderKey: input.reminderKey,
        deliveryAttemptCount: 1,
        lastDeliveryAttemptAt: input.now,
      },
      select: { id: true },
    });
    return created.id;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return null;
    }
    throw error;
  }
}

export async function sendDueWhatsAppAppointmentReminders(now = new Date()) {
  const config = getWhatsAppCloudApiConfig();
  const appointments = await listDueAppointments(now);
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const appointment of appointments) {
    const appointmentTime = new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: appointment.clinic.timeZone,
    }).format(appointment.scheduledAt);
    const parameters = buildWhatsAppTemplateParameters({
      patientName: appointment.patient.fullName,
      clinicName: appointment.clinic.name,
      appointmentTime,
    });
    const reminderKey = `${appointment.id}:${appointment.scheduledAt.toISOString()}`;
    const messageSnapshot = JSON.stringify({
      template: config.templateName,
      language: config.templateLanguage,
      parameters,
    });
    const messageLogId = await claimAutomaticReminder({
      clinicId: appointment.clinicId,
      patientId: appointment.patientId,
      appointmentId: appointment.id,
      reminderKey,
      phoneNumber: appointment.patient.phoneNumber,
      templateName: config.templateName,
      messageSnapshot,
      now,
    });
    if (!messageLogId) {
      skipped += 1;
      continue;
    }

    try {
      const providerMessageId = await sendWhatsAppTemplateMessage(config, {
        phoneNumber: appointment.patient.phoneNumber,
        parameters,
      });
      await prisma.messageLog.update({
        where: { id: messageLogId },
        data: {
          status: MessageLogStatus.SENT_AUTOMATICALLY,
          providerMessageId,
        },
      });
      sent += 1;
    } catch (error) {
      const failureCode =
        error instanceof WhatsAppDeliveryError
          ? `${error.httpStatus}:${error.providerCode}`.slice(0, 120)
          : "DELIVERY_ERROR";
      await prisma.messageLog.update({
        where: { id: messageLogId },
        data: {
          status: MessageLogStatus.AUTOMATIC_SEND_FAILED,
          deliveryFailureCode: failureCode,
        },
      });
      console.error("Automated WhatsApp reminder failed.", {
        status: error instanceof WhatsAppDeliveryError ? error.httpStatus : null,
        providerCode:
          error instanceof WhatsAppDeliveryError
            ? error.providerCode
            : "DELIVERY_ERROR",
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      failed += 1;
    }
  }

  return { sent, failed, skipped };
}
