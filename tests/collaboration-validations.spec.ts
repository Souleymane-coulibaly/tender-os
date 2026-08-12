import { expect, test, type Locator, type Page } from "@playwright/test";
import { login, readFixture } from "./fixtures";

/**
 * V2 Sprint 18 (Collaboration avancée & validations finales) — preuves Playwright bout-en-bout
 * contre les vraies applications API + Web + PostgreSQL, sur `fixture.tenderId`. Le flux
 * commentaire/mention/assignation/demande de validation sur une Tâche est déjà entièrement couvert
 * par `workspace-collaboration.spec.ts` (Sprint 7) depuis le panneau intégré au Workspace ; cette
 * suite se concentre donc sur ce qui est réellement NOUVEAU ce sprint : le rejet avec motif
 * obligatoire, le centre de validations "Mes validations" (`/app/validations`), et la cloche de
 * notification comme point d'entrée vers une demande de validation.
 */

async function ensureParticipant(section: Locator, userId: string, role: string, expectedText: string): Promise<void> {
  const already = await section.locator("ul").getByText(expectedText, { exact: true }).count();
  if (already > 0) return;
  await section.locator("select[name=userId]").selectOption(userId);
  await section.locator("select[name=role]").selectOption(role);
  await section.getByRole("button", { name: "Ajouter" }).click();
  await expect(section.locator("ul").getByText(expectedText, { exact: true })).toBeVisible({ timeout: 15000 });
}

/** La cloche ne se rafraîchit qu'au rendu serveur (mission §37/§99) : jamais un polling client, donc
 *  on recharge la page jusqu'à ce que le badge non-lu apparaisse (le worker Outbox réel traite les
 *  événements en tâche de fond, pas de façon synchrone avec la requête HTTP qui les a déclenchés). */
async function waitForUnreadNotification(page: Page): Promise<void> {
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("button", { name: "Notifications" }).locator("span")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20000, intervals: [2000] });
}

