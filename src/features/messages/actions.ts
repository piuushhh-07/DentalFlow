"use server";

import { ClinicRole, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";

import {
  requireClinicMembership,
  requireClinicRole,
} from "@/features/auth/lib/server-auth";
import {
  isMessageLogUniqueConflict,
  recordManualWhatsAppReminder,
  ReminderIdempotencyConflictError,
  ReminderRecordInactiveError,
  ReminderRecordNotFoundError,
  ReminderTemplateNotFoundError,
  tryGetRecordedReminderAfterConflict,
} from "@/features/messages/lib/message-repository";
import { saveClinicWhatsAppTemplate } from "@/features/messages/lib/template-repository";
import {
  InvalidWhatsAppPhoneError,
  validateManualSendConfirmation,
  WhatsAppConsentRequiredError,
} from "@/features/messages/lib/whatsapp";
import {
  DEFAULT_WHATSAPP_TEMPLATE,
  templateContentSchema,
} from "@/features/messages/lib/template-validation";
import {
  getWhatsAppCloudApiConfig,
  WhatsAppConfigurationError,
} from "@/features/messages/lib/whatsapp-cloud-api";

export type ManualReminderActionState = Readonly<{
  error?: string;
  success?: string;
  recordedAt?: string;
}>;

export type WhatsAppTemplateActionState = Readonly<{
  error?: string;
  success?: string;
  resetToDefault?: string;
}>;

const uuidSchema = z.string().uuid();
const messageSchema = z.string().trim().min(1).max(2000);
const relatedKindSchema = z.enum(["treatment-visit", "preventive-recall"]);
const templateIntentSchema = z.enum(["save", "reset"]);

function logTemplateError(error: unknown): void {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error("WhatsApp template save failed", { code: error.code });
    return;
  }
  console.error("WhatsApp template save failed", {
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
}

export async function saveWhatsAppReminderTemplate(
  _previousState: WhatsAppTemplateActionState,
  formData: FormData,
): Promise<WhatsAppTemplateActionState> {
  const clinicId = uuidSchema.safeParse(formData.get("clinicId"));
  const intent = templateIntentSchema.safeParse(formData.get("intent"));
  if (!clinicId.success || !intent.success) {
    return { error: "The template request is invalid. Please try again." };
  }

  const content =
    intent.data === "reset"
      ? { success: true as const, data: DEFAULT_WHATSAPP_TEMPLATE }
      : templateContentSchema.safeParse(formData.get("content"));
  if (!content.success) {
    return {
      error:
        content.error.issues[0]?.message ??
        "Please correct the template before saving.",
    };
  }

  const membership = await requireClinicRole(clinicId.data, [ClinicRole.OWNER]);
  try {
    await saveClinicWhatsAppTemplate(membership.clinicId, content.data);
    revalidatePath(`/clinic/${membership.clinicId}/messages/templates`);
    revalidatePath(`/clinic/${membership.clinicId}`);
    return {
      success:
        intent.data === "reset"
          ? "The WhatsApp reminder template was reset to its default."
          : "The WhatsApp reminder template was saved.",
      resetToDefault:
        intent.data === "reset" ? new Date().toISOString() : undefined,
    };
  } catch (error) {
    logTemplateError(error);
    return { error: "We couldn't save the template. Please try again." };
  }
}

export async function updateAutomatedWhatsAppAction(formData: FormData) {
  const clinicId = uuidSchema.safeParse(formData.get("clinicId"));
  const enabled = z.enum(["true", "false"]).safeParse(formData.get("enabled"));
  if (!clinicId.success || !enabled.success) {
    throw new Error("Provide valid automated WhatsApp settings.");
  }
  const membership = await requireClinicRole(clinicId.data, [ClinicRole.OWNER]);
  if (enabled.data === "true") {
    try {
      getWhatsAppCloudApiConfig();
    } catch (error) {
      if (error instanceof WhatsAppConfigurationError) {
        console.error(
          "Automated WhatsApp activation requires provider configuration.",
          { invalidSettings: error.missingOrInvalid },
        );
        throw new Error(
          "Automated WhatsApp is not configured. Contact support before enabling delivery.",
          { cause: error },
        );
      }
      throw error;
    }
  }
  await prisma.clinic.update({
    where: { id: membership.clinicId },
    data: { automatedWhatsAppEnabled: enabled.data === "true" },
    select: { id: true },
  });
  revalidatePath(`/clinic/${membership.clinicId}/messages/templates`);
}

function logMessageError(error: unknown): void {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error("Manual WhatsApp reminder recording failed", {
      code: error.code,
    });
    return;
  }
  console.error("Manual WhatsApp reminder recording failed", {
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
}

export async function recordManuallySentWhatsAppReminder(
  _previousState: ManualReminderActionState,
  formData: FormData,
): Promise<ManualReminderActionState> {
  const clinicId = uuidSchema.safeParse(formData.get("clinicId"));
  const kind = relatedKindSchema.safeParse(formData.get("kind"));
  const relatedRecordId = uuidSchema.safeParse(formData.get("relatedRecordId"));
  const clientRequestId = uuidSchema.safeParse(formData.get("clientRequestId"));
  const message = messageSchema.safeParse(formData.get("message"));
  const templateIdValue = formData.get("templateId");
  const templateId =
    templateIdValue === null || templateIdValue === ""
      ? { success: true as const, data: null }
      : uuidSchema.safeParse(templateIdValue);

  if (
    !clinicId.success ||
    !kind.success ||
    !relatedRecordId.success ||
    !clientRequestId.success ||
    !message.success ||
    !templateId.success
  ) {
    return { error: "The reminder details are invalid. Please try again." };
  }
  const confirmation = formData.get("confirmSent");
  if (
    typeof confirmation !== "string" ||
    !validateManualSendConfirmation(confirmation)
  ) {
    return {
      error: "Confirm that you manually sent the message from WhatsApp.",
    };
  }

  const membership = await requireClinicMembership(clinicId.data);
  const input = {
    clinicId: membership.clinicId,
    senderUserId: membership.userId,
    clientRequestId: clientRequestId.data,
    kind: kind.data,
    relatedRecordId: relatedRecordId.data,
    message: message.data,
    templateId: templateId.data,
  };

  try {
    const result = await recordManualWhatsAppReminder(input);
    revalidatePath(`/clinic/${membership.clinicId}`);
    return {
      success: result.alreadyRecorded
        ? "This manually reported reminder was already recorded."
        : "Reminder manually recorded. WhatsApp has not verified delivery.",
      recordedAt: result.manuallyConfirmedSentAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof ReminderRecordNotFoundError) {
      return {
        error: "This follow-up record is not available in your clinic.",
      };
    }
    if (error instanceof ReminderRecordInactiveError) {
      return { error: "This follow-up is no longer eligible for a reminder." };
    }
    if (error instanceof WhatsAppConsentRequiredError) {
      return {
        error:
          "WhatsApp is unavailable because recorded patient consent is missing.",
      };
    }
    if (error instanceof InvalidWhatsAppPhoneError) {
      return { error: "The patient's phone number is not valid for WhatsApp." };
    }
    if (error instanceof ReminderIdempotencyConflictError) {
      return {
        error:
          "This reminder confirmation key was already used for a different message.",
      };
    }
    if (error instanceof ReminderTemplateNotFoundError) {
      return {
        error:
          "The reminder template is no longer available. Reload and try again.",
      };
    }
    if (isMessageLogUniqueConflict(error)) {
      try {
        const existing = await tryGetRecordedReminderAfterConflict(input);
        if (existing) {
          revalidatePath(`/clinic/${membership.clinicId}`);
          return {
            success:
              "This manually reported reminder was already recorded. WhatsApp has not verified delivery.",
            recordedAt: existing.manuallyConfirmedSentAt.toISOString(),
          };
        }
      } catch (retryError) {
        if (retryError instanceof ReminderIdempotencyConflictError) {
          return {
            error:
              "This reminder confirmation key was already used for a different message.",
          };
        }
        logMessageError(retryError);
        return { error: "We couldn't verify the retry. Please try again." };
      }
    }
    logMessageError(error);
    return { error: "We couldn't record this reminder. Please try again." };
  }
}
