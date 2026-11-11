import { expect, test } from "@playwright/test";

const email = process.env.E2E_OWNER_EMAIL;
const password = process.env.E2E_OWNER_PASSWORD;

test("owner can see the clinic setup checklist and open the schedule (read-only)", async ({
  page,
}) => {
  test.skip(
    !email || !password,
    "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD for the test account.",
  );

  await page.goto("/");

  const emailField = page.getByRole("textbox", { name: "Email address" });
  await expect(emailField).toBeVisible({ timeout: 20_000 });
  await emailField.fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\\/clinic\\/[0-9a-f-]{36}(?:\\?.*)?$/i, {
    timeout: 30_000,
  });

  await expect(
    page.getByRole("heading", { name: "Your clinic setup", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Set up dentists and chairs")).toBeVisible();
  await expect(page.getByText("Add your first patient")).toBeVisible();
  await expect(page.getByText("Schedule your first appointment")).toBeVisible();
  await expect(page.getByRole("link", { name: /Manage team/ })).toBeVisible();

  const scheduleLink = page.locator('a[href$="/appointments"]').first();
  await expect(scheduleLink).toBeVisible({ timeout: 20_000 });
  await scheduleLink.click();

  await expect(
    page.getByRole("heading", { name: "Appointments", exact: true }),
  ).toBeVisible({ timeout: 20_000 });

  await expect(
    page.getByRole("heading", { name: "Schedule resources" }),
  ).toBeVisible();
});
