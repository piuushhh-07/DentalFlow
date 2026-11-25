import { expect, test } from "@playwright/test";

const email = process.env.E2E_OWNER_EMAIL;
const password = process.env.E2E_OWNER_PASSWORD;

test("owner can inspect appointment creation form and validation (read-only)", async ({
  page,
}) => {
  test.skip(
    !email || !password,
    "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD for staging QA",
  );

  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "";

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  page.on("response", (response) => {
    if (
      baseUrl &&
      response.url().startsWith(baseUrl) &&
      response.status() >= 400
    ) {
      failedRequests.push(`${response.status()} ${response.url()}`);
    }
  });

  // Sign in
  await page.goto("/");

  const emailField = page.getByRole("textbox", {
    name: /email address/i,
  });

  await expect(emailField).toBeVisible({ timeout: 20000 });
  await emailField.fill(email!);
  await page.getByLabel(/password/i).fill(password!);

  await page
    .getByRole("button", { name: /^sign in$/i })
    .click({ force: true, timeout: 10000 });

  await expect(page).toHaveURL(/\/clinic\/[0-9a-f-]{36}/i, {
    timeout: 45000,
  });

  const clinicId = page.url().match(/\/clinic\/([0-9a-f-]{36})/i)?.[1];

  expect(clinicId).toBeTruthy();

  // Open appointments
  await page.goto(`/clinic/${clinicId}/appointments`);

  await expect(
    page.getByRole("heading", {
      name: "Appointments",
      exact: true,
    }),
  ).toBeVisible({ timeout: 30000 });

  // Open the new appointment form
  const newAppointmentButton = page.getByRole("button", {
    name: /New appointment/i,
  });

  await expect(newAppointmentButton).toBeVisible();
  await newAppointmentButton.click();

  // Find the appointment form by its unique patient selector.
  const form = page.locator("form").filter({
    has: page.locator('select[name="patientId"]'),
  });

  await expect(form).toBeVisible();

  // Verify the creation form fields
  await expect(form.getByLabel("Patient")).toBeVisible();

  await expect(
    form.getByLabel("Linked treatment visit (optional)"),
  ).toBeVisible();

  await expect(form.getByLabel("Date")).toBeVisible();

  await expect(form.getByLabel("Time (Asia/Kolkata)")).toBeVisible();

  await expect(form.getByLabel("Duration (minutes)")).toBeVisible();
  await expect(form.getByLabel("Dentist")).toBeVisible();
  await expect(form.getByLabel("Chair")).toBeVisible();
  await expect(form.getByLabel("Appointment type")).toBeVisible();
  await expect(form.getByLabel("Notes (optional)")).toBeVisible();

  // Verify default duration and HTML constraints
  const duration = form.locator('input[name="durationMinutes"]');

  await expect(duration).toHaveValue("30");
  await expect(duration).toHaveAttribute("min", "5");
  await expect(duration).toHaveAttribute("max", "480");

  // Verify required fields
  const requiredFields = [
    'select[name="patientId"]',
    'input[name="date"]',
    'input[name="time"]',
    'input[name="durationMinutes"]',
    'select[name="dentistId"]',
    'select[name="chairId"]',
    'input[name="type"]',
  ];

  for (const selector of requiredFields) {
    await expect(form.locator(selector)).toHaveAttribute("required", "");
  }

  // Verify patient, dentist and chair options exist
  const patientOptions = await form
    .locator('select[name="patientId"] option')
    .count();

  const dentistOptions = await form
    .locator('select[name="dentistId"] option')
    .count();

  const chairOptions = await form
    .locator('select[name="chairId"] option')
    .count();

  expect(patientOptions).toBeGreaterThan(1);
  expect(dentistOptions).toBeGreaterThan(1);
  expect(chairOptions).toBeGreaterThan(1);

  // Verify submit button is present but do not submit
  const createButton = form.getByRole("button", {
    name: "Create appointment",
  });

  await expect(createButton).toBeVisible();

  // Check native browser validation without submitting the form.
  const validation = await form.evaluate((element) => {
    const formElement = element as HTMLFormElement;

    const requiredPatient = formElement.querySelector(
      'select[name="patientId"]',
    ) as HTMLSelectElement | null;

    return {
      valid: formElement.checkValidity(),
      patientMissing: requiredPatient?.validity.valueMissing ?? false,
    };
  });

  expect(validation.valid).toBe(false);
  expect(validation.patientMissing).toBe(true);

  // No form submission is performed.
  expect(pageErrors, "Browser JavaScript errors").toEqual([]);
  expect(failedRequests, "Failed same-origin requests").toEqual([]);
});
