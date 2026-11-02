import { NextResponse } from "next/server";

import {
  InvalidRazorpayEventError,
  RazorpayWebhookEventConflictError,
  RazorpayWebhookProcessingBusyError,
  processRazorpayWebhook,
} from "@/features/billing/lib/razorpay-webhook";
import { verifyRazorpayWebhookSignature } from "@/features/billing/lib/razorpay-signature";

export const runtime = "nodejs";

const maxWebhookBytes = 1024 * 1024;

export async function POST(request: Request) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("Razorpay webhook secret is not configured.");
    return NextResponse.json(
      { error: "Webhook endpoint is not configured." },
      { status: 500 },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxWebhookBytes) {
    return NextResponse.json(
      { error: "Webhook body is too large." },
      { status: 413 },
    );
  }

  const eventId = request.headers.get("x-razorpay-event-id") ?? "";
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  const rawBytes = new Uint8Array(await request.arrayBuffer());
  if (rawBytes.byteLength > maxWebhookBytes) {
    return NextResponse.json(
      { error: "Webhook body is too large." },
      { status: 413 },
    );
  }
  if (!verifyRazorpayWebhookSignature(rawBytes, signature, webhookSecret)) {
    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 400 },
    );
  }
  if (!eventId || eventId.length > 120) {
    return NextResponse.json(
      { error: "Invalid webhook event ID." },
      { status: 400 },
    );
  }

  let rawBody: string;
  try {
    rawBody = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook encoding." },
      { status: 400 },
    );
  }

  try {
    const result = await processRazorpayWebhook(eventId, rawBody);
    return NextResponse.json({ received: true, result }, { status: 200 });
  } catch (error) {
    if (
      error instanceof InvalidRazorpayEventError ||
      error instanceof RazorpayWebhookEventConflictError
    ) {
      return NextResponse.json(
        { error: "Invalid webhook event." },
        { status: 400 },
      );
    }
    if (error instanceof RazorpayWebhookProcessingBusyError) {
      return NextResponse.json(
        { error: "Webhook event is being processed." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "Webhook event processing failed." },
      { status: 500 },
    );
  }
}
