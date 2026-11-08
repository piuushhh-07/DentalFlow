import { execFileSync } from "node:child_process";
import { lookup } from "node:dns/promises";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createConnection } from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const confirmationPhrase = "I-UNDERSTAND-THIS-IS-A-DISPOSABLE-TEST-PROJECT";
const testRunnerGuard = "verified-disposable-supabase-target";

class IntegrationTestError extends Error {}

type TestDatabaseConfig = Readonly<{
  projectRef: string;
  databaseUrl: string;
  directUrl: string;
  supabaseUrl: string;
  anonKey: string;
  runtimeTlsConfigured: boolean;
  runtimePoolerOptionsConfigured: boolean;
}>;

type DatabaseIdentity = Readonly<{
  databaseName: string;
  serverVersion: string;
}>;

type IntegrationCommand = "diagnose" | "diagnose-migrate" | "prepare" | "test";

type RunnerOperations = Readonly<{
  diagnose?: (config: TestDatabaseConfig) => Promise<void>;
  diagnoseMigrationEngine?: (config: TestDatabaseConfig) => void;
  observeRuntimeEndpoint?: (config: TestDatabaseConfig) => Promise<void>;
  verifyDatabaseTarget: (
    config: TestDatabaseConfig,
    connectionUrl?: string,
  ) => Promise<DatabaseIdentity>;
  runMigrations: (config: TestDatabaseConfig) => void;
  verifyMigrations: () => Promise<void>;
  runTests: (config: TestDatabaseConfig) => void;
}>;

type DiagnosticStage =
  | "runtime_identity"
  | "migration_identity"
  | "schema_engine_diff"
  | "integration_suite";

const diagnosticStages = new WeakMap<object, DiagnosticStage>();

const prismaErrorTypes = new Set([
  "PrismaClientInitializationError",
  "PrismaClientKnownRequestError",
  "PrismaClientUnknownRequestError",
  "PrismaClientRustPanicError",
  "PrismaClientValidationError",
  "PrismaClientConstructorValidationError",
]);

const causeCategories = new Map<string, string>([
  ["P1000", "authentication"],
  ["P1001", "server_unreachable"],
  ["P1002", "tcp_timeout"],
  ["P1003", "configuration"],
  ["P1010", "authentication"],
  ["P1011", "tls"],
  ["P1012", "configuration"],
  ["P1013", "configuration"],
  ["P1017", "connection_closed"],
  ["P2024", "tcp_timeout"],
  ["28P01", "authentication"],
  ["28000", "authentication"],
  ["3D000", "configuration"],
  ["08001", "server_unreachable"],
  ["08004", "authentication"],
  ["08006", "connection_closed"],
  ["53300", "server_unavailable"],
  ["57P03", "server_unavailable"],
  ["ECONNREFUSED", "connection_refused"],
  ["ECONNRESET", "connection_reset"],
  ["ETIMEDOUT", "tcp_timeout"],
  ["ERR_SOCKET_CONNECTION_TIMEOUT", "tcp_timeout"],
  ["EHOSTUNREACH", "server_unreachable"],
  ["ENETUNREACH", "server_unreachable"],
  ["ENOTFOUND", "dns"],
  ["EAI_AGAIN", "dns"],
  ["ERR_TLS_CERT_ALTNAME_INVALID", "tls"],
  ["ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED", "tls"],
  ["ERR_SSL_WRONG_VERSION_NUMBER", "tls"],
  ["ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE", "tls"],
  ["DEPTH_ZERO_SELF_SIGNED_CERT", "tls"],
  ["CERT_HAS_EXPIRED", "tls"],
  ["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "tls"],
]);

const messageCauseCategories: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /\b(?:authentication failed|password authentication failed|invalid password|authentication error|role .* does not exist|no pg_hba\.conf entry)\b/i,
    "authentication",
  ],
  [/\b(?:tls|ssl|certificate|handshake)\b/i, "tls"],
  [
    /\b(?:getaddrinfo|dns lookup|name or service not known|no such host|temporary failure in name resolution|could not resolve host|could not translate host name|failed to lookup address information)\b/i,
    "dns",
  ],
  [
    /\b(?:econnrefused|connection refused|actively refused)\b/i,
    "connection_refused",
  ],
  [
    /\b(?:etimedout|timed?\s*out|timeout|deadline exceeded|socket timeout|connection timed out)\b/i,
    "tcp_timeout",
  ],
  [
    /\b(?:too many connections|remaining connection slots are reserved|database system is starting up|database system is shutting down|server is not accepting connections)\b/i,
    "server_unavailable",
  ],
  [
    /\b(?:connection reset by peer|econnreset|connection terminated unexpectedly|server closed the connection unexpectedly|connection closed unexpectedly)\b/i,
    "connection_closed",
  ],
  [
    /\b(?:database .* does not exist|invalid connection string|invalid datasource url|datasource url is invalid|environment variable .* not found|missing .* environment variable|prisma schema.*invalid)\b/i,
    "configuration",
  ],
  [
    /\b(?:can't reach|cannot reach|could not connect|server unreachable|network is unreachable|no route to host|host is unreachable|network unreachable)\b/i,
    "server_unreachable",
  ],
];

