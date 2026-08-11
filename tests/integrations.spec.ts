import { expect, test } from "@playwright/test";
import { login, readFixture } from "./fixtures";

/**
 * V2 Sprint 16 (Integration Hub) — preuve Playwright bout-en-bout des écrans "Intégrations" contre
 * les vraies applications API + Web + PostgreSQL. La preuve protocolaire de la livraison webhook
 * réelle (signature HMAC, chaîne Outbox -> worker -> HTTP) est déjà couverte par
 * `apps/api/src/modules/integrations/interfaces/http/integrations-http.integration.spec.ts` — ce
 * fichier couvre le parcours utilisateur : création de clé API (secret affiché une seule fois),
 * création de webhook (secret affiché une seule fois), écran de détail et journal des livraisons.
 */
test.describe.serial("Intégrations — API Keys & Webhooks (parcours principal)", () => {
  test("crée une clé API, affiche la clé une seule fois, la liste masquée, puis la révoque", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture);

    await page.goto("/app/integrations/api-keys");
    await expect(page.getByRole("heading", { name: "Intégrations" })).toBeVisible();

    await page.getByLabel("Nom").fill(`Playwright test key ${Date.now()}`);
    await page.getByLabel("Appels d'offres — lecture").check();
    await page.getByRole("button", { name: "Créer la clé" }).click();

    // Mission §10/§11 — la clé complète n'est affichée qu'une seule fois, jamais rejouée. Le
    // sélecteur cible spécifiquement l'encart ambre "copiez-le maintenant" (le tableau des clés
    // affiche aussi un `keyPrefix` qui commence légitimement par "tos_live_", en masqué).
    const secretBox = page.locator(".bg-amber-50 code");
    await expect(secretBox).toBeVisible();
    const fullKey = await secretBox.textContent();
    expect(fullKey).toMatch(/^tos_live_/);

    await page.getByRole("button", { name: "Créer une autre clé" }).click();
    await expect(page.locator(".bg-amber-50 code")).toHaveCount(0);

    const row = page.locator("tr", { hasText: "Active" }).first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Révoquer" }).click();
    await row.getByRole("button", { name: "Confirmer la révocation" }).click();
    await expect(page.getByText("Révoquée").first()).toBeVisible();
  });

  test("crée un webhook, affiche le secret une seule fois, envoie un événement de test, désactive puis supprime", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture);

    await page.goto("/app/integrations/webhooks");
    await page.getByLabel("URL de destination").fill("https://example.com/tenderos-webhook-test");
    await page.getByLabel(/Appel d'offres créé/).check();
    await page.getByRole("button", { name: "Créer le webhook" }).click();

    // Mission §30 — le secret whsec_ n'est affiché qu'une seule fois.
    const secretBox = page.locator(".bg-amber-50 code");
    await expect(secretBox).toBeVisible();
    const secretText = await secretBox.textContent();
    expect(secretText).toMatch(/^whsec_/);

    await page.getByRole("button", { name: "Voir le webhook" }).click();
    await page.waitForURL(/\/app\/integrations\/webhooks\/[a-f0-9-]+$/);
    await expect(page.getByText("example.com/tenderos-webhook-test")).toBeVisible();

    await page.getByRole("button", { name: "Envoyer un événement de test" }).click();
    await expect(page.getByText("Événement de test envoyé")).toBeVisible();

    await page.getByRole("button", { name: "Désactiver" }).click();
    await expect(page.getByRole("button", { name: "Activer" })).toBeVisible();

    await page.getByRole("button", { name: "Supprimer" }).click();
    await page.getByRole("button", { name: "Confirmer la suppression" }).click();
    await page.waitForURL("**/app/integrations/webhooks");
  });

  test("un CONTRIBUTOR ne peut pas accéder aux intégrations (réservé OWNER/ORGANIZATION_ADMIN, mission §12)", async ({ page }) => {
    const fixture = readFixture();
    await page.goto("/app/login");
    await page.getByLabel("Email").fill(fixture.collaboratorEmail);
    await page.getByLabel("Mot de passe").fill(fixture.collaboratorPassword);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL("**/app/tenders");

    // Mission §12 — même le LIST est réservé OWNER/ORGANIZATION_ADMIN (IntegrationPermission.Read),
    // jamais un accès en lecture seule pour un CONTRIBUTOR : la page entière bascule en état d'erreur.
    await page.goto("/app/integrations/api-keys");
    await expect(page.getByText("Accès refusé")).toBeVisible();
    await expect(page.getByLabel("Nom")).toHaveCount(0);
  });
});
