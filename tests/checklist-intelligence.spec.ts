import { expect, test } from "@playwright/test";
import { login, readFixture } from "./fixtures";

/**
 * V2 Sprint 6 (Checklist intelligente DCE) — preuves Playwright bout-en-bout contre les vraies
 * applications API + Web + PostgreSQL (aucune simulation), sur `fixture.tenderWithAnalysisId`
 * (analyse IA déjà réussie, findings Requirement/Criterion/Deadline réels — voir
 * `apps/api/prisma/e2e-seed.ts`) :
 *  - flux principal : génération des suggestions IA -> validation humaine explicite (jamais
 *    automatique) -> apparition dans la checklist -> validation métier -> persistance réelle après
 *    rechargement complet de la page ;
 *  - création manuelle d'un élément, recherche documentaire (jamais d'association silencieuse même
 *    sans correspondance), mise en "non applicable" -> persistance ;
 *  - réconciliation avec la dernière analyse : ne modifie/n'écrase jamais un élément déjà validé.
 */
test.describe.serial("Checklist intelligente DCE — flux principal", () => {
  test("génère une suggestion IA, la fait valider par un humain, puis crée/traite un élément manuel — avec persistance réelle", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture);

    await page.goto(`/app/tenders/${fixture.tenderWithAnalysisId}`);
    await expect(page.getByRole("heading", { name: "Cockpit" })).toBeVisible();

    const aiSection = page.locator("section", { has: page.getByRole("heading", { name: /Suggestions IA à valider/ }) });
    await expect(aiSection).toBeVisible();

    // Génération — jamais une checklist pré-remplie : une action humaine explicite déclenche le
    // mapping gouverné des findings déjà seedés (Requirement/Criterion éliminatoire/Deadline VISIT).
    await aiSection.getByRole("button", { name: "Générer les suggestions" }).click();
    await expect(aiSection.getByText(/suggestion\(s\) générée\(s\)/)).toBeVisible({ timeout: 15000 });

    // La suggestion issue du RequirementFinding cible désormais CHECKLIST_ITEM (redirection Sprint
    // 6, jamais TENDER_REQUESTED_DOCUMENT pour une nouvelle suggestion) — preuve visible via le
    // libellé de catalogue et la valeur proposée (titre repris du finding, jamais halluciné).
    const requirementSuggestion = aiSection.locator("li", { hasText: "Attestation d'assurance responsabilité civile professionnelle" });
    await expect(requirementSuggestion).toBeVisible();
    await expect(requirementSuggestion.getByText("Nouvel élément de checklist")).toBeVisible();
    await expect(requirementSuggestion.getByText("Nouvelle entrée")).toBeVisible();

    // Validation humaine explicite — jamais une transformation automatique du Finding en donnée
    // métier validée (mission §1/§20).
    await requirementSuggestion.getByRole("button", { name: "Appliquer" }).click();
    await expect(requirementSuggestion).not.toBeVisible({ timeout: 15000 });

    // Depuis la consolidation v2.1 (be5f1fe), la checklist a son propre écran : la suggestion
    // s'applique depuis le Cockpit, son résultat se vérifie sur l'écran Checklist.
    await page.goto(`/app/tenders/${fixture.tenderWithAnalysisId}/checklist`);

    const checklistSection = page.locator("section", { has: page.getByRole("heading", { name: "Checklist", exact: true }) });
    await expect(checklistSection).toBeVisible();

    const aiItemRow = checklistSection.locator("li", { hasText: "Attestation d'assurance responsabilité civile professionnelle" });
    await expect(aiItemRow).toBeVisible({ timeout: 15000 });
    await expect(aiItemRow.getByText("Document administratif")).toBeVisible();
    await expect(aiItemRow.getByText("Suggéré par l'IA")).toBeVisible();

    // Validation métier de l'élément — distincte de l'acceptation de la suggestion IA (mission §24 :
    // jamais confondu avec un score global, ici seulement l'état de CET élément).
    await aiItemRow.getByRole("button", { name: "Valider" }).click();
    await expect(aiItemRow.getByText("Validé")).toBeVisible({ timeout: 15000 });

    // Preuve de persistance réelle (jamais un simple état client éphémère) : après un rechargement
    // complet de la page, l'élément reste validé et l'action "Valider" a disparu.
    await page.reload();
    const aiItemRowAfterReload = checklistSection.locator("li", { hasText: "Attestation d'assurance responsabilité civile professionnelle" });
    await expect(aiItemRowAfterReload.getByText("Validé")).toBeVisible();
    await expect(aiItemRowAfterReload.getByRole("button", { name: "Valider" })).not.toBeVisible();

    // Création manuelle — origine MANUAL, jamais issue d'une suggestion IA (mission §21).
    // Le formulaire d'ajout manuel est désigné par SON champ : la section porte d'autres boutons
    // « Ajouter » (une seule recherche par nom serait ambiguë).
    const manualAddForm = checklistSection.locator("form", { has: page.getByPlaceholder(/Nouvel [ée]l[ée]ment\.\.\./) });
    await manualAddForm.getByPlaceholder(/Nouvel [ée]l[ée]ment\.\.\./).fill("Pièce complémentaire test E2E");
    await manualAddForm.getByRole("button", { name: "Ajouter" }).click();
    const manualItemRow = checklistSection.locator("li", { hasText: "Pièce complémentaire test E2E" });
    await expect(manualItemRow).toBeVisible({ timeout: 15000 });

    // Rapprochement documentaire — jamais une association silencieuse, même en l'absence de
    // correspondance (mission §17/§19 : la checklist doit expliquer ce qui manque, jamais
    // transformer une absence de correspondance en une fausse certitude).
    await manualItemRow.getByRole("button", { name: "Rechercher un document" }).click();
    await expect(manualItemRow.getByText("Aucun document correspondant trouvé.")).toBeVisible({ timeout: 15000 });
    await expect(manualItemRow.getByRole("button", { name: "Associer" })).not.toBeVisible();

    // Non applicable — persistance vérifiée après rechargement, comme pour la validation ci-dessus.
    await manualItemRow.getByRole("button", { name: "Non applicable", exact: true }).click();
    await page.reload();
    const manualItemRowAfterReload = checklistSection.locator("li", { hasText: "Pièce complémentaire test E2E" });
    await expect(manualItemRowAfterReload.getByText("Non applicable").first()).toBeVisible();
    await expect(manualItemRowAfterReload.getByRole("button", { name: "Non applicable", exact: true })).not.toBeVisible();

    // Réconciliation avec la dernière analyse — ne doit jamais écraser un élément déjà validé
    // (mission §22) : l'élément validé ci-dessus reste "Validé" après l'opération.
    await checklistSection.getByRole("button", { name: "Comparer avec la dernière analyse" }).click();
    await expect(checklistSection.getByText(/\d+ nouvelle\(s\) suggestion\(s\), \d+ élément\(s\) à vérifier\./)).toBeVisible({ timeout: 15000 });
    await expect(checklistSection.locator("li", { hasText: "Attestation d'assurance responsabilité civile professionnelle" }).getByText("Validé")).toBeVisible();
  });
});

test.describe("Checklist intelligente DCE — isolation multi-tenant", () => {
  test("un utilisateur d'une autre organisation ne peut ni voir ni atteindre la checklist d'un Tender d'autrui", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture.other);

    await page.goto(`/app/tenders/${fixture.tenderWithAnalysisId}`);

    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(/introuvable/i);
    await expect(page.getByRole("heading", { name: "Checklist", exact: true })).not.toBeVisible();
    await expect(page.getByText("Attestation d'assurance responsabilité civile professionnelle")).not.toBeVisible();
  });
});
