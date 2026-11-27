import { NextResponse, type NextRequest } from "next/server";

import { matchesWhatsAppCronBearerToken } from "@/features/messages/lib/whatsapp-cron-auth";
import {
  getWhatsAppCloudApiConfig,
  WhatsAppConfigurationError,
} from "@/features/messages/lib/whatsapp-cloud-api";
import { sendDueWhatsAppAppointmentReminders } from "@/features/messages/lib/whatsapp-automation";

export async function POST(request: NextRequest) {
  // Authenticate before validating the rest of the integration config so
  // unauthenticated callers cannot distinguish configuration failures.
  if (
    !matchesWhatsAppCronBearerToken(
      request.headers.get("authorization"),
      process.env.WHATSAPP_CRON_SECRET ?? "",
    )
  ) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    getWhatsAppCloudApiConfig();
  } catch (error) {
    if (error instanceof WhatsAppConfigurationError) {
      console.error("WhatsApp reminder job is not configured.", {
        invalidSettings: error.missingOrInvalid,
      });
      return NextResponse.json(
        { error: "WhatsApp delivery is not configured." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    throw error;
  }

  try {
    const result = await sendDueWhatsAppAppointmentReminders();
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("WhatsApp reminder job failed.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "WhatsApp reminder job could not complete." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