const sensitiveEnvironmentName =
  /(?:URL|PASSWORD|PASS|SECRET|TOKEN|API.?KEY|ANON.?KEY|SERVICE.?ROLE|AUTH|DATABASE|DIRECT|(?:^|_)USER(?:NAME)?$|^DENTALFLOW_TEST_)/i;

function readOwnDataProperty(value: unknown, property: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, property);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function safeErrorType(error: unknown): string {
  if (!(error instanceof Error)) return "UnknownError";
  if (error instanceof IntegrationTestError) return "IntegrationTestError";

  const constructor = Object.getPrototypeOf(error)?.constructor;
  const name = Object.getOwnPropertyDescriptor(constructor, "name")?.value;
  return typeof name === "string" && prismaErrorTypes.has(name)
    ? name
    : "Error";
}

function errorChain(error: unknown): object[] {
  const chain: object[] = [];
  let current = error;
  const seen = new Set<object>();
  for (let depth = 0; depth < 8; depth += 1) {
    if (typeof current !== "object" || current === null || seen.has(current)) {
      break;
    }
    seen.add(current);
    chain.push(current);
    current = readOwnDataProperty(current, "cause");
  }
  return chain;
}

function categoryFromErrorCode(error: object): string | undefined {
  const prismaCode = readOwnDataProperty(error, "errorCode");
  const code = readOwnDataProperty(error, "code");
  for (const candidate of [prismaCode, code]) {
    if (typeof candidate === "string") {
      const category = causeCategories.get(candidate);
      if (category) return category;
    }
  }
  return undefined;
}

function categoryFromErrorMessage(error: object): string | undefined {
  const message = readOwnDataProperty(error, "message");
  if (typeof message !== "string") return undefined;

  for (const [pattern, category] of messageCauseCategories) {
    if (pattern.test(message)) return category;
  }
  return undefined;
}

function prismaErrorCode(error: unknown): string {
  for (const item of errorChain(error)) {
    const errorCode = readOwnDataProperty(item, "errorCode");
    if (
      typeof errorCode === "string" &&
      errorCode.startsWith("P") &&
      causeCategories.has(errorCode)
    ) {
      return errorCode;
    }
  }
  return "none";
}

function underlyingNetworkCode(error: unknown): string {
  for (const item of errorChain(error)) {
    const code = readOwnDataProperty(item, "code");
    if (
      typeof code === "string" &&
      causeCategories.has(code) &&
      !code.startsWith("P") &&
      !/^[0-9A-Z]{5}$/.test(code)
    ) {
      return code;
    }
  }
  return "none";
}

export function classifyErrorCause(error: unknown): string {
  const chain = errorChain(error);
  for (const item of [...chain].reverse()) {
    if (safeErrorType(item) === "IntegrationTestError") {
      return "configuration";
    }
    if (
      safeErrorType(item) === "PrismaClientValidationError" ||
      safeErrorType(item) === "PrismaClientConstructorValidationError"
    ) {
      return "configuration";
    }
    const codeCategory = categoryFromErrorCode(item);
    if (codeCategory) return codeCategory;
    const messageCategory = categoryFromErrorMessage(item);
    if (messageCategory) return messageCategory;
  }
  return "unknown";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectSensitiveValues(): string[] {
  const values: string[] = [];
  for (const [name, value] of Object.entries(process.env)) {
    if (value && sensitiveEnvironmentName.test(name)) values.push(value);
  }

  for (const fileName of [".env", ".env.local", ".env.test.local"]) {
    const filePath = path.join(rootDirectory, fileName);
    if (!existsSync(filePath)) continue;
    for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || !sensitiveEnvironmentName.test(match[1])) continue;
      const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
      if (value) values.push(value);
    }
  }

  for (const value of [...values]) {
    try {
      const url = new URL(value);
      if (url.username) values.push(decodeURIComponent(url.username));
      if (url.password) values.push(decodeURIComponent(url.password));
    } catch {
      continue;
    }
  }

  return Array.from(new Set(values)).sort(
    (left, right) => right.length - left.length,
  );
}