test.describe.serial("Collaboration & validations — parcours principal", () => {
  test("demande de validation sur une tâche → notification → cloche → Mes validations → approbation, activité mise à jour", async ({ page, browser }) => {
    const fixture = readFixture();
    await login(page, fixture);

    await page.goto(`/app/tenders/${fixture.tenderId}/workspace`);
    await expect(page.getByRole("heading", { name: "Workspace collaboratif" })).toBeVisible();

    const teamSection = page.locator("section", { has: page.getByRole("heading", { name: "Équipe" }) });
    await ensureParticipant(teamSection, fixture.userId, "TENDER_MANAGER", "Playwright E2E");
    await ensureParticipant(teamSection, fixture.collaboratorUserId, "TECHNICAL_WRITER", "Playwright E2E Collaborateur");

    // Création + commentaire + mention + assignation — étapes distinctes (mission §127 pas 3-5),
    // jamais une seule action combinée.
    const taskTitle = `RC — Rapport de synthèse ${Date.now()}`;
    const tasksSection = page.locator("section", { has: page.getByRole("heading", { name: "Tâches" }) });
    await tasksSection.getByPlaceholder("Nouvelle tâche...").fill(taskTitle);
    await tasksSection.getByRole("button", { name: "Ajouter" }).click();

    const taskRow = tasksSection.locator("li", { hasText: taskTitle });
    await expect(taskRow).toBeVisible({ timeout: 15000 });

    await taskRow.getByRole("button", { name: "Commenter" }).click();
    await taskRow.getByPlaceholder("Nouveau commentaire...").fill("Merci de préparer la synthèse pour la revue finale.");
    await taskRow.getByLabel("Mentionner un participant").selectOption({ label: "@Playwright E2E Collaborateur" });
    await taskRow.getByRole("button", { name: "Envoyer" }).click();
    await expect(taskRow.locator("ul").getByText(/@Playwright E2E Collaborateur/)).toBeVisible({ timeout: 15000 });

    await taskRow.getByLabel("Responsable de la tâche").selectOption({ label: "Playwright E2E Collaborateur" });
    await expect(taskRow.getByText("Responsable : Playwright E2E Collaborateur")).toBeVisible({ timeout: 15000 });

    // Le collaborateur (mentionné + assigné) demande la validation — jamais auto-validée par son
    // propre demandeur (mission §30), le reviewer choisi est le propriétaire.
    const collaboratorContext = await browser.newContext();
    const collaboratorPage = await collaboratorContext.newPage();
    await login(collaboratorPage, { email: fixture.collaboratorEmail, password: fixture.collaboratorPassword });

    await collaboratorPage.goto("/app/me/tasks");
    await collaboratorPage.getByRole("link", { name: taskTitle }).click();
    await collaboratorPage.waitForURL(`**/app/tenders/${fixture.tenderId}/workspace`);

    const collaboratorApprovalsSection = collaboratorPage.locator("section", { has: collaboratorPage.getByRole("heading", { name: "Validations" }) });
    await collaboratorApprovalsSection.locator("select[name=entityId]").selectOption({ label: taskTitle });
    await collaboratorApprovalsSection.locator("select[name=reviewerId]").selectOption({ label: "Playwright E2E" });
    await collaboratorApprovalsSection.getByRole("button", { name: "Demander une validation" }).click();
    await expect(collaboratorApprovalsSection.getByText("En attente de validation")).toBeVisible({ timeout: 15000 });
    await collaboratorContext.close();

    // Le propriétaire (reviewer) découvre la demande via la cloche — jamais en devinant l'URL
    // (mission §68 : la demande alimente le badge de notification).
    await waitForUnreadNotification(page);
    await page.getByRole("button", { name: "Notifications" }).click();
    const notificationItem = page.getByRole("button", { name: /Une validation vous est demandée/ });
    await expect(notificationItem).toBeVisible({ timeout: 15000 });
    await notificationItem.click();
    await page.waitForURL(/\/app\/validations/);

    // Centre de validations — approbation depuis cette page, jamais depuis le Workspace cette fois
    // (preuve que les deux chemins écrivent bien le même `ApprovalRequest`). Vue "Toutes" (pas de
    // filtre de statut) : la ligne reste en place après approbation (son badge change simplement),
    // contrairement à une vue filtrée "En attente" qui la ferait légitimement disparaître. Scopé à
    // <main> : la nav latérale est elle-même une <ul><li> (12 entrées), un `getByRole("listitem")`
    // non scopé les compterait aussi — cette organisation étant fraîchement créée pour ce test, une
    // seule demande existe au total à ce stade, quel que soit son statut.
    await expect(page.getByRole("heading", { name: "Mes validations" })).toBeVisible();
    const pendingRows = page.locator("main").getByRole("listitem");
    await expect(pendingRows).toHaveCount(1, { timeout: 15000 });
    const pendingRow = pendingRows.first();
    await pendingRow.click();
    await pendingRow.getByRole("button", { name: "Approuver" }).click();
    await expect(pendingRow.getByText("Validé", { exact: true })).toBeVisible({ timeout: 15000 });

    // L'activité du Tender reflète la décision, prise depuis le centre de validations.
    await page.goto(`/app/tenders/${fixture.tenderId}/workspace`);
    const activitySection = page.locator("section", { has: page.getByRole("heading", { name: "Activité récente" }) });
    await expect(activitySection.getByText(/validation approuvée/)).toBeVisible({ timeout: 15000 });
  });
});

