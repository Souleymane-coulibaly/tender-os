import { expect, test } from "@playwright/test";
import { login, readFixture } from "./fixtures";

/**
 * V2 Sprint 7 (Workspace collaboratif) — preuves Playwright bout-en-bout contre les vraies
 * applications API + Web + PostgreSQL (aucune simulation), sur `fixture.tenderId` :
 *  - flux principal (mission §65) : le propriétaire (OWNER) s'ajoute lui-même comme participant,
 *    ajoute un second membre RÉEL de la même organisation (`fixture.collaboratorEmail`, voir
 *    `apps/api/prisma/e2e-seed.ts`), crée une tâche assignée à ce second membre ; le second membre
 *    se connecte SÉPARÉMENT (contexte navigateur distinct — jamais la même session), la retrouve
 *    dans "Mes tâches", commente en mentionnant le propriétaire, passe la tâche en cours puis la
 *    termine, demande une validation ; le propriétaire (reviewer) approuve ; le fil d'activité
 *    reflète tous ces événements ; persistance réelle vérifiée après rechargement complet ;
 *  - scénario de sécurité (mission §66) : un utilisateur d'une autre organisation ne peut ni voir
 *    ni atteindre le Workspace d'un Tender d'autrui (404, jamais une fuite d'existence).
 */