export function sanitizeDiagnosticMessage(
  message: string,
  sensitiveValues: readonly string[] = collectSensitiveValues(),
): string {
  let sanitized = message
    .replace(/\b(?:postgres(?:ql)?|https?):\/\/[^\s"'<>]+/gi, "[redacted-url]")
    .replace(/\b(?:bearer)\s+\S+/gi, "Bearer [redacted]")
    .replace(
      /\b(password|passwd|pwd|token|api[_-]?key|secret|anon[_-]?key|service[_-]?role[_-]?key)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1=[redacted]",
    )
    .replace(
      /\b(user(?:name)?|role)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1=[redacted]",
    )
    .replace(/\b(user(?:name)?|role)\s+["'][^"']+["']/gi, "$1 [redacted]")
    .replace(/\b(user(?:name)?|role)\s+[A-Za-z0-9_.@-]+/gi, "$1 [redacted]")
    .replace(/\b[\w.-]+:\d{2,5}\b/g, "[redacted-endpoint]")
    .replace(
      /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
      "[redacted-token]",
    );
  for (const value of sensitiveValues) {
    sanitized = sanitized.replace(
      new RegExp(escapeRegExp(value), "gi"),
      "[redacted]",
    );
  }
  sanitized = sanitized
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return sanitized.slice(0, 1200);
}

const sensitiveMetadataKey =
  /(?:password|passwd|secret|token|api.?key|anon.?key|service.?role|credential|connection.?string|database.?url|direct.?url|username|user)/i;

function sanitizeMetadataValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return sanitizeDiagnosticMessage(value);
  }
  if (depth >= 3 || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map((item) => sanitizeMetadataValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(value),
  ).slice(0, 20)) {
    if (sensitiveMetadataKey.test(key) || !("value" in descriptor)) continue;
    const item = sanitizeMetadataValue(descriptor.value, depth + 1);
    if (item !== undefined) sanitized[key] = item;
  }
  return sanitized;
}

function safeErrorDetails(error: unknown): ReadonlyArray<
  Readonly<{
    type: string;
    message?: string;
    metadata?: Readonly<Record<string, unknown>>;
  }>
> {
  return errorChain(error).map((item) => {
    const message = readOwnDataProperty(item, "message");
    const metadata: Record<string, unknown> = {};
    for (const key of [
      "code",
      "errorCode",
      "clientVersion",
      "batchRequestIdx",
      "meta",
    ]) {
      const value = readOwnDataProperty(item, key);
      if (value === undefined) continue;
      const sanitized = sanitizeMetadataValue(value);
      if (sanitized !== undefined) metadata[key] = sanitized;
    }

    return {
      type: safeErrorType(item),
      ...(typeof message === "string"
        ? { message: sanitizeDiagnosticMessage(message) }
        : {}),
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    };
  });
}

export function safeErrorDiagnostics(error: unknown): Readonly<{
  type: string;
  prismaCode: string;
  networkCode: string;
  cause: string;
  errors: ReturnType<typeof safeErrorDetails>;
  stage?: DiagnosticStage;
}> {
  const stage =
    typeof error === "object" && error !== null
      ? diagnosticStages.get(error)
      : undefined;
  return {
    type: safeErrorType(error),
    prismaCode: prismaErrorCode(error),
    networkCode: underlyingNetworkCode(error),
    cause: classifyErrorCause(error),
    errors: safeErrorDetails(error),
    ...(stage ? { stage } : {}),
  };
}

function reportSetupFailure(error: unknown): void {
  const diagnostics = safeErrorDiagnostics(error);
  const failureType =
    diagnostics.stage === "integration_suite"
      ? "Integration test suite failed"
      : "Integration test setup failed";
  console.error(
    `${failureType} (type=${diagnostics.type}; prismaCode=${diagnostics.prismaCode}; networkCode=${diagnostics.networkCode}; cause=${diagnostics.cause}${diagnostics.stage ? `; stage=${diagnostics.stage}` : ""}; errors=${JSON.stringify(diagnostics.errors)}).`,
  );
}

async function runDiagnosticStage<T>(
  stage: DiagnosticStage,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (typeof error === "object" && error !== null) {
      diagnosticStages.set(error, stage);
    }
    throw error;
  }
}

function runSynchronousDiagnosticStage<T>(
  stage: DiagnosticStage,
  operation: () => T,
): T {
  try {
    return operation();
  } catch (error) {
    if (typeof error === "object" && error !== null) {
      diagnosticStages.set(error, stage);
    }
    throw error;
  }
}

