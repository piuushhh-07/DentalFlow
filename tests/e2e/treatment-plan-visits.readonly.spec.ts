import { expect, test } from "@playwright/test";

const email = process.env.E2E_OWNER_EMAIL;
const password = process.env.E2E_OWNER_PASSWORD;

test("owner can audit treatment plans and multi-visit workflow (read-only)", async ({
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

  // 1. Owner authentication.
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
  await signInButton.click({ force: true, timeout: 10000 });

  const clinicUrlPattern = /\/clinic\/([0-9a-f-]{36})(?:\/|$)/i;

  await expect(page).toHaveURL(clinicUrlPattern, {
    timeout: 45000,
  });

  const clinicId = page.url().match(clinicUrlPattern)?.[1];
  expect(clinicId).toBeTruthy();

  const applicationOrigin = new URL(page.url()).origin;

  page.on("response", (response) => {
    if (
      new URL(response.url()).origin === applicationOrigin &&
      response.status() >= 400
    ) {
      applicationHttpErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  // 2. Find the seeded patient.
  await page.goto(`/clinic/${clinicId}/patients`);

  await expect(page.getByRole("heading", { name: "Patients" })).toBeVisible();

  const patientRow = page.getByRole("row").filter({ hasText: "Aditya Sharma" });

  await expect(patientRow).toBeVisible();

  const patientLink = patientRow.locator(
    `a[href*="/clinic/${clinicId}/patients/"]`,
  );

  await expect(patientLink).toHaveCount(1);

  const patientHref = await patientLink.getAttribute("href");
  expect(patientHref).toBeTruthy();

  const patientId = patientHref?.match(
    /\/patients\/([0-9a-f-]{36})(?:\/|$)/i,
  )?.[1];

  expect(patientId).toBeTruthy();

  // 3. Open treatment-plan directory.
  await page.goto(`/clinic/${clinicId}/patients/${patientId}/treatments`);

  await expect(
    page.getByRole("heading", { name: "Care timeline" }),
  ).toBeVisible();

  await expect(
    page.getByRole("link", { name: "Back to patient" }),
  ).toBeVisible();

  await expect(page.getByRole("link", { name: "New plan" })).toHaveAttribute(
    "href",
    `/clinic/${clinicId}/patients/${patientId}/treatments/new`,
  );

  const planLinks = page.locator(
    `a[href^="/clinic/${clinicId}/patients/${patientId}/treatments/"]`,
  );

  const matchingPlanHrefs: string[] = [];

  for (let i = 0; i < (await planLinks.count()); i++) {
    const href = await planLinks.nth(i).getAttribute("href");

    if (href && /\/treatments\/[0-9a-f-]{36}$/i.test(href)) {
      matchingPlanHrefs.push(href);
    }
  }

  // A patient without plans is a valid empty state, not a broken page.
  if (matchingPlanHrefs.length === 0) {
    await expect(page.getByText("No treatment plans yet")).toBeVisible();

    await test.info().attach("treatment-plan-audit.json", {
      body: Buffer.from(
        JSON.stringify(
          {
            patient: "Aditya Sharma",
            clinicId,
            patientId,
            planCount: 0,
            result: "Valid empty state",
            dataModified: false,
          },
          null,
          2,
        ),
      ),
      contentType: "application/json",
    });

    expect(pageErrors).toEqual([]);
    expect(applicationHttpErrors).toEqual([]);
    return;
  }

  // 4. Open the first existing treatment plan.
  const planHref = matchingPlanHrefs[0];

  await page.goto(planHref);

  await expect(
    page.getByRole("heading", { name: "Treatment plan" }),
  ).toHaveCount(0);

  // The actual H1 is the dynamic treatment-plan name.
  const planHeading = page.locator("main h1").first();

  await expect(planHeading).toBeVisible();

  const planName = (await planHeading.innerText()).trim();
  expect(planName.length).toBeGreaterThan(0);

  // 5. Verify plan financial and estimate sections.
  await expect(
    page.getByRole("heading", { name: "Financial summary" }),
  ).toBeVisible();

  await expect(
    page.getByText("Estimate", { exact: true }).first(),
  ).toBeVisible();

  await expect(page.getByText("Final", { exact: true }).first()).toBeVisible();

  await expect(
    page.getByText("Collected", { exact: true }).first(),
  ).toBeVisible();

  await expect(
    page.getByText("Outstanding", { exact: true }).first(),
  ).toBeVisible();

  await expect(
    page.getByRole("heading", { name: "Treatment estimates" }),
  ).toBeVisible();

  await expect(
    page.getByRole("heading", { name: "Plan details" }),
  ).toBeVisible();

  // 6. Inspect visit cards.
  const visitsHeading = page.getByRole("heading", {
    name: "Visits",
    exact: true,
  });

  await expect(visitsHeading).toBeVisible();

  const visitsSection = visitsHeading.locator("xpath=../..");

  const visitCards = visitsSection.locator("div.rounded-lg.border");

  const visitCount = await visitCards.count();

  expect(
    visitCount,
    "Treatment plan should contain at least one visit",
  ).toBeGreaterThan(0);

  const visitNumbers: number[] = [];
  const visitStatuses: string[] = [];
  const visitDates: string[] = [];
  const visitAudit: Array<Record<string, unknown>> = [];

  for (let i = 0; i < visitCount; i++) {
    const card = visitCards.nth(i);

    // Visit sequence.
    const visitHeading = card.getByText(/^Visit \d+$/);

    await expect(visitHeading).toBeVisible();

    const headingText = (await visitHeading.innerText()).trim();
    const visitNumber = Number(headingText.replace("Visit ", ""));

    expect(Number.isInteger(visitNumber)).toBeTruthy();
    visitNumbers.push(visitNumber);

    // Due date.
    const dueDateText = card.getByText(/^Due /);

    await expect(dueDateText).toBeVisible();

    visitDates.push((await dueDateText.innerText()).trim());

    // Visit status.
    const statusSelect = card.locator(`select[id^="status-"]`);

    await expect(statusSelect).toHaveCount(1);

    const status = await statusSelect.inputValue();
    const isCompleted = status === "COMPLETED";

    visitStatuses.push(status);

    // Prescription navigation exists for every visit.
    const prescriptionLink = card.getByRole("link", {
      name: "Create prescription for this visit",
    });

    await expect(prescriptionLink).toBeVisible();

    const prescriptionHref = await prescriptionLink.getAttribute("href");

    expect(prescriptionHref).toContain(`prescriptionVisitId=`);

    expect(prescriptionHref).toContain("#prescriptions");

    // Completed visits must not be editable or rescheduled.
    const dueDateInput = card.locator('input[name="dueDate"]');

    const updateStatusButton = card.getByRole("button", {
      name: "Update status",
    });

    const rescheduleButton = card.getByRole("button", {
      name: "Reschedule",
    });

    if (isCompleted) {
      await expect(statusSelect).toBeDisabled();
      await expect(updateStatusButton).toHaveCount(0);
      await expect(dueDateInput).toHaveCount(0);
      await expect(rescheduleButton).toHaveCount(0);

      await expect(card.getByText(/^Completed /)).toBeVisible();
    } else {
      await expect(statusSelect).toBeEnabled();
      await expect(updateStatusButton).toBeVisible();

      await expect(dueDateInput).toBeVisible();
      await expect(dueDateInput).toBeEnabled();
      await expect(rescheduleButton).toBeVisible();

      const dateValue = await dueDateInput.inputValue();

      expect(dateValue).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }

    // Appointment linkage.
    const appointmentMessage = card.getByText(/Appointment .* for /);

    const scheduleLink = card.getByRole("link", {
      name: "View clinic schedule",
    });

    const createAppointmentLink = card.getByRole("link", {
      name: "Schedule appointment",
    });

    const hasAppointment = (await appointmentMessage.count()) > 0;

    if (hasAppointment) {
      await expect(appointmentMessage).toBeVisible();
      await expect(scheduleLink).toBeVisible();

      const scheduleHref = await scheduleLink.getAttribute("href");

      expect(scheduleHref).toContain(`/clinic/${clinicId}/appointments?date=`);

      // Appointment status and visit status are displayed separately.
      await expect(
        card.getByText(/Visit status is managed separately/),
      ).toBeVisible();
    } else if (!["COMPLETED", "CANCELLED"].includes(status)) {
      await expect(createAppointmentLink).toBeVisible();

      const appointmentHref = await createAppointmentLink.getAttribute("href");

      expect(appointmentHref).toContain(`patientId=${patientId}`);

      expect(appointmentHref).toContain(`treatmentVisitId=`);
    }

    visitAudit.push({
      visitNumber,
      status,
      dueDate: visitDates[i],
      completed: isCompleted,
      hasAppointment,
      prescriptionLink: prescriptionHref,
      editable: !isCompleted,
    });
  }

  // Visit sequence must be strictly increasing.
  expect(visitNumbers).toEqual([...visitNumbers].sort((a, b) => a - b));

  expect(new Set(visitNumbers).size).toBe(visitNumbers.length);

  // 7. Check completion summary.
  const completedCount = visitStatuses.filter(
    (status) => status === "COMPLETED",
  ).length;

  await expect(
    visitsSection.getByText(`${completedCount} of ${visitCount} completed`),
  ).toBeVisible();

  // 8. Verify no browser or same-origin HTTP errors.
  expect(
    pageErrors,
    `Browser JavaScript errors:\n${pageErrors.join("\n")}`,
  ).toEqual([]);

  expect(
    applicationHttpErrors,
    `Application HTTP errors:\n${applicationHttpErrors.join("\n")}`,
  ).toEqual([]);

  // 9. Attach detailed audit report.
  await test.info().attach("treatment-plan-audit.json", {
    body: Buffer.from(
      JSON.stringify(
        {
          patient: "Aditya Sharma",
          clinicId,
          patientId,
          planName,
          planHref,
          visitCount,
          completedCount,
          visitNumbers,
          visitStatuses,
          visitDates,
          visits: visitAudit,
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
