import { expect, test } from "@playwright/test";

const email = process.env.E2E_OWNER_EMAIL;
const password = process.env.E2E_OWNER_PASSWORD;

test("owner can navigate the complete clinic workspace", async ({ page }) => {
  test.setTimeout(180000);

  test.skip(!email || !password, "Owner staging credentials are required");

  const pageErrors: string[] = [];
  const results: { section: string; url: string; heading: string }[] = [];
  const failures: string[] = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  const emailField = page.getByRole("textbox", {
    name: /email address/i,
  });

  if (await emailField.isVisible().catch(() => false)) {
    await emailField.fill(email!);
    await page.getByLabel(/password/i).fill(password!);
    await page.getByRole("button", { name: /^sign in$/i }).click({
      force: true,
    });
  }

  await expect(page).toHaveURL(/\/clinic\/[0-9a-f-]{36}/i, {
    timeout: 45000,
  });

  const sections = [
    "Dashboard",
    "Appointments",
    "Patients",
    "Leads",
    "Treatments",
    "Patient billing",
    "Follow-ups",
    "Recalls",
    "Templates",
    "Reports",
    "Insurance",
  ];

  for (const section of sections) {
    try {
      const item = page.getByText(section, { exact: true }).first();

      await expect(item).toBeVisible({ timeout: 10000 });
      await item.click({ timeout: 10000 });

      await page.waitForTimeout(1000);

      const url = page.url();
      const heading = await page
        .locator("h1")
        .first()
        .innerText({
          timeout: 5000,
        })
        .catch(() => "No H1 heading");

      const body = await page.locator("body").innerText();

      if (
        /This page could not be found|Application error|Internal Server Error/i.test(
          body,
        )
      ) {
        failures.push(`${section}: error page at ${url}`);
      } else {
        results.push({ section, url, heading });
      }
    } catch (error) {
      failures.push(`${section}: ${String(error)}`);
    }
  }

  await test.info().attach("workspace-navigation-results.json", {
    body: JSON.stringify({ results, failures, pageErrors }, null, 2),
    contentType: "application/json",
  });

  console.log("WORKSPACE RESULTS:", JSON.stringify(results, null, 2));
  console.log("WORKSPACE FAILURES:", JSON.stringify(failures, null, 2));
  console.log("BROWSER ERRORS:", JSON.stringify(pageErrors, null, 2));

  expect(failures, failures.join("\n")).toEqual([]);
  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