export function loadEnvironmentContents(
  contents: string,
  environment: NodeJS.ProcessEnv,
): void {
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1] in environment) continue;
    const value = match[2].trim();
    environment[match[1]] =
      value.startsWith('"') && value.endsWith('"')
        ? value.slice(1, -1)
        : value.startsWith("'") && value.endsWith("'")
          ? value.slice(1, -1)
          : value;
  }
}

export function migrationEngineDiagnosticArgs(): string[] {
  return [
    "migrate",
    "diff",
    "--from-schema-datasource",
    path.join(rootDirectory, "prisma", "schema.prisma"),
    "--to-empty",
  ];
}

function loadLocalTestEnvironment(): void {
  const envPath = path.join(rootDirectory, ".env.test.local");
  if (!existsSync(envPath)) return;
  loadEnvironmentContents(readFileSync(envPath, "utf8"), process.env);
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new IntegrationTestError(
      `Missing ${name}. Configure the dedicated test project in .env.test.local.`,
    );
  }
  return value;
}

function connectionIdentity(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new IntegrationTestError("A test database URL is malformed.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new IntegrationTestError("Test database URLs must use PostgreSQL.");
  }
  return {
    host: url.hostname.toLowerCase(),
    port: url.port || "5432",
    database: url.pathname.replace(/^\/+/, ""),
    username: decodeURIComponent(url.username),
    query: new URLSearchParams(url.search),
  };
}

function hasSingleQueryValue(
  query: URLSearchParams,
  key: string,
  expected: string,
): boolean {
  const values = query.getAll(key);
  return values.length === 1 && values[0] === expected;
}

function projectRefFromConnection(
  identity: ReturnType<typeof connectionIdentity>,
): string | null {
  const directHost = identity.host.match(/^db\.([a-z0-9-]+)\.supabase\.co$/);
  if (directHost) return directHost[1];
  const poolerUsername = identity.username.match(/^postgres\.([a-z0-9-]+)$/);
  return poolerUsername?.[1] ?? null;
}

function parseEnvFileValues(fileName: string): Map<string, string> {
  const filePath = path.join(rootDirectory, fileName);
  const values = new Map<string, string>();
  if (!existsSync(filePath)) return values;

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(
      /^\s*(DATABASE_URL|DIRECT_URL|NEXT_PUBLIC_SUPABASE_URL)\s*=\s*(.*?)\s*$/,
    );
    if (!match) continue;
    const rawValue = match[2];
    values.set(
      match[1],
      rawValue.startsWith('"') && rawValue.endsWith('"')
        ? rawValue.slice(1, -1)
        : rawValue.startsWith("'") && rawValue.endsWith("'")
          ? rawValue.slice(1, -1)
          : rawValue,
    );
  }
  return values;
}

function projectRefFromSupabaseUrl(value: string): string | null {
  try {
    return (
      new URL(value).hostname.match(/^([a-z0-9-]+)\.supabase\.co$/)?.[1] ?? null
    );
  } catch {
    return null;
  }
}

