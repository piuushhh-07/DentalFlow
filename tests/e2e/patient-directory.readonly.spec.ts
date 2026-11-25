import { expect, test } from "@playwright/test";

const email = process.env.E2E_OWNER_EMAIL;
const password = process.env.E2E_OWNER_PASSWORD;

test("owner can audit Patient 360, odontogram and clinical records (read-only)", async ({
  page,
}) => {
  test.skip(
    !email || !password,
    "Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD for staging QA",
  );

  const pageErrors: string[] = [];
  const applicationHttpErrors: string[] = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  // 1. Authenticate.
  await page.goto("/");

  const emailField = page.getByRole("textbox", {
    name: /email address/i,
  });

  await expect(emailField).toBeVisible({ timeout: 20000 });
  await emailField.fill(email!);
  await page.getByLabel(/password/i).fill(password!);

  const signInButton = page.getByRole("button", {
    name: /^sign in$/i,
  });

  await expect(signInButton).toBeVisible();
  await expect(signInButton).toBeEnabled();

  await signInButton.click({
    force: true,
    timeout: 10000,
  });

  const clinicUrlPattern = /\/clinic\/([0-9a-f-]{36})(?:\/|$)/i;

  await expect(page).toHaveURL(clinicUrlPattern, {
    timeout: 45000,
  });

  const clinicId = page.url().match(clinicUrlPattern)?.[1];
  expect(clinicId).toBeTruthy();

  // 2. Open the seeded patient.
  await page.goto(`/clinic/${clinicId}/patients`);

  await expect(page.getByRole("heading", { name: "Patients" })).toBeVisible();

  const patientRow = page.getByRole("row").filter({ hasText: "Aditya Sharma" });

  await expect(patientRow).toBeVisible();
  await expect(patientRow).toContainText("+91 98765 01001");
  await expect(patientRow).toContainText("Not opted in");

  const patientLink = patientRow.locator(
    `a[href*="/clinic/${clinicId}/patients/"]`,
  );

  await expect(patientLink).toHaveCount(1);

  const patientHref = await patientLink.getAttribute("href");
  expect(patientHref).toBeTruthy();

  const applicationOrigin = new URL(page.url()).origin;

  page.on("response", (response) => {
    if (
      new URL(response.url()).origin === applicationOrigin &&
      response.status() >= 400
    ) {
      applicationHttpErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto(patientHref!);

  await expect(
    page.getByRole("heading", { name: "Aditya Sharma" }),
  ).toBeVisible({ timeout: 30000 });

  // 3. Verify Patient 360 sections.
  const odontogram = page.locator("#odontogram");
  const clinicalSection = page.locator("#clinical-records");
  const prescriptionSections = page.locator("#prescriptions");
  const estimates = page.locator("#estimates");
  const policies = page.locator("#patient-policies");

  await expect(odontogram).toBeVisible();
  await expect(clinicalSection).toBeVisible();
  await expect(prescriptionSections).toHaveCount(2);

  // The second element is the actual prescription panel.
  const prescriptions = prescriptionSections.nth(1);

  await expect(prescriptions).toBeVisible();
  await expect(estimates).toBeVisible();
  await expect(policies).toBeVisible();

  await expect(
    page.getByRole("heading", { name: "Insurance policies" }),
  ).toBeVisible();

  // 4. Inspect permanent FDI dentition.
  await expect(
    odontogram.getByRole("button", { name: "Print chart" }),
  ).toBeVisible();

  const permanentChart = odontogram.getByRole("group", {
    name: /permanent teeth, fdi numbering/i,
  });

  await expect(permanentChart).toBeVisible();

  const permanentTeeth = permanentChart.getByRole("button", {
    name: /^Tooth \d{2}/i,
  });

  await expect(permanentTeeth).toHaveCount(32);

  const selectedPermanentTooth = permanentChart.locator(
    'button[aria-pressed="true"]',
  );

  await expect(selectedPermanentTooth).toHaveCount(1);

  // Check the selected tooth heading without relying on punctuation
  // or the dentition suffix.
  await expect(
    odontogram
      .getByRole("heading", {
        name: /Tooth\s+\d{2}/i,
      })
      .first(),
  ).toBeVisible();

  // 5. Switch to primary dentition.
  await odontogram.getByRole("button", { name: /primary/i }).click();

  const primaryChart = odontogram.getByRole("group", {
    name: /primary teeth, fdi numbering/i,
  });

  await expect(primaryChart).toBeVisible();

  const primaryTeeth = primaryChart.getByRole("button", {
    name: /^Tooth \d{2}/i,
  });

  await expect(primaryTeeth).toHaveCount(20);

  const selectedPrimaryTooth = primaryChart.locator(
    'button[aria-pressed="true"]',
  );

  await expect(selectedPrimaryTooth).toHaveCount(1);

  await expect(
    odontogram
      .getByRole("heading", {
        name: /Tooth\s+\d{2}/i,
      })
      .first(),
  ).toBeVisible();

  // Verify that selecting a tooth changes the selected state.
  const firstPrimaryTooth = primaryTeeth.first();
  const secondPrimaryTooth = primaryTeeth.nth(1);

  await secondPrimaryTooth.click();

  await expect(secondPrimaryTooth).toHaveAttribute("aria-pressed", "true");

  await expect(firstPrimaryTooth).toHaveAttribute("aria-pressed", "false");

  // Return to permanent dentition.
  await odontogram.getByRole("button", { name: /permanent/i }).click();

  await expect(permanentChart).toBeVisible();

  // 6. Inspect odontogram form without submitting.
  const odontogramForm = odontogram.locator("form");

  await expect(odontogramForm).toBeVisible();

  const entryType = odontogramForm.locator('select[name="entryType"]');

  const findingSelect = odontogramForm.locator('select[name="finding"]');

  const treatmentName = odontogramForm.locator('input[name="treatmentName"]');

  const treatmentStatus = odontogramForm.locator(
    'select[name="treatmentStatus"]',
  );

  await expect(entryType).toBeVisible();

  // Finding mode.
  await entryType.selectOption("FINDING");

  await expect(findingSelect).toBeVisible();

  await expect(findingSelect.locator('option[value="DECAYED"]')).toHaveCount(1);

  await findingSelect.selectOption("DECAYED");

  await expect(findingSelect).toHaveValue("DECAYED");

  // Treatment mode.
  await entryType.selectOption("TREATMENT");

  await expect(treatmentName).toBeVisible();
  await expect(treatmentStatus).toBeVisible();

  await expect(treatmentName).toHaveAttribute("required", "");
  await expect(treatmentStatus).toHaveAttribute("required", "");

  await expect(
    odontogramForm.locator('select[name="treatmentPlanId"]'),
  ).toBeVisible();

  await expect(odontogramForm.locator('textarea[name="notes"]')).toBeVisible();

  await expect(
    odontogramForm.locator('input[name="surfaces"]'),
  ).not.toHaveCount(0);

  const correctionControl = odontogramForm.locator(
    'select[name="supersedesEntryId"]',
  );

  if (await correctionControl.count()) {
    await expect(correctionControl).toBeVisible();
  }

  await expect(
    odontogramForm.getByRole("button", {
      name: "Save chart entry",
    }),
  ).toBeVisible();

  // 7. Inspect clinical record fields.
  const clinicalForm = clinicalSection.locator("form");

  await expect(clinicalForm).toBeVisible();

  const clinicalFields = [
    "visitId",
    "relatedOdontogramEntryId",
    "medicalHistory",
    "dentalHistory",
    "allergies",
    "chiefComplaints",
    "clinicalExamination",
    "diagnosis",
    "treatmentRecommendations",
    "clinicalNotes",
    "toothNumber",
    "dentition",
    "toothFindingLabel",
    "toothFindingSummary",
    "toothFindingNotes",
  ];

  for (const fieldName of clinicalFields) {
    await expect(clinicalForm.locator(`[name="${fieldName}"]`)).toHaveCount(1);
  }

  await expect(
    clinicalForm.locator('input[name="toothSurfaces"]'),
  ).not.toHaveCount(0);

  // 8. Inspect prescriptions and estimates.
  await expect(
    prescriptions.getByRole("heading", {
      name: /digital prescriptions/i,
    }),
  ).toBeVisible();

  await expect(
    prescriptions.getByRole("button", {
      name: /save finalized prescription/i,
    }),
  ).toBeVisible();

  await expect(estimates).toBeVisible();

  // 9. Check browser and application errors.
  expect(
    pageErrors,
    `Browser JavaScript errors:\n${pageErrors.join("\n")}`,
  ).toEqual([]);

  expect(
    applicationHttpErrors,
    `Same-origin HTTP errors:\n${applicationHttpErrors.join("\n")}`,
  ).toEqual([]);

  // 10. Attach audit report.
  await test.info().attach("patient-clinical-audit.json", {
    body: Buffer.from(
      JSON.stringify(
        {
          patient: "Aditya Sharma",
          clinicId,
          sections: [
            "Patient profile",
            "Odontogram",
            "Clinical records",
            "Prescriptions",
            "Treatment estimates",
            "Insurance policies",
          ],
          checks: [
            "Permanent FDI dentition",
            "Primary FDI dentition",
            "Tooth selection",
            "Finding form",
            "Treatment form",
            "Surfaces and notes",
            "Clinical record fields",
            "Prescription section",
          ],
          pageErrors,
          applicationHttpErrors,
          dataModified: false,
        },
        null,
        2,
      ),
    ),
    contentType: "application/json",
  });
});