test.describe.serial("Workspace collaboratif — flux principal", () => {
  test("ajoute des participants, crée/assigne/complète une tâche depuis un second compte réel, commente avec mention, puis fait valider par le reviewer — avec persistance réelle", async ({ page, browser }) => {
    const fixture = readFixture();
    await login(page, fixture);

    await page.goto(`/app/tenders/${fixture.tenderId}/workspace`);
    await expect(page.getByRole("heading", { name: "Workspace collaboratif" })).toBeVisible();

    const teamSection = page.locator("section", { has: page.getByRole("heading", { name: "Équipe" }) });
    const addParticipantButton = teamSection.getByRole("button", { name: "Ajouter" });

    // Le propriétaire s'ajoute lui-même en TENDER_MANAGER — nécessaire pour pouvoir ensuite être
    // reviewer d'une demande de validation (mission §29 : seul un participant actif peut valider).
    await teamSection.locator("select[name=userId]").selectOption({ label: `Playwright E2E (${fixture.email})` });
    await teamSection.locator("select[name=role]").selectOption("TENDER_MANAGER");
    await addParticipantButton.click();
    // Scopé à la liste (<ul>) : le formulaire d'ajout, encore affiché tant qu'il reste un candidat
    // (le collaborateur), contient aussi un <option> "Responsable du dossier" dans son select de rôle.
    await expect(teamSection.locator("ul").getByText("Responsable du dossier")).toBeVisible({ timeout: 15000 });

    // Second membre RÉEL de la même organisation, avec un accès client réel (jamais le filet de
    // secours administratif) — devient assignable/mentionnable/participant actif.
    await addParticipantButton.click();
    await expect(teamSection.getByText("Playwright E2E Collaborateur")).toBeVisible({ timeout: 15000 });
    await expect(teamSection.getByText("Rédacteur technique")).toBeVisible();

    // Création d'une tâche assignée au second membre — jamais une affectation automatique par IA
    // (mission §17), un choix humain explicite via le formulaire.
    const tasksSection = page.locator("section", { has: page.getByRole("heading", { name: "Tâches" }) });
    await tasksSection.getByPlaceholder("Nouvelle tâche...").fill("Préparer les pièces administratives");
    await tasksSection.locator("select[name=priority]").selectOption("HIGH");
    await tasksSection.locator("select[name=assigneeId]").selectOption({ label: "Playwright E2E Collaborateur" });
    await tasksSection.getByRole("button", { name: "Ajouter" }).click();

    const taskRow = tasksSection.locator("li", { hasText: "Préparer les pièces administratives" });
    await expect(taskRow).toBeVisible({ timeout: 15000 });
    await expect(taskRow.getByText("Responsable : Playwright E2E Collaborateur")).toBeVisible();

    // Preuve de persistance réelle après rechargement complet de la page (jamais un état client
    // éphémère) avant que le second acteur ne se connecte séparément.
    await page.reload();
    await expect(page.locator("li", { hasText: "Préparer les pièces administratives" }).getByText("Responsable : Playwright E2E Collaborateur")).toBeVisible({ timeout: 15000 });

    // Le participant se connecte SÉPARÉMENT — un second acteur réel, jamais la même session
    // (mission §65 : "le participant se connecte" implique une vraie seconde authentification).
    const collaboratorContext = await browser.newContext();
    const collaboratorPage = await collaboratorContext.newPage();
    await login(collaboratorPage, { email: fixture.collaboratorEmail, password: fixture.collaboratorPassword });

    await collaboratorPage.goto("/app/me/tasks");
    await expect(collaboratorPage.getByRole("heading", { name: "Mes tâches" })).toBeVisible();
    const myTaskLink = collaboratorPage.getByRole("link", { name: "Préparer les pièces administratives" });
    await expect(myTaskLink).toBeVisible({ timeout: 15000 });
    await myTaskLink.click();
    await collaboratorPage.waitForURL(`**/app/tenders/${fixture.tenderId}/workspace`);

    // Scopé à la section Tâches : le fil d'activité affiche désormais aussi le titre de la tâche
    // dans ses résumés ("Tâche créée : « ... »", "Tâche « ... » assignée."), un simple `li` non
    // scopé matcherait plusieurs éléments.
    const collaboratorTasksSection = collaboratorPage.locator("section", { has: collaboratorPage.getByRole("heading", { name: "Tâches" }) });
    const collaboratorTaskRow = collaboratorTasksSection.locator("li", { hasText: "Préparer les pièces administratives" });
    await expect(collaboratorTaskRow).toBeVisible({ timeout: 15000 });

    // Commentaire mentionnant un participant réel — jamais un texte libre "@Jean" (mission §22/§23),
    // toujours résolu vers un membre existant, choisi dans la liste des participants réels.
    await collaboratorTaskRow.getByRole("button", { name: "Commenter" }).click();
    await collaboratorTaskRow.getByPlaceholder("Nouveau commentaire...").fill("Dossier en préparation, je vous tiens informé.");
    await collaboratorTaskRow.getByLabel("Mentionner un participant").selectOption({ label: "@Playwright E2E" });
    await collaboratorTaskRow.getByRole("button", { name: "Envoyer" }).click();
    await expect(collaboratorTaskRow.getByText(/Dossier en préparation/)).toBeVisible({ timeout: 15000 });
    // Scopé à la liste des commentaires (<ul>) : le select "Mentionner un participant" reste
    // affiché juste après et contient aussi des <option> "@Playwright E2E...".
    await expect(collaboratorTaskRow.locator("ul").getByText(/@Playwright E2E\b/)).toBeVisible();

    // Passage EN_COURS puis TERMINÉE — jamais une transition silencieuse, chaque changement de
    // statut est une action explicite distincte de la validation de checklist (mission §13).
    await collaboratorTaskRow.getByLabel("Statut de la tâche").selectOption("IN_PROGRESS");
    await expect(collaboratorTaskRow.getByLabel("Statut de la tâche")).toHaveValue("IN_PROGRESS");
    await collaboratorTaskRow.getByLabel("Statut de la tâche").selectOption("DONE");
    await expect(collaboratorTaskRow.getByLabel("Statut de la tâche")).toHaveValue("DONE");

    // Demande de validation — jamais auto-validée par son propre demandeur (mission §30) : le
    // reviewer choisi est le propriétaire (TENDER_MANAGER), un acteur distinct.
    const approvalsSection = collaboratorPage.locator("section", { has: collaboratorPage.getByRole("heading", { name: "Validations" }) });
    await approvalsSection.locator("select[name=entityId]").selectOption({ label: "Préparer les pièces administratives" });
    await approvalsSection.locator("select[name=reviewerId]").selectOption({ label: "Playwright E2E" });
    await approvalsSection.getByRole("button", { name: "Demander une validation" }).click();
    await expect(approvalsSection.getByText("En attente de validation")).toBeVisible({ timeout: 15000 });

    // Jamais présenté comme une signature électronique/légale (mission §28/§56) — nulle part dans
    // le panneau de validation.
    await expect(approvalsSection.getByText(/\bsigné\b/i)).not.toBeVisible();

    // Le collaborateur (simple demandeur, jamais reviewer de sa propre demande) ne voit aucun
    // bouton d'approbation.
    await expect(approvalsSection.getByRole("button", { name: "Valider" })).not.toBeVisible();

    // Le reviewer (propriétaire) approuve depuis SA session — un second acteur réel, jamais le
    // demandeur lui-même.
    await page.reload();
    const ownerApprovalsSection = page.locator("section", { has: page.getByRole("heading", { name: "Validations" }) });
    await expect(ownerApprovalsSection.getByText("En attente de validation")).toBeVisible({ timeout: 15000 });
    await ownerApprovalsSection.getByRole("button", { name: "Valider" }).click();
    await expect(ownerApprovalsSection.getByText("Validé")).toBeVisible({ timeout: 15000 });

    // Fil d'activité — reflète les événements métier réels, jamais l'AuditLog technique brut
    // (mission §31/§33), et n'expose aucun contenu sensible.
    const activitySection = page.locator("section", { has: page.getByRole("heading", { name: "Activité récente" }) });
    await expect(activitySection.getByText(/Tâche créée/)).toBeVisible({ timeout: 15000 });
    await expect(activitySection.getByText(/assignée/)).toBeVisible();
    await expect(activitySection.getByText(/→ DONE/)).toBeVisible();
    await expect(activitySection.getByText(/validation approuvée/)).toBeVisible();

    // Preuve de persistance réelle après un rechargement complet (jamais un simple état client) —
    // la tâche reste "Terminée" et la validation reste "Validé".
    await page.reload();
    await expect(page.locator("li", { hasText: "Préparer les pièces administratives" }).getByLabel("Statut de la tâche")).toHaveValue("DONE");
    await expect(page.locator("section", { has: page.getByRole("heading", { name: "Validations" }) }).getByText("Validé")).toBeVisible();

    await collaboratorContext.close();
  });
});