function loadAndValidateTestConfig(): TestDatabaseConfig {
  loadLocalTestEnvironment();
  if (
    required("DENTALFLOW_TEST_DATABASE_CONFIRMATION") !== confirmationPhrase
  ) {
    throw new IntegrationTestError(
      "Refusing database access: explicitly confirm that this is a disposable test project.",
    );
  }

  const projectRef = required("DENTALFLOW_TEST_PROJECT_REF").toLowerCase();
  if (!/^[a-z0-9-]{10,40}$/.test(projectRef)) {
    throw new IntegrationTestError(
      "DENTALFLOW_TEST_PROJECT_REF has an invalid format.",
    );
  }

  const databaseUrl = required("DENTALFLOW_TEST_DATABASE_URL");
  const directUrl = required("DENTALFLOW_TEST_DIRECT_URL");
  const runtimeIdentity = connectionIdentity(databaseUrl);
  const directIdentity = connectionIdentity(directUrl);
  const runtimeTlsConfigured = hasSingleQueryValue(
    runtimeIdentity.query,
    "sslmode",
    "require",
  );
  const runtimePoolerOptionsConfigured =
    runtimeIdentity.port === "6543" &&
    runtimeIdentity.host.endsWith(".pooler.supabase.com") &&
    hasSingleQueryValue(runtimeIdentity.query, "pgbouncer", "true") &&
    hasSingleQueryValue(runtimeIdentity.query, "connection_limit", "1");

  for (const [label, identity] of [
    ["runtime", runtimeIdentity],
    ["migration", directIdentity],
  ] as const) {
    if (identity.database !== "postgres") {
      throw new IntegrationTestError(
        `The ${label} URL must target the postgres database.`,
      );
    }
    if (projectRefFromConnection(identity) !== projectRef) {
      throw new IntegrationTestError(
        `The ${label} URL does not identify DENTALFLOW_TEST_PROJECT_REF.`,
      );
    }
    if (identity.query.get("sslmode") !== "require") {
      throw new IntegrationTestError(
        `The ${label} URL must require TLS with sslmode=require.`,
      );
    }
  }

  if (!runtimeTlsConfigured || !runtimePoolerOptionsConfigured) {
    throw new IntegrationTestError(
      "The test runtime URL must use the Supabase transaction pooler on port 6543 with pgbouncer=true, connection_limit=1, and sslmode=require.",
    );
  }
  const isDirectHost = directIdentity.host === `db.${projectRef}.supabase.co`;
  const isSessionPoolerHost =
    directIdentity.host.endsWith(".pooler.supabase.com") &&
    directIdentity.username === `postgres.${projectRef}`;
  if (
    directIdentity.port !== "5432" ||
    (!isDirectHost && !isSessionPoolerHost) ||
    !hasSingleQueryValue(directIdentity.query, "sslmode", "require")
  ) {
    throw new IntegrationTestError(
      "The test migration URL must use the matching direct or session-pooler endpoint on port 5432 with sslmode=require.",
    );
  }
  for (const fileName of [".env", ".env.local"]) {
    const existing = parseEnvFileValues(fileName);
    for (const key of ["DATABASE_URL", "DIRECT_URL"] as const) {
      const value = existing.get(key);
      if (!value) continue;
      const identity = connectionIdentity(value);
      const configuredRef = projectRefFromConnection(identity);
      if (configuredRef && configuredRef === projectRef) {
        throw new IntegrationTestError(
          `The dedicated test project matches an application database in ${fileName}.`,
        );
      }
      if (
        !configuredRef &&
        identity.host === runtimeIdentity.host &&
        identity.port === runtimeIdentity.port &&
        identity.database === runtimeIdentity.database &&
        identity.username === runtimeIdentity.username
      ) {
        throw new IntegrationTestError(
          `The configured application database target in ${fileName} cannot be distinguished safely from the test target.`,
        );
      }
    }
    const appSupabaseUrl = existing.get("NEXT_PUBLIC_SUPABASE_URL");
    if (
      appSupabaseUrl &&
      projectRefFromSupabaseUrl(appSupabaseUrl) === projectRef
    ) {
      throw new IntegrationTestError(
        `The dedicated test project matches the application Auth project in ${fileName}.`,
      );
    }
  }

  const supabaseUrl = required("DENTALFLOW_TEST_SUPABASE_URL");
  let parsedSupabaseUrl: URL;
  try {
    parsedSupabaseUrl = new URL(supabaseUrl);
  } catch {
    throw new IntegrationTestError(
      "DENTALFLOW_TEST_SUPABASE_URL is malformed.",
    );
  }
  if (
    parsedSupabaseUrl.protocol !== "https:" ||
    parsedSupabaseUrl.hostname !== `${projectRef}.supabase.co`
  ) {
    throw new IntegrationTestError(
      "The test Supabase Auth URL does not match DENTALFLOW_TEST_PROJECT_REF.",
    );
  }
  if (projectRefFromConnection(runtimeIdentity) !== projectRef) {
    throw new IntegrationTestError(
      "Test database URL target validation failed.",
    );
  }

  return {
    projectRef,
    databaseUrl,
    directUrl,
    supabaseUrl,
    anonKey: required("DENTALFLOW_TEST_SUPABASE_ANON_KEY"),
    runtimeTlsConfigured,
    runtimePoolerOptionsConfigured,
  };
}

function setPrismaEnvironment(config: TestDatabaseConfig): void {
  process.env.DATABASE_URL = config.databaseUrl;
  process.env.DIRECT_URL = config.directUrl;
}

async function verifyDatabaseTarget(
  config: TestDatabaseConfig,
  connectionUrl = config.databaseUrl,
): Promise<DatabaseIdentity> {
  setPrismaEnvironment(config);
  process.env.DATABASE_URL = connectionUrl;
  const prisma = new PrismaClient({ datasourceUrl: connectionUrl });
  try {
    const identity = await prisma.$queryRaw<
      Array<{ probe: number; databaseName: string; serverVersion: string }>
    >`SELECT 1 AS "probe", current_database() AS "databaseName", current_setting('server_version') AS "serverVersion"`;
    if (identity[0]?.probe !== 1 || identity[0]?.databaseName !== "postgres") {
      throw new IntegrationTestError(
        "Connected database identity check failed.",
      );
    }
    return identity[0];
  } finally {
    await prisma.$disconnect();
  }
}

