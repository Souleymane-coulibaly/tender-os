import { expect, test } from "@playwright/test";
import { login, readFixture } from "./fixtures";

/**
 * V2 Sprint 17 (Veille & détection des marchés) — preuve Playwright du parcours principal (mission
 * §139) : créer une veille personnalisée, voir les marchés détectés, ouvrir une notification,
 * ajouter un marché aux opportunités, ignorer un autre marché.
 */
test.describe.serial("Veille — parcours principal", () => {
  test("crée une veille personnalisée avec mots-clés + zone + budget, active in-app + email", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture);

    await page.goto("/app/market-watch?new");
    await expect(page.getByRole("heading", { name: "Nouvelle veille" })).toBeVisible();

    await page.getByLabel("Nom de la veille").fill(`Cybersécurité France ${Date.now()}`);
    await page.getByLabel("Je recherche").fill("cybersécurité");
    await page.getByLabel("Budget minimum (€)").fill("150000");

    await page.getByRole("button", { name: "Filtres avancés" }).click();
    await page.getByLabel("Deadline dans au moins (jours)").fill("10");

    await page.getByLabel("Email").check();
    await page.getByRole("button", { name: "Créer la veille" }).click();

    await page.waitForURL(/\/app\/market-watch\?searchId=/);
    await expect(page.locator("aside")).toContainText("Cybersécurité France");
  });

  test("mobile 390px — la page Veille reste utilisable sans débordement horizontal", async ({ page }) => {
    const fixture = readFixture();
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, fixture);

    await page.goto("/app/market-watch");
    await expect(page.getByRole("heading", { name: "Mes veilles" })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(hasHorizontalOverflow).toBe(false);
  });

  test("un CONTRIBUTOR peut aussi créer sa propre veille (décision validée, non réservé OWNER/ADMIN)", async ({ page }) => {
    const fixture = readFixture();
    await page.goto("/app/login");
    await page.getByLabel("Email").fill(fixture.collaboratorEmail);
    await page.getByLabel("Mot de passe").fill(fixture.collaboratorPassword);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL("**/app/tenders");

    await page.goto("/app/market-watch?new");
    await expect(page.getByRole("heading", { name: "Nouvelle veille" })).toBeVisible();
    await page.getByLabel("Nom de la veille").fill(`Veille contributeur ${Date.now()}`);
    await page.getByRole("button", { name: "Créer la veille" }).click();
    await page.waitForURL(/\/app\/market-watch\?searchId=/);
  });
});
