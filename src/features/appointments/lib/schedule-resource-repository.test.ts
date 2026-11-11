import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test, { before, type TestContext } from "node:test";

type Repository =
  typeof import("@/features/appointments/lib/appointment-repository");

type ResourceModel = "clinicDentist" | "treatmentChair";

type ResourceDelegate = Readonly<{
  findFirst: (args: unknown) => Promise<unknown>;
  create: (args: unknown) => Promise<unknown>;
  updateMany: (args: unknown) => Promise<{ count: number }>;
}>;

const clinicAId = "10000000-0000-4000-8000-000000000001";
const clinicBId = "10000000-0000-4000-8000-000000000002";
const dentistId = "40000000-0000-4000-8000-000000000001";
const chairId = "50000000-0000-4000-8000-000000000001";

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

function mockResourceModel(
  context: TestContext,
  model: ResourceModel,
  delegate: ResourceDelegate,
) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(prisma, model);
  Object.defineProperty(prisma, model, {
    configurable: true,
    value: delegate,
  });

  context.after(() => {
    if (originalDescriptor) {
      Object.defineProperty(prisma, model, originalDescriptor);
    } else {
      Reflect.deleteProperty(prisma, model);
    }
  });
}

test("createScheduleResource creates a dentist scoped to the requested clinic", async (t) => {
  let createArgs: unknown;
  let duplicateLookupArgs: unknown;
  mockResourceModel(t, "clinicDentist", {
    findFirst: async (args) => {
      duplicateLookupArgs = args;
      return null;
    },
    create: async (args) => {
      createArgs = args;
      return { id: dentistId };
    },
    updateMany: async () => ({ count: 1 }),
  });

  const result = await repository.createScheduleResource(
    clinicAId,
    "dentist",
    "Dr. Shah",
  );

  assert.deepEqual(result, { id: dentistId });
  assert.deepEqual(duplicateLookupArgs, {
    where: {
      clinicId: clinicAId,
      name: { equals: "Dr. Shah", mode: "insensitive" },
    },
    select: { id: true },
  });
  assert.deepEqual(createArgs, {
    data: { clinicId: clinicAId, name: "Dr. Shah" },
    select: { id: true },
  });
});

test("createScheduleResource creates a chair scoped to the requested clinic", async (t) => {
  let createArgs: unknown;
  mockResourceModel(t, "treatmentChair", {
    findFirst: async () => null,
    create: async (args) => {
      createArgs = args;
      return { id: chairId };
    },
    updateMany: async () => ({ count: 1 }),
  });

  const result = await repository.createScheduleResource(
    clinicBId,
    "chair",
    "Chair 2",
  );

  assert.deepEqual(result, { id: chairId });
  assert.deepEqual(createArgs, {
    data: { clinicId: clinicBId, label: "Chair 2" },
    select: { id: true },
  });
});

test("createScheduleResource rejects a duplicate dentist name within the clinic", async (t) => {
  let createCalls = 0;
  mockResourceModel(t, "clinicDentist", {
    findFirst: async () => ({ id: dentistId }),
    create: async () => {
      createCalls += 1;
      return { id: dentistId };
    },
    updateMany: async () => ({ count: 1 }),
  });

  await assert.rejects(
    repository.createScheduleResource(clinicAId, "dentist", "Dr. Shah"),
    repository.ScheduleResourceDuplicateError,
  );
  assert.equal(createCalls, 0);
});

test("createScheduleResource rejects a duplicate chair label within the clinic", async (t) => {
  let lookupArgs: unknown;
  let createCalls = 0;
  mockResourceModel(t, "treatmentChair", {
    findFirst: async (args) => {
      lookupArgs = args;
      return { id: chairId };
    },
    create: async () => {
      createCalls += 1;
      return { id: chairId };
    },
    updateMany: async () => ({ count: 1 }),
  });

  await assert.rejects(
    repository.createScheduleResource(clinicBId, "chair", "Chair 2"),
    repository.ScheduleResourceDuplicateError,
  );
  assert.deepEqual(lookupArgs, {
    where: {
      clinicId: clinicBId,
      label: { equals: "Chair 2", mode: "insensitive" },
    },
    select: { id: true },
  });
  assert.equal(createCalls, 0);
});

test("renameScheduleResource renames a dentist without leaving its clinic", async (t) => {
  let lookupArgs: unknown;
  let updateArgs: unknown;
  mockResourceModel(t, "clinicDentist", {
    findFirst: async (args) => {
      lookupArgs = args;
      return null;
    },
    create: async () => ({ id: dentistId }),
    updateMany: async (args) => {
      updateArgs = args;
      return { count: 1 };
    },
  });

  await repository.renameScheduleResource(
    clinicAId,
    "dentist",
    dentistId,
    "Dr. Mehta",
  );

  assert.deepEqual(lookupArgs, {
    where: {
      clinicId: clinicAId,
      id: { not: dentistId },
      name: { equals: "Dr. Mehta", mode: "insensitive" },
    },
    select: { id: true },
  });
  assert.deepEqual(updateArgs, {
    where: { id: dentistId, clinicId: clinicAId },
    data: { name: "Dr. Mehta" },
  });
});

test("renameScheduleResource renames a chair without leaving its clinic", async (t) => {
  let updateArgs: unknown;
  mockResourceModel(t, "treatmentChair", {
    findFirst: async () => null,
    create: async () => ({ id: chairId }),
    updateMany: async (args) => {
      updateArgs = args;
      return { count: 1 };
    },
  });

  await repository.renameScheduleResource(
    clinicBId,
    "chair",
    chairId,
    "Surgery Chair",
  );

  assert.deepEqual(updateArgs, {
    where: { id: chairId, clinicId: clinicBId },
    data: { label: "Surgery Chair" },
  });
});

