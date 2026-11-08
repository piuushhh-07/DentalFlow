import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import {
  classifyErrorCause,
  describeSupabaseHost,
  formatRuntimeEndpointObservation,
  loadEnvironmentContents,
  migrationEngineDiagnosticArgs,
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
    runtimeTlsConfigured: true,
    runtimePoolerOptionsConfigured: true,
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

test("migration diagnostic verifies the migration target and cannot migrate or run tests", async () => {
  const config = {
    projectRef: "synthetic-test-project",
    databaseUrl: "runtime-url",
    directUrl: "validated-migration-url",
    supabaseUrl: "https://synthetic-test-project.supabase.co",
    anonKey: "synthetic-test-key",
    runtimeTlsConfigured: true,
    runtimePoolerOptionsConfigured: true,
  };
  const calls: string[] = [];
  let reportedIdentity = false;

  await runIntegrationCommand(
    "diagnose-migrate",
    config,
    {
      diagnoseMigrationEngine: () => {
        calls.push("schema-engine-read-only-diff");
      },
      observeRuntimeEndpoint: async () => {
        calls.push("runtime-endpoint-observations");
      },
      verifyDatabaseTarget: async (_config, connectionUrl) => {
        if (connectionUrl) {
          assert.equal(connectionUrl, config.directUrl);
          calls.push("migration-target-identity");
        } else {
          calls.push("runtime-target-identity");
        }
        return { databaseName: "postgres", serverVersion: "synthetic" };
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

  assert.deepEqual(calls, [
    "runtime-endpoint-observations",
    "runtime-target-identity",
    "migration-target-identity",
    "schema-engine-read-only-diff",
  ]);
  assert.equal(reportedIdentity, true);
});

test("migration diagnostic reports only the failing stage and preserves safe error metadata", async () => {
  const config = {
    projectRef: "synthetic-test-project",
    databaseUrl: "runtime-url",
    directUrl: "validated-migration-url",
    supabaseUrl: "https://synthetic-test-project.supabase.co",
    anonKey: "synthetic-test-key",
    runtimeTlsConfigured: true,
    runtimePoolerOptionsConfigured: true,
  };
  const runtimeError = new PrismaClientInitializationError(
    "Can't reach synthetic database host",
  );

  await assert.rejects(
    runIntegrationCommand(
      "diagnose-migrate",
      config,
      {
        diagnoseMigrationEngine: () => {
          throw new Error("Schema Engine should not be reached");
        },
        observeRuntimeEndpoint: async () => undefined,
        verifyDatabaseTarget: async () => {
          throw runtimeError;
        },
        runMigrations: () => assert.fail("Must not run migrations"),
        verifyMigrations: async () =>
          assert.fail("Must not inspect migrations"),
        runTests: () => assert.fail("Must not run integration tests"),
      },
      () => assert.fail("Target should not be reported as verified"),
    ),
  );

  assert.deepEqual(safeErrorDiagnostics(runtimeError), {
    type: "PrismaClientInitializationError",
    prismaCode: "none",
    networkCode: "none",
    cause: "server_unreachable",
    errors: [
      {
        type: "PrismaClientInitializationError",
        message: "Can't reach synthetic database host",
      },
    ],
    stage: "runtime_identity",
  });
});

test("migration identity failures are distinguished from runtime identity failures", async () => {
  const config = {
    projectRef: "synthetic-test-project",
    databaseUrl: "runtime-url",
    directUrl: "validated-migration-url",
    supabaseUrl: "https://synthetic-test-project.supabase.co",
    anonKey: "synthetic-test-key",
    runtimeTlsConfigured: true,
    runtimePoolerOptionsConfigured: true,
  };
  const migrationError = new PrismaClientInitializationError(
    "Can't reach synthetic migration host",
  );

  await assert.rejects(
    runIntegrationCommand(
      "diagnose-migrate",
      config,
      {
        diagnoseMigrationEngine: () => {
          throw new Error("Schema Engine should not be reached");
        },
        observeRuntimeEndpoint: async () => undefined,
        verifyDatabaseTarget: async (_config, connectionUrl) => {
          if (!connectionUrl) {
            return {
              databaseName: "postgres",
              serverVersion: "synthetic",
            };
          }
          throw migrationError;
        },
        runMigrations: () => assert.fail("Must not run migrations"),
        verifyMigrations: async () =>
          assert.fail("Must not inspect migrations"),
        runTests: () => assert.fail("Must not run integration tests"),
      },
      () => assert.fail("Target should not be reported as verified"),
    ),
  );

  assert.equal(
    safeErrorDiagnostics(migrationError).stage,
    "migration_identity",
  );
});

test("integration suite failures are attributed to suite execution", async () => {
  const config = {
    projectRef: "synthetic-test-project",
    databaseUrl: "runtime-url",
    directUrl: "validated-migration-url",
    supabaseUrl: "https://synthetic-test-project.supabase.co",
    anonKey: "synthetic-test-key",
    runtimeTlsConfigured: true,
    runtimePoolerOptionsConfigured: true,
  };
  const suiteError = new Error("Synthetic test process failure");

  await assert.rejects(
    runIntegrationCommand(
      "test",
      config,
      {
        verifyDatabaseTarget: async () => ({
          databaseName: "postgres",
          serverVersion: "synthetic",
        }),
        runMigrations: () => assert.fail("Must not run migrations"),
        verifyMigrations: async () => undefined,
        runTests: () => {
          throw suiteError;
        },
      },
      () => undefined,
    ),
    suiteError,
  );

  assert.equal(safeErrorDiagnostics(suiteError).stage, "integration_suite");
});

test("Schema Engine failures are distinguished from Prisma Client identity failures", async () => {
  const config = {
    projectRef: "synthetic-test-project",
    databaseUrl: "runtime-url",
    directUrl: "validated-migration-url",
    supabaseUrl: "https://synthetic-test-project.supabase.co",
    anonKey: "synthetic-test-key",
    runtimeTlsConfigured: true,
    runtimePoolerOptionsConfigured: true,
  };
  const engineError = new Error(
    "Prisma Schema Engine read-only diagnostic failed",
  );

  await assert.rejects(
    runIntegrationCommand(
      "diagnose-migrate",
      config,
      {
        diagnoseMigrationEngine: () => {
          throw engineError;
        },
        observeRuntimeEndpoint: async () => undefined,
        verifyDatabaseTarget: async () => ({
          databaseName: "postgres",
          serverVersion: "synthetic",
        }),
        runMigrations: () => assert.fail("Must not run migrations"),
        verifyMigrations: async () =>
          assert.fail("Must not inspect migrations"),
        runTests: () => assert.fail("Must not run integration tests"),
      },
      () => undefined,
    ),
  );

  assert.equal(safeErrorDiagnostics(engineError).stage, "schema_engine_diff");
});

test("Schema Engine diagnostic uses Prisma's read-only datasource-to-empty diff", () => {
  const args = migrationEngineDiagnosticArgs();

  assert.deepEqual(args.slice(0, 3), [
    "migrate",
    "diff",
    "--from-schema-datasource",
  ]);
  assert.match(args[3], /prisma[\\/]schema\.prisma$/);
  assert.deepEqual(args.slice(4), ["--to-empty"]);
  assert.equal(
    args.some((argument) => argument.includes("://")),
    false,
  );
  assert.equal(args.includes("deploy"), false);
});

test("runtime observations expose only safe host shapes and fixed probe categories", () => {
  const host = "project-secret.aws-0-region.pooler.supabase.com";
  const observation = formatRuntimeEndpointObservation({
    host,
    port: 6543,
    tlsConfigured: true,
    poolerOptionsConfigured: true,
    dnsOutcome: "resolved",
    ipv4Count: 2,
    ipv6Count: 1,
    tcpOutcome: "connected",
    addressesTested: 3,
  });

  assert.equal(
    observation,
    "host=supabase-pooler port=6543 tls_url_configuration=pass pooler_url_configuration=pass dns=resolved ipv4=2 ipv6=1 tcp=connected addresses_tested=3",
  );
  for (const sensitiveValue of [
    host,
    "project-secret",
    "aws-0-region",
    "supabase.com",
  ]) {
    assert.equal(observation.includes(sensitiveValue), false);
  }
});

test("runtime observation formatting safely handles probe failures and unsafe values", () => {
  const observation = formatRuntimeEndpointObservation({
    host: "unknown-host.example.invalid",
    port: 6543,
    tlsConfigured: false,
    poolerOptionsConfigured: false,
    dnsOutcome: "getaddrinfo failed for secret-host",
    ipv4Count: -1,
    ipv6Count: Number.NaN,
    tcpOutcome: "raw connection error containing a password",
    addressesTested: -5,
  });

  assert.equal(
    observation,
    "host=unrecognized-host port=6543 tls_url_configuration=fail pooler_url_configuration=fail dns=unknown ipv4=0 ipv6=0 tcp=unknown addresses_tested=0",
  );
  assert.equal(observation.includes("secret-host"), false);
  assert.equal(observation.includes("password"), false);
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
    [
      "Error querying the database: failed to lookup address information: Name or service not known",
      "dns",
    ],
    [
      "Error querying the database: FATAL: password authentication failed for user synthetic-role",
      "authentication",
    ],
    ["Error opening a TLS connection: certificate verification failed", "tls"],
    [
      "Error querying the database: Connection timed out (os error 110)",
      "tcp_timeout",
    ],
    [
      "Error querying the database: error communicating with database: Connection refused",
      "connection_refused",
    ],
    ["could not connect to server: No route to host", "server_unreachable"],
    ["FATAL: too many connections for synthetic role", "server_unavailable"],
    ["server closed the connection unexpectedly", "connection_closed"],
  ] as const;

  for (const [message, expected] of cases) {
    assert.equal(classifyErrorCause(new Error(message)), expected);
  }
});

test("classifies Prisma initialization messages without a Prisma error code or cause", () => {
  const error = new Prisma.PrismaClientInitializationError(
    "Error querying the database: Connection timed out at synthetic-host:5432",
    "6.19.2",
  );

  assert.equal(Object.hasOwn(error, "message"), true);
  assert.equal(Object.hasOwn(error, "cause"), false);
  assert.equal(error.errorCode, undefined);
  assert.equal(classifyErrorCause(error), "tcp_timeout");

  const diagnostics = safeErrorDiagnostics(error);
  assert.deepEqual(diagnostics, {
    type: "PrismaClientInitializationError",
    prismaCode: "none",
    networkCode: "none",
    cause: "tcp_timeout",
    errors: [
      {
        type: "PrismaClientInitializationError",
        message:
          "Error querying the database: Connection timed out at [redacted-endpoint]",
        metadata: { clientVersion: "6.19.2" },
      },
    ],
  });
  assert.equal(JSON.stringify(diagnostics).includes("synthetic-host"), false);
  assert.equal(JSON.stringify(diagnostics).includes(":5432"), false);
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
    errors: [
      {
        type: "PrismaClientInitializationError",
        message: "Can't reach database server at [redacted-url]",
      },
      {
        type: "Error",
        message: "connect ECONNREFUSED synthetic-host",
        metadata: { code: "ECONNREFUSED" },
      },
    ],
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
    errors: [
      {
        type: "PrismaClientInitializationError",
        message: "synthetic initialization failure",
      },
      {
        type: "Error",
        message: "synthetic Prisma cause",
        metadata: { errorCode: "P1011" },
      },
    ],
  });
});

test("reports sanitized Prisma messages and safe metadata from nested errors", () => {
  const nested = Object.assign(
    new Error(
      "password authentication failed for user postgres.synthetic-project",
    ),
    {
      code: "28P01",
      meta: {
        database_error: "role postgres.synthetic-project does not exist",
        database_url: "postgresql://synthetic-user:synthetic-password@db.invalid/postgres",
        retryable: false,
      },
    },
  );
  const error = new PrismaClientInitializationError(
    "Unable to connect using postgresql://synthetic-user:synthetic-password@db.invalid/postgres",
    { cause: nested },
  );

  const diagnostics = safeErrorDiagnostics(error);
  const serialized = JSON.stringify(diagnostics);

  assert.equal(diagnostics.errors[0]?.message, "Unable to connect using [redacted-url]");
  assert.equal(
    diagnostics.errors[1]?.message,
    "password authentication failed for user [redacted]",
  );
  assert.deepEqual(diagnostics.errors[1]?.metadata, {
    code: "28P01",
    meta: {
      database_error: "role [redacted] does not exist",
      retryable: false,
    },
  });
  for (const secret of [
    "synthetic-user",
    "synthetic-password",
    "db.invalid",
    "postgresql://",
  ]) {
    assert.equal(serialized.includes(secret), false);
  }
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
