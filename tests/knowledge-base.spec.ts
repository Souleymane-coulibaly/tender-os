import { expect, test } from "@playwright/test";
import { login, readFixture } from "./fixtures";

/**
 * V2 Sprint 8 (Bibliothèque intelligente / Knowledge Base) — preuves Playwright bout-en-bout
 * contre les vraies applications API + Web + PostgreSQL (aucune simulation) :
 *  - flux principal (mission §68) : création manuelle d'une entrée globale, ajout d'un tag,
 *    validation (jamais un statut hérité), une modification ultérieure crée une NOUVELLE version
 *    jamais validée par défaut (mission §16/§71/§72 — la version 1 reste validée pour toujours dans
 *    son propre historique), recherche full-text, puis archivage — persistance réelle vérifiée
 *    après rechargement complet ;
 *  - scénario de sécurité BLOQUANT (mission §64/§70) : un membre de la MÊME organisation, autorisé
 *    sur un client mais pas un autre, ne peut ni voir ni atteindre une entrée de connaissance du
 *    client auquel il n'est pas affecté — jamais une fuite same-org cross-client, même via l'UI
 *    (déjà couvert côté API réel par `knowledge-http.integration.spec.ts`, ici la même preuve mais
 *    bout-en-bout par le navigateur) — et preuve inverse que ce n'est pas un bug d'authentification
 *    générale (le même compte peut bien créer/voir une entrée de SON PROPRE client).
 */

// `**/app/knowledge/*` matcherait AUSSI `/app/knowledge/new` (un seul segment) : si la page se
// trouve déjà sur une URL correspondant au motif au moment de l'appel, `waitForURL` peut résoudre
// immédiatement, AVANT la vraie navigation vers la fiche fraîchement créée. Un identifiant (UUID)
// exclut sans ambiguïté "new"/"import"/"search".
const KNOWLEDGE_ENTRY_URL_PATTERN = /\/app\/knowledge\/[0-9a-f-]{36}(\?.*)?$/i;

test.describe.serial("Base de connaissances — flux principal", () => {
  test("crée une entrée globale, la tague, la valide, une modification crée une nouvelle version jamais validée, la recherche la trouve, puis elle est archivée — avec persistance réelle", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture);

    const uniqueTitle = `Méthodologie de gestion de projet ${Date.now()}`;

    await page.goto("/app/knowledge/new");
    await page.getByLabel("Titre *").fill(uniqueTitle);
    await page.getByLabel("Catégorie *").selectOption("METHODOLOGY");
    await page.getByLabel("Tags (séparés par une virgule)").fill("agile, gestion-projet");
    await page.getByRole("button", { name: "Créer l'entrée" }).click();

    await page.waitForURL(KNOWLEDGE_ENTRY_URL_PATTERN);
    await expect(page.getByRole("heading", { name: uniqueTitle })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Prête")).toBeVisible();
    await expect(page.getByText("agile")).toBeVisible();
    await expect(page.getByText("gestion-projet")).toBeVisible();

    // Validation (mission §15/§16) — décision humaine explicite, jamais implicite. Le badge
    // d'en-tête est scopé par sa classe : "Validée le ..." apparaît AUSSI dans l'historique des
    // versions (même stamp posé sur la version active elle-même), jamais le même élément.
    await page.getByRole("button", { name: "Valider" }).click();
    const headerValidatedBadge = page.locator("span.bg-emerald-100", { hasText: /^Validée le / });
    await expect(headerValidatedBadge).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "Valider" })).not.toBeVisible();

    // Preuve de persistance réelle après rechargement complet.
    await page.reload();
    await expect(headerValidatedBadge).toBeVisible({ timeout: 15000 });

    // Historique des versions — la version 1 (active) porte bien son propre stamp de validation.
    await expect(page.locator("li", { hasText: "v1" }).getByText(/^Validée le /)).toBeVisible();

    // Une modification substantielle crée une NOUVELLE version, jamais validée par défaut
    // (mission §16/§71/§72) — la confiance ne s'hérite jamais automatiquement.
    const updatedTitle = `${uniqueTitle} (révisée)`;
    await page.getByLabel("Titre", { exact: true }).fill(updatedTitle);
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByRole("heading", { name: updatedTitle })).toBeVisible({ timeout: 15000 });

    // L'historique des versions (composant client à état local) ne se rafraîchit qu'au
    // rechargement complet — un rechargement explicite, jamais un bug de la preuve elle-même.
    await page.reload();
    await expect(page.getByRole("heading", { name: updatedTitle })).toBeVisible({ timeout: 15000 });
    // La nouvelle version 2 active n'hérite JAMAIS la validation (mission §16/§71/§72), même si la
    // version 1 reste validée pour toujours dans son propre historique.
    await expect(page.locator("li", { hasText: "v2" }).getByText(/^Validée le /)).not.toBeVisible();
    await expect(page.locator("li", { hasText: "v1" }).getByText(/^Validée le /)).toBeVisible();

    // Recherche full-text (mission §28/§29) — retrouve l'entrée par un mot du titre.
    await page.goto("/app/knowledge/search");
    await page.getByLabel("Recherche").fill("Méthodologie de gestion de projet");
    await page.getByRole("button", { name: "Rechercher" }).click();
    // `exact: true` exclut l'extrait de résultat, qui cite aussi le titre entre guillemets
    // (texte englobant plus large, jamais une correspondance stricte).
    await expect(page.getByText(updatedTitle, { exact: true })).toBeVisible({ timeout: 15000 });

    // Archivage — jamais une suppression, l'entrée reste consultable via son propre lien.
    await page.getByRole("link", { name: "Ouvrir l'entrée" }).click();
    await page.waitForURL(KNOWLEDGE_ENTRY_URL_PATTERN);
    await page.getByRole("button", { name: "Archiver" }).click();
    await page.getByRole("button", { name: "Confirmer" }).click();
    await expect(page.getByText("Archivée")).toBeVisible({ timeout: 15000 });

    await page.reload();
    await expect(page.getByText("Archivée")).toBeVisible({ timeout: 15000 });
  });
});

