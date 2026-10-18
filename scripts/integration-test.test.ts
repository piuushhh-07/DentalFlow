import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyErrorCause,
  describeSupabaseHost,
  loadEnvironmentContents,
  probeTcp,
  runIntegrationCommand,
  sanitizeDiagnosticMessage,
  safeErrorDiagnostics,
} from "./integration-test";

class PrismaClientInitializationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

class PrismaClientValidationError extends Error {}

test("diagnostic command runs only the dedicated read-only diagnostic", async () => {
  const config = {
    projectRef: "synthetic-test-project",
    databaseUrl: "runtime-url",
    directUrl: "direct-url",
    supabaseUrl: "https://synthetic-test-project.supabase.co",
    anonKey: "synthetic-test-key",
  };
  const calls: string[] = [];
  let reportedIdentity = false;

  await runIntegrationCommand(
    "diagnose",
    config,
    {
      diagnose: async () => {
        calls.push("dns-tcp-prisma-select");
      },
      verifyDatabaseTarget: async () => {
        throw new Error("diagnostic must use only the diagnostic operation");
      },
      runMigrations: () => calls.push("migrations"),
      verifyMigrations: async () => {
        calls.push("migration-ledger");
      },
      runTests: () => calls.push("integration-tests"),
    },
    () => {
      reportedIdentity = true;
    },
  );

  assert.deepEqual(calls, ["dns-tcp-prisma-select"]);
  assert.equal(reportedIdentity, false);
});

test("formats supported Supabase endpoint shapes without exposing project refs", () => {
  assert.equal(
    describeSupabaseHost("aws-0-region.pooler.supabase.com"),
    "[region].pooler.supabase.com",
  );
  assert.equal(
    describeSupabaseHost("db-syntheticref.supabase.co"),
    "unrecognized-host-shape",
  );
  assert.equal(
    describeSupabaseHost("db.syntheticref.supabase.co"),
    "db.[project-ref].supabase.co",
  );
});