type EndpointProbe = Readonly<{
  label: "runtime" | "migration";
  host: string;
  port: number;
}>;

type DnsProbeResult = Readonly<{
  addresses: Array<Readonly<{ address: string; family: 4 | 6 }>>;
  errorCode?: string;
}>;

export function describeSupabaseHost(host: string): string {
  if (/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(host)) {
    return "[region].pooler.supabase.com";
  }
  if (/^db\.[a-z0-9-]+\.supabase\.co$/.test(host)) {
    return "db.[project-ref].supabase.co";
  }
  return "unrecognized-host-shape";
}

function endpointProbe(
  label: EndpointProbe["label"],
  connectionUrl: string,
): EndpointProbe {
  const url = new URL(connectionUrl);
  return { label, host: url.hostname, port: Number(url.port || "5432") };
}

export async function probeDns(host: string): Promise<DnsProbeResult> {
  try {
    const addresses = await lookup(host, { all: true, verbatim: true });
    return {
      addresses: addresses.map(({ address, family }) => ({
        address,
        family: family === 6 ? 6 : 4,
      })),
    };
  } catch (error) {
    const code = readOwnDataProperty(error, "code");
    return {
      addresses: [],
      errorCode:
        typeof code === "string" && causeCategories.has(code)
          ? code
          : "unknown",
    };
  }
}

export function probeTcp(
  address: string,
  port: number,
  timeoutMs = 5000,
): Promise<string> {
  return new Promise((resolve) => {
    let socket: ReturnType<typeof createConnection>;
    try {
      socket = createConnection({ host: address, port });
    } catch {
      resolve("unknown");
      return;
    }
    let settled = false;
    const finish = (result: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish("connected"));
    socket.once("timeout", () => finish("tcp_timeout"));
    socket.once("error", (error: NodeJS.ErrnoException) => {
      finish(
        error.code && causeCategories.has(error.code)
          ? causeCategories.get(error.code)!
          : "unknown",
      );
    });
  });
}

function safeEndpointHostIdentifier(host: string): string {
  if (host.endsWith(".pooler.supabase.com")) return "supabase-pooler";
  if (/^db\.[a-z0-9-]+\.supabase\.co$/.test(host)) {
    return "supabase-direct";
  }
  return "unrecognized-host";
}

export function formatRuntimeEndpointObservation(
  input: Readonly<{
    host: string;
    port: number;
    tlsConfigured: boolean;
    poolerOptionsConfigured: boolean;
    dnsOutcome: string;
    ipv4Count: number;
    ipv6Count: number;
    tcpOutcome: string;
    addressesTested: number;
  }>,
): string {
  const safeDnsOutcomes = new Set([
    "resolved",
    "ENOTFOUND",
    "EAI_AGAIN",
    "unknown",
  ]);
  const safeTcpOutcomes = new Set([
    "connected",
    "tcp_timeout",
    "connection_refused",
    "server_unreachable",
    "connection_closed",
    "connection_reset",
    "server_unavailable",
    "unknown",
    "skipped_dns_failed",
  ]);
  const safeCount = (value: number) =>
    Number.isSafeInteger(value) && value >= 0 ? value : 0;

  return [
    `host=${safeEndpointHostIdentifier(input.host)}`,
    `port=${Number.isInteger(input.port) && input.port > 0 && input.port <= 65535 ? input.port : "unknown"}`,
    `tls_url_configuration=${input.tlsConfigured ? "pass" : "fail"}`,
    `pooler_url_configuration=${input.poolerOptionsConfigured ? "pass" : "fail"}`,
    `dns=${safeDnsOutcomes.has(input.dnsOutcome) ? input.dnsOutcome : "unknown"}`,
    `ipv4=${safeCount(input.ipv4Count)}`,
    `ipv6=${safeCount(input.ipv6Count)}`,
    `tcp=${safeTcpOutcomes.has(input.tcpOutcome) ? input.tcpOutcome : "unknown"}`,
    `addresses_tested=${safeCount(input.addressesTested)}`,
  ].join(" ");
}

