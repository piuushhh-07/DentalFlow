import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test, { before, type TestContext } from "node:test";

import { Prisma } from "@prisma/client";

type TransactionCallback<T> = (
  transaction: Prisma.TransactionClient,
) => Promise<T>;

type TransactionOutcome = Error | "success";

type Repository =
  typeof import("@/features/appointments/lib/appointment-repository");

const clinicId = "10000000-0000-4000-8000-000000000001";
const appointmentId = "20000000-0000-4000-8000-000000000001";
const patientId = "30000000-0000-4000-8000-000000000001";
const dentistId = "40000000-0000-4000-8000-000000000001";
const chairId = "50000000-0000-4000-8000-000000000001";
const appointmentInput = {
  patientId,
  treatmentVisitId: null,
  date: "2026-11-12",
  time: "09:30",
  durationMinutes: 30,
  dentistId,
  chairId,
  type: "Consultation",
  notes: null,
};

let repository: Repository;
let prisma: typeof import("@/lib/db/prisma").prisma;

before(async () => {
  type RegisterHooks = (hooks: {
    resolve: (
      specifier: string,
      context: object,
      nextResolve: (
        specifier: string,
        context: object,
      ) => { url: string; shortCircuit?: boolean },
    ) => { url: string; shortCircuit?: boolean };
  }) => () => void;
  const { registerHooks } = (await import("node:module")) as unknown as {
    registerHooks: RegisterHooks;
  };
  const serverOnlyStub = pathToFileURL(
    resolve("node_modules/next/dist/compiled/server-only/empty.js"),
  ).href;

  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "server-only") {
        return { url: serverOnlyStub, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });

  [{ prisma }, repository] = await Promise.all([
    import("@/lib/db/prisma"),
    import("@/features/appointments/lib/appointment-repository"),
  ]);
});

function serializationFailure(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    "Transaction failed due to a write conflict or a deadlock. Please retry your transaction",
    {
      code: "P2034",
      clientVersion: Prisma.prismaVersion.client,
    },
  );
}

function createTransactionClient(state: {
  createdAppointments: string[];
  requestApprovalUpdates?: number;
}) {
  let nextAppointment = 0;
  const request = {
    id: "60000000-0000-4000-8000-000000000001",
    clinicId,
    patientName: "Asha Patel",
    phoneNumber: "+919876543210",
    requestedAt: new Date("2026-11-12T04:00:00.000Z"),
    durationMinutes: 30,
    dentistId,
    chairId,
    type: "Consultation",
    notes: null,
  };
  const transaction = {
    appointment: {
      findFirst: async () => ({ id: appointmentId, status: "SCHEDULED" }),
      findMany: async () => [],
      updateMany: async () => ({ count: 1 }),
      create: async () => {
        const id = `created-appointment-${++nextAppointment}`;
        state.createdAppointments.push(id);
        return { id };
      },
    },
    appointmentRequest: {
      findFirst: async () => request,
      updateMany: async () => {
        state.requestApprovalUpdates = (state.requestApprovalUpdates ?? 0) + 1;
        return { count: 1 };
      },
    },
    patient: {
      findFirst: async () => ({ id: patientId }),
    },
    clinicDentist: {
      findFirst: async () => ({ id: dentistId, name: "Dr. Shah" }),
    },
    treatmentChair: {
      findFirst: async () => ({ id: chairId, label: "Chair 1" }),
    },
    clinicSubscription: {
      findFirst: async () => null,
    },
  };

  return transaction as unknown as Prisma.TransactionClient;
}

function mockTransactions(
  context: TestContext,
  outcomes: TransactionOutcome[],
  transaction: Prisma.TransactionClient,
) {
  let attempts = 0;
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    prisma,
    "$transaction",
  );

  Object.defineProperty(prisma, "$transaction", {
    configurable: true,
    value: async (callback: unknown) => {
      const outcome = outcomes[attempts++];
      if (outcome instanceof Error) throw outcome;
      if (typeof callback !== "function") {
        throw new Error("Expected an interactive Prisma transaction callback.");
      }
      const work = callback as TransactionCallback<unknown>;
      return work(transaction);
    },
  });

  context.after(() => {
    if (originalDescriptor) {
      Object.defineProperty(prisma, "$transaction", originalDescriptor);
    } else {
      Reflect.deleteProperty(prisma, "$transaction");
    }
  });

  return () => attempts;
}

test("updateClinicAppointment retries a serialization failure once", async (t) => {
  const state = { createdAppointments: [] as string[] };
  const getAttempts = mockTransactions(
    t,
    [serializationFailure(), "success"],
    createTransactionClient(state),
  );

  const result = await repository.updateClinicAppointment(
    clinicId,
    appointmentId,
    appointmentInput,
  );

  assert.deepEqual(result, { id: appointmentId });
  assert.equal(getAttempts(), 2);
});

test("updateClinicAppointment propagates a second serialization failure", async (t) => {
  const secondError = serializationFailure();
  const getAttempts = mockTransactions(
    t,
    [serializationFailure(), secondError],
    createTransactionClient({ createdAppointments: [] }),
  );

  await assert.rejects(
    repository.updateClinicAppointment(
      clinicId,
      appointmentId,
      appointmentInput,
    ),
    (error) => error === secondError,
  );
  assert.equal(getAttempts(), 2);
});

test("updateClinicAppointment does not retry other errors", async (t) => {
  const error = new Error("Unexpected transaction failure");
  const getAttempts = mockTransactions(
    t,
    [error, "success"],
    createTransactionClient({ createdAppointments: [] }),
  );

  await assert.rejects(
    repository.updateClinicAppointment(
      clinicId,
      appointmentId,
      appointmentInput,
    ),
    (caught) => caught === error,
  );
  assert.equal(getAttempts(), 1);
});

test("approveAppointmentRequest retries a serialization failure without duplicate appointments", async (t) => {
  const state = {
    createdAppointments: [] as string[],
    requestApprovalUpdates: 0,
  };
  const getAttempts = mockTransactions(
    t,
    [serializationFailure(), "success"],
    createTransactionClient(state),
  );

  const result = await repository.approveAppointmentRequest(
    clinicId,
    "request-1",
  );

  assert.deepEqual(result, { id: "created-appointment-1" });
  assert.equal(getAttempts(), 2);
  assert.deepEqual(state.createdAppointments, ["created-appointment-1"]);
  assert.equal(state.requestApprovalUpdates, 1);
});

test("approveAppointmentRequest propagates a second serialization failure", async (t) => {
  const secondError = serializationFailure();
  const getAttempts = mockTransactions(
    t,
    [serializationFailure(), secondError],
    createTransactionClient({ createdAppointments: [] }),
  );

  await assert.rejects(
    repository.approveAppointmentRequest(clinicId, "request-1"),
    (error) => error === secondError,
  );
  assert.equal(getAttempts(), 2);
});

test("approveAppointmentRequest does not retry other errors", async (t) => {
  const error = new Error("Unexpected transaction failure");
  const getAttempts = mockTransactions(
    t,
    [error, "success"],
    createTransactionClient({ createdAppointments: [] }),
  );

  await assert.rejects(
    repository.approveAppointmentRequest(clinicId, "request-1"),
    (caught) => caught === error,
  );
  assert.equal(getAttempts(), 1);
});
