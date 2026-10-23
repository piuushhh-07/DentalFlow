import { performance } from "node:perf_hooks";

export type TransactionDiagnostic = Readonly<{
  operation: string;
  startedAt: number;
  includeTransactionTimingMetadata?: boolean;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function transactionTimingMetadata(error: unknown) {
  const metadata =
    error instanceof Error && "meta" in error && isRecord(error.meta)
      ? error.meta
      : undefined;
  const getNumber = (key: "timeout" | "timeTaken") => {
    const value = metadata?.[key];
    return typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : "unavailable";
  };

  return {
    timeout: getNumber("timeout"),
    timeTaken: getNumber("timeTaken"),
  };
}

function sanitizedError(error: unknown) {
  const errorName =
    error instanceof Error &&
    [
      "Error",
      "PrismaClientKnownRequestError",
      "PrismaClientUnknownRequestError",
      "PrismaClientInitializationError",
      "PrismaClientValidationError",
    ].includes(error.name)
      ? error.name
      : "Error";
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    /^P\d{4}$/.test(error.code)
      ? error.code
      : "unavailable";
  const message =
    code === "P2028"
      ? "Prisma transaction lifecycle failure."
      : code === "P2034"
        ? "Prisma transaction conflict."
        : code === "P2002"
          ? "Prisma unique constraint failure."
          : "Operation failed.";

  return { errorClass: errorName, prismaCode: code, message };
}

function record(
  diagnostic: TransactionDiagnostic,
  phase: string,
  error?: unknown,
  queryElapsedMs?: number,
) {
  console.info(
    "[transaction-trace]",
    JSON.stringify({
      operation: diagnostic.operation,
      phase,
      elapsedMs:
        Math.round((performance.now() - diagnostic.startedAt) * 100) / 100,
      ...(queryElapsedMs === undefined
        ? {}
        : { queryElapsedMs: Math.round(queryElapsedMs * 100) / 100 }),
      ...(error === undefined
        ? {}
        : {
            ...sanitizedError(error),
            ...(diagnostic.includeTransactionTimingMetadata
              ? transactionTimingMetadata(error)
              : {}),
          }),
    }),
  );
}

export function startTransactionDiagnostic(
  operation: string,
  options: { includeTransactionTimingMetadata?: boolean } = {},
): TransactionDiagnostic {
  const diagnostic = {
    operation,
    startedAt: performance.now(),
    ...options,
  };
  record(diagnostic, "before_transaction");
  return diagnostic;
}

export function recordTransactionPhase(
  diagnostic: TransactionDiagnostic,
  phase: string,
  error?: unknown,
) {
  record(diagnostic, phase, error);
}

export async function measureTransactionQuery<T>(
  diagnostic: TransactionDiagnostic,
  queryLabel: string,
  query: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    const result = await query();
    record(
      diagnostic,
      `query:${queryLabel}:completed`,
      undefined,
      performance.now() - startedAt,
    );
    return result;
  } catch (error) {
    record(
      diagnostic,
      `query:${queryLabel}:failed`,
      error,
      performance.now() - startedAt,
    );
    throw error;
  }
}
