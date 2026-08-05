import { expect, test } from "@playwright/test";
import { login, readFixture } from "./fixtures";

/**
 * V2 Sprint 1 §5 — parcours E2E minimal requis par la mission : connexion, accès organisationnel,
 * ouverture d'un Tender protégé, puis preuve qu'un utilisateur authentifié d'une AUTRE
 * organisation ne peut pas accéder à la même ressource via l'UI réelle (frontend + API + base
 * PostgreSQL réels, jamais un test mocké). Réutilise `fixture.other`, seedé par
 * `apps/api/prisma/e2e-seed.ts` spécifiquement pour ce scénario.
 */
test.describe("Isolation multi-tenant (anti-IDOR)", () => {
  test("un utilisateur peut ouvrir son propre Tender", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture);

    await page.goto(`/app/tenders/${fixture.tenderId}`);

    await expect(page.getByRole("heading", { name: "Cockpit" })).toBeVisible();
  });

  test("un utilisateur d'une autre organisation ne peut pas accéder au Tender via son URL directe", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture.other);

    await page.goto(`/app/tenders/${fixture.tenderId}`);

    await expect(page.getByRole("alert")).toContainText("Introuvable ou accès refusé");
    await expect(page.getByRole("heading", { name: "Cockpit" })).not.toBeVisible();
  });

  test("un utilisateur d'une autre organisation ne voit jamais le Tender d'autrui dans sa propre liste", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture.other);

    await page.goto("/app/tenders");

    await expect(page.getByText(fixture.tenderId)).toHaveCount(0);
  });
});