async function reportRuntimeEndpointObservation(
  config: TestDatabaseConfig,
): Promise<void> {
  const endpoint = endpointProbe("runtime", config.databaseUrl);
  const dns = await probeDns(endpoint.host);
  const addresses = dns.addresses.slice(0, 8);
  let tcpResults: string[] = [];
  if (addresses.length > 0) {
    try {
      tcpResults = await Promise.all(
        addresses.map(({ address }) => probeTcp(address, endpoint.port, 5000)),
      );
    } catch {
      tcpResults = addresses.map(() => "unknown");
    }
  }
  const connected = tcpResults.filter((result) => result === "connected");
  const tcpOutcome =
    connected.length > 0
      ? "connected"
      : dns.addresses.length === 0
        ? "skipped_dns_failed"
        : (tcpResults[0] ?? "unknown");

  console.info(
    `Connection diagnostic runtime: ${formatRuntimeEndpointObservation({
      host: endpoint.host,
      port: endpoint.port,
      tlsConfigured: config.runtimeTlsConfigured,
      poolerOptionsConfigured: config.runtimePoolerOptionsConfigured,
      dnsOutcome: dns.errorCode ?? "resolved",
      ipv4Count: dns.addresses.filter(({ family }) => family === 4).length,
      ipv6Count: dns.addresses.filter(({ family }) => family === 6).length,
      tcpOutcome,
      addressesTested: tcpResults.length,
    })}.`,
  );
}

async function reportEndpointProbes(endpoints: readonly EndpointProbe[]) {
  for (const endpoint of endpoints) {
    const dns = await probeDns(endpoint.host);
    const ipv4Count = dns.addresses.filter(({ family }) => family === 4).length;
    const ipv6Count = dns.addresses.filter(({ family }) => family === 6).length;
    console.info(
      `Connection diagnostic ${endpoint.label}: host=${describeSupabaseHost(endpoint.host)} port=${endpoint.port} dns=${dns.errorCode ?? "resolved"} ipv4=${ipv4Count} ipv6=${ipv6Count}.`,
    );

    if (dns.addresses.length === 0) {
      console.info(
        `Connection diagnostic ${endpoint.label}: tcp=skipped-dns-failed.`,
      );
      continue;
    }

    const tcpResults = await Promise.all(
      dns.addresses
        .slice(0, 8)
        .map(({ address }) => probeTcp(address, endpoint.port)),
    );
    const connected = tcpResults.filter(
      (result) => result === "connected",
    ).length;
    const failures = Array.from(
      new Set(tcpResults.filter((result) => result !== "connected")),
    );
    console.info(
      `Connection diagnostic ${endpoint.label}: tcp=${connected > 0 ? "connected" : (failures[0] ?? "unknown")} addresses-tested=${tcpResults.length}.`,
    );
  }
}

async function runConnectionDiagnostic(
  config: TestDatabaseConfig,
): Promise<void> {
  const migrationEndpoint = endpointProbe("migration", config.directUrl);
  await reportEndpointProbes([migrationEndpoint]);
  await reportRuntimeEndpointObservation(config);

  const identity = await verifyDatabaseTarget(config, config.databaseUrl);
  console.info(
    `Connection diagnostic runtime-prisma=connected database=${identity.databaseName}.`,
  );
}

export async function runIntegrationCommand(
  command: IntegrationCommand,
  config: TestDatabaseConfig,
  operations: RunnerOperations,
  onTargetVerified: (identity: DatabaseIdentity) => void,
): Promise<void> {
  if (command === "diagnose") {
    if (!operations.diagnose) {
      throw new IntegrationTestError(
        "The diagnostic operation is not configured.",
      );
    }
    await operations.diagnose(config);
    return;
  }

  if (command === "diagnose-migrate") {
    if (!operations.diagnoseMigrationEngine) {
      throw new IntegrationTestError(
        "The migration diagnostic operation is not configured.",
      );
    }
    await (
      operations.observeRuntimeEndpoint ?? reportRuntimeEndpointObservation
    )(config);
    await runDiagnosticStage("runtime_identity", () =>
      operations.verifyDatabaseTarget(config),
    );
    const target = await runDiagnosticStage("migration_identity", () =>
      operations.verifyDatabaseTarget(config, config.directUrl),
    );
    onTargetVerified(target);
    runSynchronousDiagnosticStage("schema_engine_diff", () =>
      operations.diagnoseMigrationEngine!(config),
    );
    return;
  }

  const target = await operations.verifyDatabaseTarget(config);
  onTargetVerified(target);

  if (command === "prepare") {
    await operations.verifyDatabaseTarget(config, config.directUrl);
    operations.runMigrations(config);
    console.info("Disposable test database migrations deployed.");
    return;
  }

  await operations.verifyMigrations();
  runSynchronousDiagnosticStage("integration_suite", () =>
    operations.runTests(config),
  );
}

