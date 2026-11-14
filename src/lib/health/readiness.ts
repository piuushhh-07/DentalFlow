export type ReadinessResult = Readonly<{
  status: 200 | 503;
  body: Readonly<{
    status: "ok" | "degraded";
    checks: Readonly<{ database: "ok" | "unavailable" }>;
  }>;
}>;

export async function evaluateReadiness(
  checkDatabase: () => Promise<unknown>,
): Promise<ReadinessResult> {
  try {
    await checkDatabase();
    return {
      status: 200,
      body: { status: "ok", checks: { database: "ok" } },
    };
  } catch {
    // Do not expose database errors, connection details, or query text publicly.
    return {
      status: 503,
      body: { status: "degraded", checks: { database: "unavailable" } },
    };
  }
}
