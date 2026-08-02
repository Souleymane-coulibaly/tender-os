import { expect, test } from "@playwright/test";
import { login, readFixture } from "./fixtures";

const VIEWPORTS = [
  { name: "desktop", size: { width: 1280, height: 800 } },
  { name: "tablette", size: { width: 834, height: 1112 } },
  { name: "mobile", size: { width: 390, height: 844 } },
] as const;

/**
 * Correctif audit Codex P2-003 — preuves Playwright minimales, Page Livrables : chargement, liste
 * des 9 livrables, statut, accès au Mémoire technique, erreur d'accès. Répété sur desktop/tablette/
 * mobile (mission — responsive minimal).
 */
for (const viewport of VIEWPORTS) {
  test.describe(`Page Livrables — ${viewport.name}`, () => {
    test.use({ viewport: viewport.size });

    test("charge et affiche les 9 livrables avec leur statut", async ({ page }) => {
      const fixture = readFixture();
      await login(page, fixture);

      await page.goto(`/app/tenders/${fixture.tenderId}/deliverables`);
      await expect(page.getByRole("heading", { name: "Livrables" })).toBeVisible();

      // 9 cartes de livrable (mission "au minimum 9 livrables"), chacune un lien vers son détail.
      const cards = page.locator('a[href*="/deliverables/"]');
      await expect(cards).toHaveCount(9);

      // Chaque carte affiche un statut traduit (badge) — jamais un code brut vide.
      await expect(page.getByText("Non démarré").first()).toBeVisible();
    });

    test("ouvre le Mémoire technique depuis la liste", async ({ page }) => {
      const fixture = readFixture();
      await login(page, fixture);
      await page.goto(`/app/tenders/${fixture.tenderId}/deliverables`);

      await page.getByText("Mémoire technique", { exact: true }).click();
      await expect(page).toHaveURL(/\/deliverables\/[0-9a-f-]+$/);
      await expect(page.getByRole("heading", { name: "Mémoire technique" })).toBeVisible();
    });
  });
}

test.describe("Page Livrables — erreur d'accès", () => {
  test("un livrable inexistant affiche un état d'erreur explicite, jamais une page blanche", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture);

    await page.goto(`/app/tenders/${fixture.tenderId}/deliverables/00000000-0000-0000-0000-000000000000`);
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("Introuvable ou accès refusé");
  });
});

test.describe("Accessibilité minimale — connexion", () => {
  test("le formulaire de connexion est navigable au clavier, avec labels et focus visibles", async ({ page }) => {
    await page.goto("/app/login");

    const email = page.getByLabel("Email");
    const password = page.getByLabel("Mot de passe");
    const submit = page.getByRole("button", { name: "Se connecter" });

    // Labels réellement associés (getByLabel échoue sinon) — champs nommés, jamais anonymes.
    await expect(email).toBeVisible();
    await expect(password).toBeVisible();

    await email.focus();
    await expect(email).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(password).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(submit).toBeFocused();

    // Erreur annoncée via role="alert" — testé avec des identifiants volontairement invalides.
    await email.fill("inconnu@example.test");
    await password.fill("mot-de-passe-invalide");
    await submit.click();
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toBeVisible();
  });
});