function runPrismaCli(config: TestDatabaseConfig, args: string[]): void {
  setPrismaEnvironment(config);
  const prismaCli = path.join(
    rootDirectory,
    "node_modules",
    "prisma",
    "build",
    "index.js",
  );
  execFileSync(process.execPath, [prismaCli, ...args], {
    cwd: rootDirectory,
    env: process.env,
    stdio: "inherit",
  });
}

function runReadOnlyMigrationEngineDiagnostic(
  config: TestDatabaseConfig,
): void {
  const prismaCli = path.join(
    rootDirectory,
    "node_modules",
    "prisma",
    "build",
    "index.js",
  );
  const environment = {
    ...process.env,
    DATABASE_URL: config.directUrl,
    DIRECT_URL: config.directUrl,
  };

  try {
    execFileSync(
      process.execPath,
      [prismaCli, ...migrationEngineDiagnosticArgs()],
      {
        cwd: rootDirectory,
        env: environment,
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
  } catch (error) {
    const stderr = readOwnDataProperty(error, "stderr");
    const output =
      typeof stderr === "string"
        ? stderr
        : Buffer.isBuffer(stderr)
          ? stderr.toString("utf8")
          : "";
    const reportedCode = output.match(/\bP\d{4}\b/)?.[0];
    const errorCode =
      reportedCode && causeCategories.has(reportedCode)
        ? reportedCode
        : undefined;
    throw Object.assign(
      new Error(
        "Prisma Schema Engine read-only migration connectivity diagnostic failed.",
      ),
      errorCode ? { errorCode } : {},
    );
  }

  console.info(
    "Prisma Schema Engine read-only migration datasource check succeeded.",
  );
}

async function verifyAllMigrationsApplied(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const migrations = await prisma.$queryRaw<
      Array<{
        migrationName: string;
        finishedAt: Date | null;
        rolledBackAt: Date | null;
      }>
    >`
      SELECT "migration_name" AS "migrationName",
             "finished_at" AS "finishedAt",
             "rolled_back_at" AS "rolledBackAt"
      FROM public."_prisma_migrations"
      WHERE "rolled_back_at" IS NULL
    `;
    const expected = readdirSync(
      path.join(rootDirectory, "prisma", "migrations"),
      {
        withFileTypes: true,
      },
    )
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    const applied = new Set(
      migrations
        .filter((row) => row.finishedAt !== null)
        .map((row) => row.migrationName),
    );
    const missing = expected.filter((name) => !applied.has(name));
    if (missing.length > 0) {
      throw new IntegrationTestError(
        `Test database is missing migrations (${missing.join(", ")}). Run npm run test:integration:prepare.`,
      );
    }
    if (migrations.some((row) => row.finishedAt === null)) {
      throw new IntegrationTestError(
        "Test database contains an incomplete migration record.",
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

function runIntegrationSuite(config: TestDatabaseConfig): void {
  setPrismaEnvironment(config);
  process.env.DENTALFLOW_INTEGRATION_RUNNER = testRunnerGuard;
  const tsxCli = path.join(
    rootDirectory,
    "node_modules",
    "tsx",
    "dist",
    "cli.mjs",
  );
  execFileSync(
    process.execPath,
    [
      tsxCli,
      "--tsconfig",
      "tsconfig.integration.json",
      "--test",
      "tests/integration/database-workflows.test.ts",
    ],
    {
      cwd: rootDirectory,
      env: process.env,
      stdio: "inherit",
    },
  );
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (
    command !== "diagnose" &&
    command !== "diagnose-migrate" &&
    command !== "prepare" &&
    command !== "test"
  ) {
    throw new IntegrationTestError(
      "Use `diagnose`, `diagnose-migrate`, `prepare`, or `test`.",
    );
  }

  const config = loadAndValidateTestConfig();
  await runIntegrationCommand(
    command,
    config,
    {
      diagnose: runConnectionDiagnostic,
      diagnoseMigrationEngine: runReadOnlyMigrationEngineDiagnostic,
      observeRuntimeEndpoint: reportRuntimeEndpointObservation,
      verifyDatabaseTarget,
      runMigrations: (testConfig) =>
        runPrismaCli(testConfig, ["migrate", "deploy"]),
      verifyMigrations: verifyAllMigrationsApplied,
      runTests: runIntegrationSuite,
    },
    () => {
      console.info(
        "Verified disposable Supabase test target, database postgres.",
      );
      if (command === "diagnose") {
        console.info(
          "Integration connection diagnostic succeeded (read-only SELECT 1 and identity check only).",
        );
      } else if (command === "diagnose-migrate") {
        console.info(
          "Verified the disposable test migration datasource before the read-only Schema Engine check.",
        );
      }
    },
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error: unknown) => {
    reportSetupFailure(error);
    process.exitCode = 1;
  });
}
