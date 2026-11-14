import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { evaluateReadiness } from "@/lib/health/readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const result = await evaluateReadiness(() => prisma.$queryRaw`SELECT 1`);

  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
