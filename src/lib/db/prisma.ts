import "server-only";

import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

type PrismaClientWithQueryLogging = PrismaClient<
  Prisma.PrismaClientOptions,
  "query" | "warn" | "error"
>;

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClientWithQueryLogging;
};

const slowQueryThresholdMs = Number(
  process.env.DENTALFLOW_SLOW_QUERY_THRESHOLD_MS ?? 300,
);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClientWithQueryLogging({
    log: [
      { emit: "event", level: "query" },
      { emit: "stdout", level: "warn" },
      { emit: "stdout", level: "error" },
    ],
  });

// Log slow database operations across every feature, without logging SQL,
// query parameters, patient data, or clinic/user identifiers. The query hash
// groups identical query shapes so bottlenecks can be traced safely.
if (process.env.NODE_ENV === "production") {
  prisma.$on("query", (event) => {
    if (
      !Number.isFinite(slowQueryThresholdMs) ||
      event.duration < slowQueryThresholdMs
    ) {
      return;
    }

    console.warn(
      "[slow-query]",
      JSON.stringify({
        durationMs: event.duration,
        queryHash: createHash("sha256")
          .update(event.query)
          .digest("hex")
          .slice(0, 12),
        target: event.target,
      }),
    );
  });
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
