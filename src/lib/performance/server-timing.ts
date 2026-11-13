import { performance } from "node:perf_hooks";

/** Logs server-side operation durations without exposing user or clinic data. */
export async function measureServerOperation<T>(
  operation: string,
  task: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    const result = await task();
    console.info(
      "[server-timing]",
      JSON.stringify({
        operation,
        elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
        outcome: "success",
      }),
    );
    return result;
  } catch (error) {
    console.info(
      "[server-timing]",
      JSON.stringify({
        operation,
        elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
        outcome: "error",
        errorName: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    throw error;
  }
}