test.describe.serial("Collaboration & validations — rejet avec motif", () => {
  test("un rejet sans motif est refusé, un rejet avec motif passe la demande à Rejeté et se retrouve dans Mes validations", async ({ page, browser }) => {
    const fixture = readFixture();
    await login(page, fixture);

    await page.goto(`/app/tenders/${fixture.tenderId}/workspace`);
    const taskTitle = `RC — Rejet volontaire ${Date.now()}`;
    const tasksSection = page.locator("section", { has: page.getByRole("heading", { name: "Tâches" }) });
    await tasksSection.getByPlaceholder("Nouvelle tâche...").fill(taskTitle);
    await tasksSection.locator("select[name=assigneeId]").selectOption({ label: "Playwright E2E Collaborateur" });
    await tasksSection.getByRole("button", { name: "Ajouter" }).click();
    await expect(tasksSection.locator("li", { hasText: taskTitle })).toBeVisible({ timeout: 15000 });

    const collaboratorContext = await browser.newContext();
    const collaboratorPage = await collaboratorContext.newPage();
    await login(collaboratorPage, { email: fixture.collaboratorEmail, password: fixture.collaboratorPassword });
    await collaboratorPage.goto(`/app/tenders/${fixture.tenderId}/workspace`);
    const collaboratorApprovalsSection = collaboratorPage.locator("section", { has: collaboratorPage.getByRole("heading", { name: "Validations" }) });
    await collaboratorApprovalsSection.locator("select[name=entityId]").selectOption({ label: taskTitle });
    await collaboratorApprovalsSection.locator("select[name=reviewerId]").selectOption({ label: "Playwright E2E" });
    await collaboratorApprovalsSection.getByRole("button", { name: "Demander une validation" }).click();
    await expect(collaboratorApprovalsSection.getByText("En attente de validation")).toBeVisible({ timeout: 15000 });
    await collaboratorContext.close();

    // Le propriétaire (reviewer) va cette fois directement au centre de validations, filtré "En
    // attente" — jamais besoin de la cloche pour atteindre cette page.
    await page.goto("/app/validations?status=PENDING");
    await expect(page.getByRole("heading", { name: "Mes validations" })).toBeVisible();
    // Scopé à <main> : la nav latérale est elle-même une <ul><li> (12 entrées), un
    // `getByRole("listitem")` non scopé les compterait aussi.
    const rows = page.locator("main").getByRole("listitem");
    await expect(rows).toHaveCount(1, { timeout: 15000 });
    const row = rows.first();
    await row.click();

    // Motif obligatoire (mission §34) — le bouton de confirmation reste désactivé tant que le champ
    // est vide.
    await row.getByRole("button", { name: "Rejeter" }).click();
    const confirmButton = row.getByRole("button", { name: "Confirmer le rejet" });
    await expect(confirmButton).toBeDisabled();

    const reason = "Le budget prévisionnel de la section 3 doit être revu avant validation.";
    await row.getByLabel("Raison du rejet").fill(reason);
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();

    // Une fois rejetée, la demande quitte légitimement la vue filtrée "En attente" (elle ne
    // correspond plus au filtre) — la preuve du nouveau statut se fait donc depuis le filtre
    // "Rejetées", jamais en réinterrogeant la même ligne qui vient de disparaître de cette vue.
    await page.goto("/app/validations?status=REJECTED");
    const rejectedRows = page.locator("main").getByRole("listitem");
    await expect(rejectedRows).toHaveCount(1, { timeout: 15000 });
    const rejectedRow = rejectedRows.first();
    await expect(rejectedRow.getByText("Rejeté", { exact: true })).toBeVisible();
    await rejectedRow.click();
    await expect(rejectedRow.getByText(reason)).toBeVisible();
    // Décision déjà prise — plus aucune action possible sur cette demande (jamais une seconde
    // décision silencieuse, mission §84).
    await expect(rejectedRow.getByRole("button", { name: "Approuver" })).not.toBeVisible();
    await expect(rejectedRow.getByRole("button", { name: "Rejeter" })).not.toBeVisible();

    // Persistance réelle après rechargement complet.
    await page.reload();
    await expect(page.locator("main").getByRole("listitem").getByText("Rejeté", { exact: true })).toBeVisible({ timeout: 15000 });
  });
});

test.describe("Collaboration & validations — mobile 390px", () => {
  test("le centre de validations reste utilisable à 390px, sans débordement horizontal", async ({ page }) => {
    const fixture = readFixture();
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, fixture);

    await page.goto("/app/validations");
    await expect(page.getByRole("heading", { name: "Mes validations" })).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(hasHorizontalOverflow).toBe(false);

    // Au moins une demande (créée par les tests précédents de cette suite) reste consultable et
    // manipulable à cette largeur — jamais un contrôle inatteignable en mobile (mission §101-103).
    // Scopé à <main> : la nav est elle-même une <ul><li>, un `getByRole("listitem")` non scopé la
    // matcherait aussi.
    const firstRow = page.locator("main").getByRole("listitem").first();
    await expect(firstRow).toBeVisible({ timeout: 15000 });
    await firstRow.click();
  });
});
