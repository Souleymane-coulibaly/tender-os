import { expect, test } from "@playwright/test";
import { login, readFixture } from "./fixtures";

/**
 * V2 Sprint 9 (Chat IA conversationnel) — preuves Playwright bout-en-bout contre les vraies
 * applications API + Web + PostgreSQL (aucune simulation), sur `fixture.tenderId` :
 *  - flux principal côté Conversation (création, sélection, archivage, persistance réelle après
 *    rechargement) — la génération IA elle-même (`POST .../messages`) exige un `OPENAI_API_KEY`
 *    réel non disponible dans cet environnement de test ; sa logique (garde PENDING, validation de
 *    citations, échec gracieux) est déjà couverte par `send-message.use-case.spec.ts` (vitest,
 *    `FakeAIProvider`), et sa surface HTTP (permissions, isolation) par
 *    `chat-http.integration.spec.ts` — même périmètre que Generation/Analysis, jamais exercées via
 *    Playwright dans ce dépôt pour la même raison ;
 *  - scénario de sécurité : un utilisateur d'une autre organisation ne peut ni voir ni atteindre
 *    l'Assistant IA d'un Tender d'autrui (404, jamais une fuite d'existence) ;
 *  - scénario BLOQUANT : un membre de la MÊME organisation, autorisé sur un client mais pas un
 *    autre, ne peut ni voir ni atteindre l'Assistant IA d'un Tender du client auquel il n'est pas
 *    affecté (même motif que `workspace-collaboration.spec.ts`, mission §5/§49/§50).
 */
test.describe.serial("Chat IA conversationnel — flux principal", () => {
  test("crée une conversation, l'archive, et persiste réellement après rechargement", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture);

    await page.goto(`/app/tenders/${fixture.tenderId}/assistant`);
    await expect(page.getByRole("heading", { name: "Assistant IA" })).toBeVisible();

    await page.getByRole("button", { name: "+ Nouvelle conversation" }).click();
    await expect(page.getByText("Conversation sans titre")).toBeVisible({ timeout: 15000 });

    // Preuve de persistance réelle après rechargement complet (jamais un état client éphémère).
    await page.reload();
    await expect(page.getByText("Conversation sans titre")).toBeVisible({ timeout: 15000 });

    await page.getByText("Conversation sans titre").click();
    await page.getByRole("button", { name: "Archiver" }).click();
    await expect(page.getByText("Conversation sans titre")).not.toBeVisible({ timeout: 15000 });

    await page.reload();
    await expect(page.getByText("Conversation sans titre")).not.toBeVisible();
  });
});

test.describe("Chat IA conversationnel — isolation multi-tenant", () => {
  test("un utilisateur d'une autre organisation ne peut ni voir ni atteindre l'Assistant IA d'un Tender d'autrui", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture.other);

    await page.goto(`/app/tenders/${fixture.tenderId}/assistant`);

    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(/introuvable/i);
    await expect(page.getByRole("heading", { name: "Assistant IA" })).not.toBeVisible();
  });

  // Mission §5/§49/§50 — même preuve navigateur bout-en-bout que `workspace-collaboration.spec.ts`
  // (audit Codex P1-03) : une fuite same-org cross-client n'est jamais acceptable, même via l'UI
  // (déjà couvert côté API réel par `chat-http.integration.spec.ts`, BLOQUANT).
  test("BLOQUANT — un membre de la MÊME organisation, autorisé sur un client mais pas un autre, ne peut ni voir ni atteindre l'Assistant IA d'un Tender du client auquel il n'est pas affecté", async ({ page }) => {
    const fixture = readFixture();
    await login(page, { email: fixture.collaboratorEmail, password: fixture.collaboratorPassword });

    await page.goto(`/app/tenders/${fixture.tenderInOtherClientId}/assistant`);

    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(/introuvable/i);
    await expect(page.getByRole("heading", { name: "Assistant IA" })).not.toBeVisible();

    // Preuve inverse : le même compte PEUT bien ouvrir l'Assistant IA du Tender de son propre
    // client (fixture.tenderId) — la restriction ci-dessus est bien une isolation par client au
    // sein de la même organisation, jamais un bug d'authentification générale.
    await page.goto(`/app/tenders/${fixture.tenderId}/assistant`);
    await expect(page.getByRole("heading", { name: "Assistant IA" })).toBeVisible();
  });
});
