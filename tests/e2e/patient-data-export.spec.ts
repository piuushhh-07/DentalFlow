import { expect, test } from "@playwright/test";

const ownerEmail = process.env.E2E_OWNER_EMAIL;
const ownerPassword = process.env.E2E_OWNER_PASSWORD;
const staffEmail = process.env.E2E_STAFF_EMAIL;
const staffPassword = process.env.E2E_STAFF_PASSWORD;

async function signIn(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) {
  await page.goto("/");
  const emailField = page.getByRole("textbox", { name: "Email address" });
  await expect(emailField).toBeVisible({ timeout: 20_000 });
  await emailField.fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\\/clinic\\/[0-9a-f-]{36}(?:\\?.*)?$/i, {
    timeout: 30_000,
  });
  const clinicId = page.url().match(/\\/clinic\\/([0-9a-f-]{36})/i)?.[1];
  expect(clinicId).toBeTruthy();
  return clinicId!;
}

test("clinic OWNER can export a patient record as a private JSON attachment", async ({
  page,
}) => {
  test.skip(
    !ownerEmail || !ownerPassword,
    "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD for a dedicated staging OWNER.",
  );

  const clinicId = await signIn(page, ownerEmail!, ownerPassword!);
  await page.goto(`/clinic/${clinicId}/patients`);

  const patientLink = page
    .locator(`a[href^="/clinic/${clinicId}/patients/"]`)
    .first();
  test.skip(
    (await patientLink.count()) === 0,
    "The staging clinic needs at least one synthetic patient for export coverage.",
  );

  await patientLink.click();
  await expect(
    page.getByRole("link", { name: "Export patient data", exact: true }),
  ).toBeVisible();

  const exportHref = await page
    .getByRole("link", { name: "Export patient data", exact: true })
    .getAttribute("href");
  expect(exportHref).toBeTruthy();

  const response = await page.request.get(exportHref!);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["content-disposition"]).toContain("attachment");
  expect(response.headers()["content-type"]).toContain("application/json");

  const payload = await response.json();
  expect(payload.patient).toBeTruthy();
  expect(payload.patient.id).toBeTruthy();
  expect(payload.patient.clinicId).toBe(clinicId);
  expect(payload.exportedAt).toBeTruthy();
});

test("clinic STAFF cannot export patient data even with a direct endpoint request", async ({
  page,
}) => {
  test.skip(
    !staffEmail || !staffPassword,
    "Set E2E_STAFF_EMAIL and E2E_STAFF_PASSWORD for a dedicated staging STAFF.",
  );

  const clinicId = await signIn(page, staffEmail!, staffPassword!);
  await page.goto(`/clinic/${clinicId}/patients`);

  const patientLink = page
    .locator(`a[href^="/clinic/${clinicId}/patients/"]`)
    .first();
  test.skip(
    (await patientLink.count()) === 0,
    "The staging clinic needs at least one synthetic patient for export coverage.",
  );

  await patientLink.click();
  await expect(
    page.getByRole("link", { name: "Export patient data", exact: true }),
  ).toHaveCount(0);

  const patientId = page.url().match(/\\/patients\\/([0-9a-f-]{36})/i)?.[1];
  expect(patientId).toBeTruthy();

  const response = await page.request.get(
    `/clinic/${clinicId}/patients/${patientId}/export`,
  );
  expect(response.status()).toBe(403);
  expect(await response.json()).toEqual({
    error: "Owner access is required.",
  });
});