test.describe("Workspace collaboratif — isolation multi-tenant", () => {
  test("un utilisateur d'une autre organisation ne peut ni voir ni atteindre le Workspace d'un Tender d'autrui", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture.other);

    await page.goto(`/app/tenders/${fixture.tenderId}/workspace`);

    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(/introuvable/i);
    await expect(page.getByRole("heading", { name: "Workspace collaboratif" })).not.toBeVisible();
    await expect(page.getByText("Préparer les pièces administratives")).not.toBeVisible();
  });

  // Correctif audit Codex P1-03 — l'isolation inter-organisation ci-dessus ne suffit pas : la
  // mission §5/§63 exige explicitement la preuve navigateur réelle qu'un membre de la MÊME
  // organisation, autorisé sur un client mais pas un autre, ne peut ni voir ni atteindre le
  // Workspace d'un Tender du client auquel il n'est PAS affecté — jamais une fuite same-org
  // cross-client, même via l'UI (déjà couvert côté API réel par
  // `workspace-http.integration.spec.ts`, ici la même preuve mais bout-en-bout par le navigateur).
  test("un membre de la MÊME organisation, autorisé sur un client mais pas un autre, ne peut ni voir ni atteindre le Workspace d'un Tender du client auquel il n'est pas affecté", async ({ page }) => {
    const fixture = readFixture();
    await login(page, { email: fixture.collaboratorEmail, password: fixture.collaboratorPassword });

    await page.goto(`/app/tenders/${fixture.tenderInOtherClientId}/workspace`);

    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(/introuvable/i);
    await expect(page.getByRole("heading", { name: "Workspace collaboratif" })).not.toBeVisible();

    // Preuve inverse : le même compte PEUT bien ouvrir le Workspace du Tender de son propre client
    // (fixture.tenderId) — la restriction ci-dessus n'est pas un bug d'authentification générale,
    // c'est bien une isolation par client au sein de la même organisation.
    await page.goto(`/app/tenders/${fixture.tenderId}/workspace`);
    await expect(page.getByRole("heading", { name: "Workspace collaboratif" })).toBeVisible();
  });
});