test("renameScheduleResource rejects a duplicate dentist name and leaves the record unchanged", async (t) => {
  let updateCalls = 0;
  mockResourceModel(t, "clinicDentist", {
    findFirst: async () => ({ id: "another-dentist" }),
    create: async () => ({ id: dentistId }),
    updateMany: async () => {
      updateCalls += 1;
      return { count: 1 };
    },
  });

  await assert.rejects(
    repository.renameScheduleResource(
      clinicAId,
      "dentist",
      dentistId,
      "Dr. Mehta",
    ),
    repository.ScheduleResourceDuplicateError,
  );
  assert.equal(updateCalls, 0);
});

test("renameScheduleResource rejects a duplicate chair label and leaves the record unchanged", async (t) => {
  let updateCalls = 0;
  mockResourceModel(t, "treatmentChair", {
    findFirst: async () => ({ id: "another-chair" }),
    create: async () => ({ id: chairId }),
    updateMany: async () => {
      updateCalls += 1;
      return { count: 1 };
    },
  });

  await assert.rejects(
    repository.renameScheduleResource(
      clinicBId,
      "chair",
      chairId,
      "Surgery Chair",
    ),
    repository.ScheduleResourceDuplicateError,
  );
  assert.equal(updateCalls, 0);
});

test("setScheduleResourceActive deactivates a dentist using both resource and clinic identifiers", async (t) => {
  let updateArgs: unknown;
  mockResourceModel(t, "clinicDentist", {
    findFirst: async () => null,
    create: async () => ({ id: dentistId }),
    updateMany: async (args) => {
      updateArgs = args;
      return { count: 1 };
    },
  });

  await repository.setScheduleResourceActive(
    clinicAId,
    "dentist",
    dentistId,
    false,
  );

  assert.deepEqual(updateArgs, {
    where: { id: dentistId, clinicId: clinicAId },
    data: { active: false },
  });
});

test("setScheduleResourceActive deactivates a chair using both resource and clinic identifiers", async (t) => {
  let updateArgs: unknown;
  mockResourceModel(t, "treatmentChair", {
    findFirst: async () => null,
    create: async () => ({ id: chairId }),
    updateMany: async (args) => {
      updateArgs = args;
      return { count: 1 };
    },
  });

  await repository.setScheduleResourceActive(
    clinicBId,
    "chair",
    chairId,
    false,
  );

  assert.deepEqual(updateArgs, {
    where: { id: chairId, clinicId: clinicBId },
    data: { active: false },
  });
});

test("setScheduleResourceActive reports a dentist from another clinic as not found", async (t) => {
  let updateArgs: unknown;
  mockResourceModel(t, "clinicDentist", {
    findFirst: async () => null,
    create: async () => ({ id: dentistId }),
    updateMany: async (args) => {
      updateArgs = args;
      return { count: 0 };
    },
  });

  await assert.rejects(
    repository.setScheduleResourceActive(
      clinicAId,
      "dentist",
      dentistId,
      false,
    ),
    repository.ScheduleResourceNotFoundError,
  );
  assert.deepEqual(updateArgs, {
    where: { id: dentistId, clinicId: clinicAId },
    data: { active: false },
  });
});

test("setScheduleResourceActive reports a chair from another clinic as not found", async (t) => {
  let updateArgs: unknown;
  mockResourceModel(t, "treatmentChair", {
    findFirst: async () => null,
    create: async () => ({ id: chairId }),
    updateMany: async (args) => {
      updateArgs = args;
      return { count: 0 };
    },
  });

  await assert.rejects(
    repository.setScheduleResourceActive(
      clinicAId,
      "chair",
      chairId,
      false,
    ),
    repository.ScheduleResourceNotFoundError,
  );
  assert.deepEqual(updateArgs, {
    where: { id: chairId, clinicId: clinicAId },
    data: { active: false },
  });
});


test("renameScheduleResource cannot rename a dentist owned by another clinic", async (t) => {
  let updateArgs: unknown;
  mockResourceModel(t, "clinicDentist", {
    findFirst: async () => null,
    create: async () => ({ id: dentistId }),
    updateMany: async (args) => {
      updateArgs = args;
      return { count: 0 };
    },
  });

  await assert.rejects(
    repository.renameScheduleResource(
      clinicAId,
      "dentist",
      dentistId,
      "Dr. Mehta",
    ),
    repository.ScheduleResourceNotFoundError,
  );
  assert.deepEqual(updateArgs, {
    where: { id: dentistId, clinicId: clinicAId },
    data: { name: "Dr. Mehta" },
  });
});

test("renameScheduleResource cannot rename a chair owned by another clinic", async (t) => {
  let updateArgs: unknown;
  mockResourceModel(t, "treatmentChair", {
    findFirst: async () => null,
    create: async () => ({ id: chairId }),
    updateMany: async (args) => {
      updateArgs = args;
      return { count: 0 };
    },
  });

  await assert.rejects(
    repository.renameScheduleResource(
      clinicAId,
      "chair",
      chairId,
      "Surgery Chair",
    ),
    repository.ScheduleResourceNotFoundError,
  );
  assert.deepEqual(updateArgs, {
    where: { id: chairId, clinicId: clinicAId },
    data: { label: "Surgery Chair" },
  });
});