test("TCP probe reports a local connection result", async () => {
  const { createServer } = await import("node:net");
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    assert.equal(await probeTcp("127.0.0.1", address.port), "connected");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("classifies recognized Prisma and network codes", () => {
  const cases = [
    ["P1000", "authentication"],
    ["P1001", "server_unreachable"],
    ["P1002", "tcp_timeout"],
    ["P1011", "tls"],
    ["ENOTFOUND", "dns"],
    ["ECONNREFUSED", "connection_refused"],
  ] as const;

  for (const [errorCode, expected] of cases) {
    const error = Object.assign(new Error("synthetic Prisma failure"), {
      errorCode,
    });
    assert.equal(classifyErrorCause(error), expected);
  }
});

test("classifies recognized message categories without returning message text", () => {
  const cases = [
    ["Authentication failed for synthetic database user", "authentication"],
    ["TLS handshake failed for synthetic database host", "tls"],
    ["getaddrinfo ENOTFOUND synthetic.invalid", "dns"],
    ["connect ECONNREFUSED synthetic endpoint", "connection_refused"],
    ["socket timed out while connecting", "tcp_timeout"],
    ["Can't reach database server at synthetic endpoint", "server_unreachable"],
  ] as const;

  for (const [message, expected] of cases) {
    assert.equal(classifyErrorCause(new Error(message)), expected);
  }
});

test("classifies safe codes on nested causes and defaults to unknown", () => {
  const cause = Object.assign(new Error("synthetic resolver failure"), {
    code: "EAI_AGAIN",
  });
  const error = Object.assign(
    new Error("generic Prisma initialization error"),
    {
      cause,
    },
  );

  assert.equal(classifyErrorCause(error), "dns");
  assert.equal(
    classifyErrorCause(new Error("synthetic unrecognized failure")),
    "unknown",
  );
});

test("extracts a nested connection cause without exposing error messages", () => {
  const sensitiveMessage =
    "Can't reach database server at postgres://user:synthetic-password@host/db?token=synthetic-token";
  const nested = Object.assign(
    new Error("connect ECONNREFUSED synthetic-host"),
    {
      code: "ECONNREFUSED",
    },
  );
  const error = new PrismaClientInitializationError(sensitiveMessage, {
    cause: nested,
  });

  const diagnostics = safeErrorDiagnostics(error);

  assert.deepEqual(diagnostics, {
    type: "PrismaClientInitializationError",
    prismaCode: "none",
    networkCode: "ECONNREFUSED",
    cause: "connection_refused",
    messages:
      "[PrismaClientInitializationError] Can't reach database server at [redacted-url] <- [Error] connect ECONNREFUSED synthetic-host",
  });
  assert.equal(
    JSON.stringify(diagnostics).includes("synthetic-password"),
    false,
  );
  assert.equal(JSON.stringify(diagnostics).includes("synthetic-token"), false);
  assert.equal(JSON.stringify(diagnostics).includes("postgres://"), false);
});

test("distinguishes TLS, authentication, timeout, DNS, and configuration failures", () => {
  const cases: Array<[Error, string]> = [
    [
      new Error("password authentication failed for synthetic role"),
      "authentication",
    ],
    [
      new Error("TLS certificate verification failed for synthetic host"),
      "tls",
    ],
    [new Error("connect ETIMEDOUT synthetic host"), "tcp_timeout"],
    [new Error("getaddrinfo ENOTFOUND synthetic.invalid"), "dns"],
    [
      Object.assign(new Error("synthetic Prisma schema issue"), {
        errorCode: "P1012",
      }),
      "configuration",
    ],
    [
      Object.assign(new Error("synthetic PostgreSQL authentication error"), {
        code: "28P01",
      }),
      "authentication",
    ],
    [
      new PrismaClientValidationError("synthetic validation issue"),
      "configuration",
    ],
  ];

  for (const [error, expected] of cases) {
    assert.equal(classifyErrorCause(error), expected);
  }
});

test("extracts an allowlisted Prisma code from a nested cause", () => {
  const nested = Object.assign(new Error("synthetic Prisma cause"), {
    errorCode: "P1011",
  });
  const error = new PrismaClientInitializationError(
    "synthetic initialization failure",
    { cause: nested },
  );

  assert.deepEqual(safeErrorDiagnostics(error), {
    type: "PrismaClientInitializationError",
    prismaCode: "P1011",
    networkCode: "none",
    cause: "tls",
    messages:
      "[PrismaClientInitializationError] synthetic initialization failure <- [Error] synthetic Prisma cause",
  });
});

test("redacts URLs, usernames, passwords, tokens, API keys and supplied env values", () => {
  const message =
    "connect to postgresql://synthetic-user:synthetic-password@db.invalid/postgres?token=query-token failed for user synthetic-user password=synthetic-password api_key=synthetic-api-key Bearer synthetic-bearer-token synthetic-env-value";
  const sanitized = sanitizeDiagnosticMessage(message, [
    "synthetic-password",
    "synthetic-user",
    "synthetic-api-key",
    "synthetic-bearer-token",
    "synthetic-env-value",
  ]);

  for (const secret of [
    "synthetic-user",
    "synthetic-password",
    "query-token",
    "synthetic-api-key",
    "synthetic-bearer-token",
    "synthetic-env-value",
    "postgresql://",
    "db.invalid",
  ]) {
    assert.equal(sanitized.includes(secret), false);
  }
  assert.match(sanitized, /\[redacted-url\]/);
});

test("loads test environment values without overriding inherited values", () => {
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    DENTALFLOW_TEST_PROJECT_REF: "inherited-project-ref",
  };

  loadEnvironmentContents(
    [
      'DENTALFLOW_TEST_PROJECT_REF="file-project-ref"',
      "DENTALFLOW_TEST_DATABASE_URL=postgresql://synthetic",
      "IGNORED-LINE",
    ].join("\n"),
    environment,
  );

  assert.equal(
    environment.DENTALFLOW_TEST_PROJECT_REF,
    "inherited-project-ref",
  );
  assert.equal(
    environment.DENTALFLOW_TEST_DATABASE_URL,
    "postgresql://synthetic",
  );
});
