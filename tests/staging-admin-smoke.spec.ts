import { expect, type Page, test } from "@playwright/test";

const STAGING_BASE_URL = "https://tender-os-web.vercel.app";
const ADMIN_EMAIL = process.env.PLAYWRIGHT_STAGING_EMAIL;
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_STAGING_PASSWORD;

function requireStagingCredentials(): { email: string; password: string } {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("Missing PLAYWRIGHT_STAGING_EMAIL or PLAYWRIGHT_STAGING_PASSWORD for connected staging smoke tests.");
  }

  return { email: ADMIN_EMAIL, password: ADMIN_PASSWORD };
}

async function assertNoServerError(page: Page): Promise<void> {
  const failedResponses: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 500) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.waitForLoadState("networkidle").catch(() => undefined);
  expect(failedResponses).toEqual([]);
}

async function loginAsStagingAdmin(page: Page): Promise<void> {
  const credentials = requireStagingCredentials();

  await page.goto("/app/login");
  await expect(page.getByRole("heading", { name: /connexion|connectez-vous/i })).toBeVisible();
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Mot de passe").fill(credentials.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/app(?:\/tenders)?(?:[?#]|$)/);
  await expect(page.getByRole("button", { name: "Se connecter" })).toHaveCount(0);
}

test.describe.serial("Staging admin connected smoke tests", () => {
  test.use({ baseURL: STAGING_BASE_URL });

  test("login admin succeeds and lands on a protected app page", async ({ page }) => {
    await loginAsStagingAdmin(page);
    await assertNoServerError(page);

    await expect(page.locator("body")).toContainText(/TenderOS|Appels d'offres|Bonjour|Dashboard/i);
  });

  test("protected dashboard renders core operational widgets without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsStagingAdmin(page);

    await page.goto("/app");
    await assertNoServerError(page);
    await expect(page.getByRole("heading", { name: /^Bonjour/i })).toBeVisible();

    await expect(page.locator("body")).toContainText(/Appels d'offres|Echeances|Dossiers|Opportunites|utilisation/i);
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(hasHorizontalOverflow).toBe(false);
  });

  test("mobile protected dashboard remains usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsStagingAdmin(page);

    await page.goto("/app");
    await assertNoServerError(page);
    await expect(page.getByRole("heading", { name: /^Bonjour/i })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(hasHorizontalOverflow).toBe(false);
  });

  test("tender list is reachable and a tender detail exposes DCE, analysis and checklist areas when data exists", async ({ page }) => {
    await loginAsStagingAdmin(page);

    await page.goto("/app/tenders");
    await assertNoServerError(page);
    await expect(page.locator("body")).toContainText(/Appels d'offres|Tender/i);

    const firstTenderLink = page.locator('a[href^="/app/tenders/"]').first();
    if ((await firstTenderLink.count()) === 0) {
      test.skip(true, "No tender available in staging for detail-page smoke assertions.");
    }

    await firstTenderLink.click();
    await expect(page).toHaveURL(/\/app\/tenders\/[^/]+$/);
    await assertNoServerError(page);

    await expect(page.locator("body")).toContainText(/DCE|Analyse|Checklist|Documents/i);
  });

  test("forgot password and create-account links remain reachable from login", async ({ page }) => {
    await page.goto("/app/login");
    await assertNoServerError(page);

    await expect(page.getByRole("link", { name: /Mot de passe/i })).toHaveAttribute("href", "/app/forgot-password");
    await expect(page.getByRole("link", { name: /Creer un compte|Créer un compte/i })).toHaveAttribute("href", /\/onboarding/);
  });
});
