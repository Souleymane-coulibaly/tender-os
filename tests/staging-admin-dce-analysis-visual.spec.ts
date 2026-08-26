import { expect, test } from "@playwright/test";
import { buildMinimalPdf } from "./pdf-fixture";

const BASE_URL = "https://tender-os-web.vercel.app";
const EMAIL = process.env.PLAYWRIGHT_STAGING_EMAIL;
const PASSWORD = process.env.PLAYWRIGHT_STAGING_PASSWORD;

function requireCredentials(): { email: string; password: string } {
  if (!EMAIL || !PASSWORD) {
    throw new Error("Missing PLAYWRIGHT_STAGING_EMAIL or PLAYWRIGHT_STAGING_PASSWORD.");
  }
  return { email: EMAIL, password: PASSWORD };
}

async function visiblePause(page: import("@playwright/test").Page, ms = 900): Promise<void> {
  await page.waitForTimeout(ms);
}

async function login(page: import("@playwright/test").Page): Promise<void> {
  const credentials = requireCredentials();
  await page.goto(`${BASE_URL}/app/login`, { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Email")).toBeVisible();
  await visiblePause(page);
  await page.getByLabel("Email").fill(credentials.email);
  await visiblePause(page, 500);
  await page.getByLabel("Mot de passe").fill(credentials.password);
  await visiblePause(page, 500);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await visiblePause(page, 1200);
}

test.describe.serial("Staging visual flow — tender + DCE + analysis", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("creates a tender, imports a real PDF DCE, refreshes extraction, launches analysis, and visits key pages", async ({ page }) => {
    const title = `Codex Visual AO ${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const futureDate = "2026-12-31";

    await login(page);

    await page.goto(`${BASE_URL}/app/tenders/new`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Nouvel appel d'offres|Nouvel appel d’offres/i })).toBeVisible();
    await visiblePause(page, 1200);

    await page.getByLabel("Titre *").fill(title);
    await visiblePause(page, 400);
    await page.getByLabel("Reference").fill(`VISUAL-${Date.now()}`);
    await visiblePause(page, 400);
    await page.getByLabel("Acheteur (texte libre)").fill("Ville de démonstration");
    await visiblePause(page, 400);
    await page.getByLabel("Date limite de remise").fill(futureDate);
    await visiblePause(page, 600);
    await page.getByRole("button", { name: /Creer l'appel d'offres|Créer l'appel d’offres/i }).click();
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await visiblePause(page, 1500);

    await expect(page).toHaveURL(/\/app\/tenders\/[^/?#]+(?:$|[?#])/);

    await page.getByRole("button", { name: "Initialiser le DCE" }).click();
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await visiblePause(page, 1200);
    await expect(page.getByText(/Aucun document du DCE/i)).toBeVisible();

    const pdfBytes = buildMinimalPdf([
      "Cahier des charges TenderOS staging.",
      "Objet: maintenance multi-technique des bâtiments.",
      "Exigence: mémoire technique, planning, références, attestation assurance.",
    ]);
    await page.locator('input[name="files"]').setInputFiles({
      name: "dce-visual-staging.pdf",
      mimeType: "application/pdf",
      buffer: pdfBytes,
    });
    await visiblePause(page, 700);
    await page.getByRole("button", { name: "Importer", exact: true }).click();
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await visiblePause(page, 1500);
    await expect(page.getByText(/dce-visual-staging\.pdf/i)).toBeVisible();

    await expect(async () => {
      await page.getByRole("button", { name: "Actualiser" }).first().click();
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await expect(page.getByText(/Prêt pour analyse/i)).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30000, intervals: [1000] });
    await visiblePause(page, 1200);

    const analyzeButton = page.getByRole("button", { name: "Analyser", exact: true });
    await expect(analyzeButton).toBeEnabled();
    await analyzeButton.click();
    await visiblePause(page, 2000);
    await expect(page.getByText(/En attente|En file d'attente|En cours|Echouee|Échouée|Terminee|Terminée|Annulee|Annulée/i)).toBeVisible({
      timeout: 15000,
    });

    const tenderUrl = page.url();
    const match = tenderUrl.match(/\/app\/tenders\/([^/?#]+)/);
    expect(match?.[1]).toBeTruthy();
    const tenderId = match![1];

    await page.goto(`${BASE_URL}/app/tenders/${tenderId}/dce`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await visiblePause(page, 1200);

    await page.goto(`${BASE_URL}/app/tenders/${tenderId}/analysis`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await visiblePause(page, 1500);

    await page.goto(`${BASE_URL}/app/tenders/${tenderId}/checklist`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await visiblePause(page, 1200);

    await page.goto(`${BASE_URL}/app/tenders/${tenderId}/deliverables`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await visiblePause(page, 2000);
  });
});
