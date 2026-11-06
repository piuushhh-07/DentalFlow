import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import {
  getWhatsAppCloudApiConfig,
  WhatsAppConfigurationError,
} from "@/features/messages/lib/whatsapp-cloud-api";
import { sendDueWhatsAppAppointmentReminders } from "@/features/messages/lib/whatsapp-automation";

function matchesBearerToken(request: NextRequest, expected: string): boolean {
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

export async function POST(request: NextRequest) {
  let config;
  try {
    config = getWhatsAppCloudApiConfig();
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
  if (!matchesBearerToken(request, config.cronSecret)) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
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
