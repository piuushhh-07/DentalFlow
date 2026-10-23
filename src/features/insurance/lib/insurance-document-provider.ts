import { z } from "zod";

const MAX_PROVIDER_RESPONSE_BYTES = 1024 * 1024;
const PROVIDER_TIMEOUT_MS = 45_000;

export type InsuranceDocumentAiConfiguration = Readonly<{
  endpoint: string;
  apiKey: string;
  model: string;
}>;

export class InsuranceDocumentAiError extends Error {
  constructor(
    readonly code: "configuration" | "unavailable" | "invalid-response",
  ) {
    super("The document assistant could not complete this request.");
    this.name = "InsuranceDocumentAiError";
  }
}

function validateConfiguration(
  configuration: InsuranceDocumentAiConfiguration,
): void {
  let endpoint: URL;
  try {
    endpoint = new URL(configuration.endpoint);
  } catch {
    throw new InsuranceDocumentAiError("configuration");
  }
  const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(
    endpoint.hostname,
  );
  if (
    (!localHost && endpoint.protocol !== "https:") ||
    (localHost && !["http:", "https:"].includes(endpoint.protocol)) ||
    endpoint.username.length > 0 ||
    endpoint.password.length > 0 ||
    endpoint.search.length > 0 ||
    endpoint.hash.length > 0 ||
    !configuration.apiKey.trim() ||
    !configuration.model.trim()
  ) {
    throw new InsuranceDocumentAiError("configuration");
  }
}

function readOutputText(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.output_text === "string") return record.output_text;
  if (!Array.isArray(record.output)) return null;

  for (const item of record.output) {
    if (typeof item !== "object" || item === null) continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (typeof part !== "object" || part === null) continue;
      const partRecord = part as Record<string, unknown>;
      if (
        partRecord.type === "output_text" &&
        typeof partRecord.text === "string"
      ) {
        return partRecord.text;
      }
    }
  }
  return null;
}

export async function requestInsuranceDocumentJson<T>(
  configuration: InsuranceDocumentAiConfiguration,
  input: Readonly<{
    filename: string;
    contentType: "application/pdf" | "image/jpeg" | "image/png";
    bytes: Uint8Array;
    instructions: string;
    schema: z.ZodType<T>;
  }>,
  fetcher: typeof fetch = fetch,
): Promise<T> {
  validateConfiguration(configuration);
  const encodedFile = Buffer.from(input.bytes).toString("base64");
  const dataUrl = `data:${input.contentType};base64,${encodedFile}`;
  const fileContent =
    input.contentType === "application/pdf"
      ? {
          type: "input_file",
          filename: input.filename,
          file_data: dataUrl,
        }
      : {
          type: "input_image",
          image_url: dataUrl,
          detail: "high",
        };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    let response: Response;
    try {
      response = await fetcher(configuration.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${configuration.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: configuration.model,
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: input.instructions },
                fileContent,
              ],
            },
          ],
          text: { format: { type: "json_object" } },
        }),
        signal: controller.signal,
      });
    } catch {
      throw new InsuranceDocumentAiError("unavailable");
    }

    if (!response.ok) throw new InsuranceDocumentAiError("unavailable");
    const responseText = await response.text();
    if (Buffer.byteLength(responseText, "utf8") > MAX_PROVIDER_RESPONSE_BYTES) {
      throw new InsuranceDocumentAiError("invalid-response");
    }

    let providerResponse: unknown;
    try {
      providerResponse = JSON.parse(responseText);
    } catch {
      throw new InsuranceDocumentAiError("invalid-response");
    }

    const outputText = readOutputText(providerResponse);
    if (!outputText) throw new InsuranceDocumentAiError("invalid-response");
    let output: unknown;
    try {
      output = JSON.parse(outputText);
    } catch {
      throw new InsuranceDocumentAiError("invalid-response");
    }
    const parsed = input.schema.safeParse(output);
    if (!parsed.success) throw new InsuranceDocumentAiError("invalid-response");
    return parsed.data;
  } finally {
    clearTimeout(timeout);
  }
}