test.describe("Base de connaissances — isolation same-org cross-client (mission §64/§70, bloquant)", () => {
  test("un membre de la MÊME organisation, autorisé sur un client mais pas un autre, ne peut ni voir ni atteindre une entrée de connaissance du client auquel il n'est pas affecté", async ({ page, browser }) => {
    const fixture = readFixture();
    await login(page, fixture);

    // Le propriétaire (accès administratif complet) crée une entrée scopée au CLIENT B — celui
    // auquel `collaborator` n'est jamais affecté (voir tests/fixtures.ts, réutilisé du Sprint 7).
    const secretTitle = `Contenu confidentiel Client B ${Date.now()}`;
    await page.goto("/app/knowledge/new");
    await page.getByLabel("Titre *").fill(secretTitle);
    await page.getByLabel("Portée").selectOption(fixture.otherClientAccountId);
    await page.getByLabel("Catégorie *").selectOption("OTHER");
    await page.getByRole("button", { name: "Créer l'entrée" }).click();
    await page.waitForURL(KNOWLEDGE_ENTRY_URL_PATTERN);
    await expect(page.getByRole("heading", { name: secretTitle })).toBeVisible({ timeout: 15000 });
    const entryUrl = page.url();

    // Le collaborateur se connecte SÉPARÉMENT (contexte navigateur distinct, mission §65/§66) — il
    // a un accès réel au Client A mais AUCUN au Client B.
    const collaboratorContext = await browser.newContext();
    const collaboratorPage = await collaboratorContext.newPage();
    await login(collaboratorPage, { email: fixture.collaboratorEmail, password: fixture.collaboratorPassword });

    await collaboratorPage.goto(entryUrl);
    await expect(collaboratorPage.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("Introuvable ou accès refusé");
    await expect(collaboratorPage.getByRole("heading", { name: secretTitle })).not.toBeVisible();

    // La liste et la recherche ne doivent jamais non plus laisser fuiter son existence.
    await collaboratorPage.goto("/app/knowledge");
    await expect(collaboratorPage.getByText(secretTitle)).not.toBeVisible();
    await collaboratorPage.goto("/app/knowledge/search");
    await collaboratorPage.getByLabel("Recherche").fill("Contenu confidentiel Client B");
    await collaboratorPage.getByRole("button", { name: "Rechercher" }).click();
    await expect(collaboratorPage.getByText(secretTitle)).not.toBeVisible();

    // Preuve inverse : ce n'est pas un bug d'authentification générale — le même compte PEUT bien
    // créer et voir une entrée scopée à SON PROPRE client (Client A, mission §63 appliqué à la KB).
    const ownTitle = `Contenu Client A autorisé ${Date.now()}`;
    await collaboratorPage.goto("/app/knowledge/new");
    await collaboratorPage.getByLabel("Titre *").fill(ownTitle);
    await collaboratorPage.getByLabel("Portée").selectOption(fixture.clientAccountId);
    await collaboratorPage.getByLabel("Catégorie *").selectOption("OTHER");
    await collaboratorPage.getByRole("button", { name: "Créer l'entrée" }).click();
    await collaboratorPage.waitForURL(KNOWLEDGE_ENTRY_URL_PATTERN);
    await expect(collaboratorPage.getByRole("heading", { name: ownTitle })).toBeVisible({ timeout: 15000 });

    await collaboratorContext.close();
  });
});
