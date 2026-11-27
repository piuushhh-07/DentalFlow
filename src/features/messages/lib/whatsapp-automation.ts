import "server-only";

import {
  AppointmentStatus,
  MessageLogStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { buildWhatsAppReminderContent } from "@/features/messages/lib/whatsapp-reminder-content";
import {
  buildWhatsAppTemplateParameters,
  canRetryWhatsAppDeliveryFailure,
  getWhatsAppCloudApiConfig,
  sendWhatsAppTemplateMessage,
  WhatsAppDeliveryError,
} from "@/features/messages/lib/whatsapp-cloud-api";

const MAX_DELIVERY_ATTEMPTS = 3;

async function listDueAppointments(
  now: Date,
  after?: { scheduledAt: Date; id: string },
) {
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
      ...(after
        ? {
            OR: [
              { scheduledAt: { gt: after.scheduledAt } },
              { scheduledAt: after.scheduledAt, id: { gt: after.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
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
      deliveryFailureCode: true,
    },
  });
  if (existing) {
    if (
      existing.status !== MessageLogStatus.AUTOMATIC_SEND_FAILED ||
      existing.deliveryAttemptCount >= MAX_DELIVERY_ATTEMPTS ||
      !canRetryWhatsAppDeliveryFailure(existing.deliveryFailureCode)
    ) {
      return null;
    }
    const claimed = await prisma.messageLog.updateMany({
      where: {
        id: existing.id,
        status: MessageLogStatus.AUTOMATIC_SEND_FAILED,
        deliveryAttemptCount: { lt: MAX_DELIVERY_ATTEMPTS },
        // The failure classification may have changed since the initial read.
        // Compare it atomically so an ambiguous delivery is never reclaimed
        // based on stale retryable state.
        deliveryFailureCode: existing.deliveryFailureCode,
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
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let after: { scheduledAt: Date; id: string } | undefined;

  // Keyset pagination prevents already-claimed reminders in the first page
  // from permanently occupying the batch limit and starving later clinics.
  while (true) {
    const appointments = await listDueAppointments(now, after);
    if (appointments.length === 0) break;
    const lastAppointment = appointments[appointments.length - 1];
    after = { scheduledAt: lastAppointment.scheduledAt, id: lastAppointment.id };

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
      // Re-check consent and appointment/clinic eligibility after claiming the
      // reminder, immediately before contacting the WhatsApp provider.
      const stillEligible = await prisma.appointment.findFirst({
        where: {
          id: appointment.id,
          clinicId: appointment.clinicId,
          patientId: appointment.patientId,
          scheduledAt: appointment.scheduledAt,
          status: {
            in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED],
          },
          clinic: { automatedWhatsAppEnabled: true },
          patient: {
            whatsappOptIn: true,
            whatsappOptedInAt: { not: null },
          },
        },
        select: {
          id: true,
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
      if (!stillEligible) {
        await prisma.messageLog.update({
          where: { id: messageLogId },
          data: {
            status: MessageLogStatus.AUTOMATIC_SEND_FAILED,
            deliveryFailureCode: "ELIGIBILITY_CHANGED_BEFORE_DELIVERY",
          },
        });
        skipped += 1;
        continue;
      }

      // Use the latest patient and clinic details, not the values captured
      // when the due-appointment batch was first loaded.
      const latestContent = buildWhatsAppReminderContent({
        patientName: stillEligible.patient.fullName,
        clinicName: stillEligible.clinic.name,
        timeZone: stillEligible.clinic.timeZone,
        scheduledAt: appointment.scheduledAt,
        templateName: config.templateName,
        templateLanguage: config.templateLanguage,
      });

      await prisma.messageLog.update({
        where: { id: messageLogId },
        data: {
          recipientPhoneSnapshot: stillEligible.patient.phoneNumber,
          messageSnapshot: latestContent.messageSnapshot,
        },
      });

      const providerMessageId = await sendWhatsAppTemplateMessage(config, {
        phoneNumber: stillEligible.patient.phoneNumber,
        parameters: latestContent.parameters,
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
  }

  return { sent, failed, skipped };
}
