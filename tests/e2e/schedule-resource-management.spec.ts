import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_OWNER_EMAIL;
const password = process.env.E2E_OWNER_PASSWORD;
const resourceClinicId = process.env.E2E_RESOURCE_TEST_CLINIC_ID;
const allowedResourceTestHost = process.env.E2E_RESOURCE_TEST_ALLOWED_HOST;
const mutationsEnabled = process.env.E2E_ALLOW_RESOURCE_MUTATIONS === "1";
const productionHost = "dental-flow-brown.vercel.app";

async function signInAndOpenSchedule(page: Page): Promise<string> {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Email address" }).fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/clinic\/[0-9a-f-]{36}(?:\?.*)?$/i, {
    timeout: 30_000,
  });

  const clinicId = page.url().match(/\/clinic\/([0-9a-f-]{36})/i)?.[1];
  expect(clinicId).toBeTruthy();
  expect(clinicId).toBe(resourceClinicId);

  await page.locator('a[href$="/appointments"]').first().click();
  await expect(
    page.getByRole("heading", { name: "Schedule resources" }),
  ).toBeVisible({ timeout: 20_000 });
  return clinicId!;
}

async function submitCreate(
  page: Page,
  inputId: "dentist-name" | "chair-name",
  name: string,
  successMessage: string,
) {
  const input = page.locator(`#${inputId}`);
  await input.fill(name);
  await input.locator("xpath=ancestor::form").getByRole("button").click();
  await expect(page.getByText(successMessage, { exact: true })).toBeVisible();
}

async function renameResource(
  page: Page,
  originalName: string,
  nextName: string,
) {
  const resource = page.locator("article").filter({ hasText: originalName });
  await resource.getByLabel(`Rename ${originalName}`).fill(nextName);
  await resource.getByRole("button", { name: "Rename" }).click();
}

test.describe("OWNER schedule resource management (staging only)", () => {
  test.skip(
    !email || !password || !resourceClinicId || !allowedResourceTestHost || !mutationsEnabled,
    "Set OWNER credentials, E2E_RESOURCE_TEST_CLINIC_ID, E2E_RESOURCE_TEST_ALLOWED_HOST, and E2E_ALLOW_RESOURCE_MUTATIONS=1 to enable write tests.",
  );

  test("creates, rejects duplicates, renames, and deactivates dentists and chairs", async ({
    page,
  }) => {
    const configuredBaseUrl = test.info().project.use.baseURL as string;
    const host = new URL(configuredBaseUrl).hostname;
    expect(host).toBe(allowedResourceTestHost);
    expect(
      host,
      "Resource mutation tests must never run against the production DentalFlow host.",
    ).not.toBe(productionHost);

    await signInAndOpenSchedule(page);

    const suffix = Date.now().toString();
    const dentistOne = `E2E Dentist One ${suffix}`;
    const dentistTwo = `E2E Dentist Two ${suffix}`;
    const renamedDentist = `E2E Dentist Renamed ${suffix}`;
    const chairOne = `E2E Chair One ${suffix}`;
    const chairTwo = `E2E Chair Two ${suffix}`;
    const renamedChair = `E2E Chair Renamed ${suffix}`;

    await submitCreate(
      page,
      "dentist-name",
      dentistOne,
      "Dentist added successfully.",
    );
    await expect(page.locator("article").filter({ hasText: dentistOne })).toBeVisible();

    await submitCreate(
      page,
      "chair-name",
      chairOne,
      "Treatment chair added successfully.",
    );
    await expect(page.locator("article").filter({ hasText: chairOne })).toBeVisible();

    // Duplicate creation must be rejected without adding another resource.
    await page.locator("#dentist-name").fill(dentistOne);
    await page.locator("#dentist-name").locator("xpath=ancestor::form").getByRole("button").click();
    await expect(page.getByText(/already exists/i)).toBeVisible();

    await page.locator("#chair-name").fill(chairOne);
    await page.locator("#chair-name").locator("xpath=ancestor::form").getByRole("button").click();
    await expect(page.getByText(/already exists/i).last()).toBeVisible();

    await submitCreate(
      page,
      "dentist-name",
      dentistTwo,
      "Dentist added successfully.",
    );
    await submitCreate(
      page,
      "chair-name",
      chairTwo,
      "Treatment chair added successfully.",
    );

    await renameResource(page, dentistOne, renamedDentist);
    await expect(page.locator("article").filter({ hasText: renamedDentist })).toBeVisible();
    await renameResource(page, chairOne, renamedChair);
    await expect(page.locator("article").filter({ hasText: renamedChair })).toBeVisible();

    // Renaming a second resource to an existing name must be rejected.
    await renameResource(page, dentistTwo, renamedDentist);
    await expect(page.getByText(/already exists/i).last()).toBeVisible();
    await renameResource(page, chairTwo, renamedChair);
    await expect(page.getByText(/already exists/i).last()).toBeVisible();

    const dentistCard = page.locator("article").filter({ hasText: renamedDentist });
    await dentistCard.getByRole("button", { name: "Deactivate" }).click();
    await expect(dentistCard.getByText("Inactive", { exact: true })).toBeVisible();

    const chairCard = page.locator("article").filter({ hasText: renamedChair });
    await chairCard.getByRole("button", { name: "Deactivate" }).click();
    await expect(chairCard.getByText("Inactive", { exact: true })).toBeVisible();

    // Deactivate the second resources too, so the disposable clinic is left tidy.
    const secondDentistCard = page.locator("article").filter({ hasText: dentistTwo });
    await secondDentistCard.getByRole("button", { name: "Deactivate" }).click();
    await expect(secondDentistCard.getByText("Inactive", { exact: true })).toBeVisible();

    const secondChairCard = page.locator("article").filter({ hasText: chairTwo });
    await secondChairCard.getByRole("button", { name: "Deactivate" }).click();
    await expect(secondChairCard.getByText("Inactive", { exact: true })).toBeVisible();
  });
});
