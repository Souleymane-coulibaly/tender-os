import { expect, type Page, test } from "@playwright/test";
import { login, readFixture } from "./fixtures";

/**
 * V2 Sprint 22 (billing, étape 22E) — preuve Playwright bout-en-bout contre les vraies applications
 * API + Web + PostgreSQL, même motif que `dashboard.spec.ts` (Sprint 15). Le fixture E2E principal
 * (`apps/api/prisma/e2e-seed.ts`) ne seede volontairement AUCUNE donnée billing — cette organisation
 * représente donc l'état réel "aucune offre active" (mission §51 état par défaut d'une nouvelle
 * organisation), le scénario le plus fréquent en production et jamais couvert par les tests
 * unitaires/HTTP (qui seedent toujours explicitement un état). N'actionne jamais un bouton Checkout
 * réel (appellerait Stripe) — seule la présence/le contenu de l'écran est vérifié.
 *
 * Correctif audit Codex 22E (P1-04) — investigué en conditions réelles (serveurs dev réellement
 * démarrés) : la vraie cause n'était pas un défaut applicatif mais (1) un process zombie occupant
 * déjà le port 3000 dans l'environnement d'audit, et (2) un flake connu de Next.js 15 en mode dev
 * (`TypeError: chunk.reason.enqueueModel is not a function`) sur le TOUT PREMIER accès à une route
 * fraîchement compilée — reproduit à l'identique sur `/app/tenders`, une route préexistante jamais
 * modifiée par ce sprint, confirmant que ce n'est pas spécifique à `/app/subscription`. Un second
 * accès à la même route (déjà compilée) réussit systématiquement — `gotoResilient` réessaie une
 * fois avant d'échouer, même discipline que le commentaire déjà présent dans `playwright.config.ts`
 * ("premier accès plus lent... délai généreux plutôt qu'un flake").
 */
async function gotoResilient(page: Page, path: string): Promise<void> {
  try {
    const response = await page.goto(path, { timeout: 45000 });
    if (response && response.status() >= 500) {
      await page.goto(path, { timeout: 45000 });
    }
  } catch {
    await page.goto(path, { timeout: 45000 });
  }
}

test.describe.serial("Abonnement & utilisation — flux principal", () => {
  test("une organisation sans offre active voit le choix de plans, jamais une erreur", async ({ page }) => {
    test.setTimeout(120000);
    const fixture = readFixture();
    await login(page, fixture);

    await gotoResilient(page, "/app/subscription");
    await expect(page.getByRole("heading", { name: "Abonnement & utilisation" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Choisir une offre" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Pass AO/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Starter/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Business/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Enterprise/ })).toBeVisible();

    // Section utilisation toujours affichée, même sans offre (mission §50 quotas/usage réels).
    // `exact: true` — "Utilisation" est aussi une sous-chaîne du titre "Abonnement & utilisation"
    // (lien de nav + h1), jamais un seul élément sans précision.
    await expect(page.getByRole("heading", { name: "Utilisation", exact: true })).toBeVisible();
    await expect(page.getByText("Crédits AO disponibles")).toBeVisible();
  });

  test("le Dashboard affiche un résumé compact de l'abonnement, jamais bloquant si aucune offre n'est active", async ({ page }) => {
    test.setTimeout(120000);
    const fixture = readFixture();
    await login(page, fixture);

    await gotoResilient(page, "/app");
    await expect(page.getByRole("heading", { name: /^Bonjour/ })).toBeVisible();
    await expect(page.getByText("Aucune offre active.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Choisir une offre →" })).toBeVisible();
  });
});
