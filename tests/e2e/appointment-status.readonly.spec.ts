import { expect, test } from "@playwright/test";

const email = process.env.E2E_OWNER_EMAIL;
const password = process.env.E2E_OWNER_PASSWORD;

const statuses = [
  "SCHEDULED",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;

test("owner can inspect appointment statuses and filters (read-only)", async ({
  page,
}) => {
  test.skip(
    !email || !password,
    "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD for staging QA",
  );

  const pageErrors: string[] = [];
  const failedResponses: string[] = [];
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "";

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  // Monitor actual HTTP error responses, not navigation aborts.
  page.on("response", (response) => {
    if (
      baseUrl &&
      response.url().startsWith(baseUrl) &&
      response.status() >= 400
    ) {
      failedResponses.push(`${response.status()} ${response.url()}`);
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

  // Verify all status filter options
  const statusFilter = page.getByLabel("Filter by status");

  await expect(statusFilter).toBeVisible();
  await expect(statusFilter.locator("option")).toHaveCount(8);

  await expect(statusFilter.locator('option[value=""]')).toHaveText(
    "All statuses",
  );

  for (const status of statuses) {
    await expect(statusFilter.locator(`option[value="${status}"]`)).toHaveCount(
      1,
    );
  }

  // Test filtering and reset
  await statusFilter.selectOption("CONFIRMED");
  await expect(statusFilter).toHaveValue("CONFIRMED");

  const resetButton = page.getByRole("button", {
    name: /reset filters/i,
  });

  await expect(resetButton).toBeVisible();
  await resetButton.click();

  await expect(statusFilter).toHaveValue("");

  // Open an existing appointment without modifying it
  const appointmentCard = page
    .getByRole("button")
    .filter({
      hasText:
        /SCHEDULED|CONFIRMED|CHECKED IN|IN PROGRESS|COMPLETED|CANCELLED|NO SHOW/i,
    })
    .first();

  await expect(appointmentCard).toBeVisible();
  await appointmentCard.click();

  // Locate appointment status form
  const statusForm = page.locator("form").filter({
    has: page.locator('select[name="status"]'),
  });

  await expect(statusForm).toBeVisible();

  const appointmentStatus = statusForm.locator('select[name="status"]');

  await expect(appointmentStatus).toBeVisible();
  await expect(appointmentStatus.locator("option")).toHaveCount(7);

  // Verify all seven statuses
  for (const status of statuses) {
    await expect(
      appointmentStatus.locator(`option[value="${status}"]`),
    ).toHaveCount(1);
  }

  const currentStatus = await appointmentStatus.inputValue();

  expect(statuses).toContain(currentStatus as (typeof statuses)[number]);

  // Verify Update button without submitting
  await expect(
    statusForm.getByRole("button", { name: /^update$/i }),
  ).toBeVisible();

  // Verify Edit appointment visibility rule
  const editButton = page.getByRole("button", {
    name: "Edit appointment",
    exact: true,
  });

  if (currentStatus === "COMPLETED" || currentStatus === "CANCELLED") {
    await expect(editButton).toHaveCount(0);
  } else {
    await expect(editButton).toBeVisible();
  }

  // Final browser and HTTP response checks
  expect(pageErrors, "Browser JavaScript errors").toEqual([]);
  expect(failedResponses, "Failed same-origin HTTP responses").toEqual([]);
});
