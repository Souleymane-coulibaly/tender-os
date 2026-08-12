import { expect, test } from "@playwright/test";
import { login, readFixture } from "./fixtures";

/**
 * V2 Sprint 19 (Connecteurs Microsoft 365 & Google Workspace) — preuve Playwright contre les vraies
 * applications API + Web (aucune simulation de rendu). Ce dev environment n'a AUCUN credential OAuth
 * Microsoft/Google réel (`MICROSOFT_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_ID` valent des placeholders
 * de développement dans `.env`) — un flow OAuth complet ne peut donc pas aboutir ici (mission §104
 * anticipe explicitement ce cas : "OAuth contract tested" vs "live tenant tested", ce dernier hors de
 * portée sans un vrai tenant). Ce que cette suite PROUVE réellement, de bout en bout et sans
 * simulation :
 *  - la page `/app/integrations/connectors` rend les deux cartes provider ;
 *  - cliquer "Connecter" déclenche le VRAI flow serveur (action → API → `InitiateOAuthConnection
 *    UseCase` → `MicrosoftGraphAdapter`/`GoogleWorkspaceAdapter` réels) jusqu'à la redirection
 *    effective vers le VRAI domaine d'autorisation Microsoft/Google (`login.microsoftonline.com`/
 *    `accounts.google.com`) — la preuve s'arrête là, volontairement, avant toute tentative
 *    d'authentification (qui échouerait de toute façon, le client_id étant un placeholder) ;
 *  - la visibilité RBAC (OWNER voit "Connecter", un CONTRIBUTOR sans `ConnectorPermission.Manage`
 *    ne le voit pas) ;
 *  - le rendu mobile 390px.
 * Le flux OAuth complet (callback → ACTIVE → import/export/calendrier) est déjà prouvé de bout en
 * bout côté backend par `connectors-http.integration.spec.ts` (10/10, adapter de test réaliste) —
 * jamais redupliqué ici.
 */
test.describe("Connecteurs — parcours principal", () => {
  test("la page Connecteurs affiche les deux providers, et « Connecter » atteint le vrai point d'autorisation Microsoft", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture);

    await page.goto("/app/integrations/connectors");
    await expect(page.getByRole("heading", { name: "Microsoft 365" })).toBeVisible();
    await expect(page.getByText("SharePoint • OneDrive • Calendrier")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Google Workspace" })).toBeVisible();
    // exact:true — "Drive • Calendrier" est autrement un sous-texte littéral de "...OneDrive •
    // Calendrier" (Microsoft), un match non-exact matcherait les deux (strict mode violation).
    await expect(page.getByText("Drive • Calendrier", { exact: true })).toBeVisible();

    const microsoftCard = page.locator("section", { has: page.getByRole("heading", { name: "Microsoft 365" }) });
    await microsoftCard.getByRole("button", { name: "Connecter" }).click();

    // Preuve réelle du flow serveur -> adapter réel -> redirection : le navigateur quitte
    // effectivement TenderOS pour le vrai domaine d'autorisation Microsoft, jamais une simulation.
    await page.waitForURL(/login\.microsoftonline\.com/, { timeout: 15000 });
    expect(page.url()).toContain("login.microsoftonline.com");
  });

  test("Google Workspace — « Connecter » atteint le vrai point d'autorisation Google", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture);

    await page.goto("/app/integrations/connectors");
    const googleCard = page.locator("section", { has: page.getByRole("heading", { name: "Google Workspace" }) });
    await googleCard.getByRole("button", { name: "Connecter" }).click();

    await page.waitForURL(/accounts\.google\.com/, { timeout: 15000 });
    expect(page.url()).toContain("accounts.google.com");
  });

  test("mobile 390px — la page Connecteurs reste utilisable sans débordement horizontal", async ({ page }) => {
    const fixture = readFixture();
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, fixture);

    await page.goto("/app/integrations/connectors");
    await expect(page.getByRole("heading", { name: "Microsoft 365" })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(hasHorizontalOverflow).toBe(false);
  });
});

test.describe("Connecteurs — RBAC (mission §48)", () => {
  test("BLOQUANT — un CONTRIBUTOR (sans ConnectorPermission.Manage) ne voit jamais le bouton « Connecter »", async ({ page }) => {
    const fixture = readFixture();
    await page.goto("/app/login");
    await page.getByLabel("Email").fill(fixture.collaboratorEmail);
    await page.getByLabel("Mot de passe").fill(fixture.collaboratorPassword);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL("**/app/tenders");

    await page.goto("/app/integrations/connectors");
    await expect(page.getByRole("heading", { name: "Microsoft 365" })).toBeVisible();
    // exact:true — "Se déconnecter" (bouton de session, toujours affiché) contient littéralement
    // "connecter" comme sous-chaîne ("dé" + "connecter"), un match non-exact le sélectionnerait à
    // tort.
    await expect(page.getByRole("button", { name: "Connecter", exact: true })).not.toBeVisible();
    await expect(page.getByText("Réservé Propriétaire/Administrateur.").first()).toBeVisible();
  });
});
