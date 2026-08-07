import { expect, test } from "@playwright/test";
import { login, readFixture } from "./fixtures";

/**
 * V2 Sprint 5 (GO/NO-GO IA) — preuves Playwright bout-en-bout des deux niveaux de décision, contre
 * les vraies applications API + Web + PostgreSQL (aucune simulation) :
 *  - Niveau 1 (`opportunity` module) : préqualification complète jusqu'à la promotion en Tender.
 *  - Niveau 2 (`go-no-go` sur la fiche Tender) : rapport complet + décision GO_CONDITIONAL, dont la
 *    condition obligatoire (mission §18) et la non-altération du statut du Tender.
 */
test.describe.serial("Opportunity — parcours Niveau 1 complet jusqu'à la promotion", () => {
  test("crée une Opportunity, la qualifie, calcule un score, décide GO puis la promeut en appel d'offres", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture);

    await page.goto("/app/opportunities/new");
    await page.getByLabel("Titre *").fill("Marché Playwright — préqualification");
    await page.locator("#clientAccountId").selectOption(fixture.clientAccountId);
    await page.getByRole("button", { name: "Créer l'opportunité" }).click();

    await page.waitForURL(/\/app\/opportunities\/[0-9a-f-]+$/);
    const opportunityId = page.url().split("/opportunities/")[1];
    await expect(page.getByRole("heading", { name: "Marché Playwright — préqualification" })).toBeVisible();
    await expect(page.getByText("Brouillon")).toBeVisible();

    // Funnel amont : DRAFT -> TO_QUALIFY -> QUALIFIED (jamais GO/GO_CONDITIONAL/NO_GO via ce
    // sélecteur générique — uniquement via la section Décision, mission §5).
    await page.locator("#opportunity-status").selectOption("TO_QUALIFY");
    await page.getByRole("button", { name: "Appliquer" }).click();
    await expect(page.getByText("À qualifier")).toBeVisible();

    await page.locator("#opportunity-status").selectOption("QUALIFIED");
    await page.getByRole("button", { name: "Appliquer" }).click();
    await expect(page.getByText("Qualifiée")).toBeVisible();

    // Score de préqualification — décomposé par catégorie, jamais un simple pourcentage isolé.
    const quickScoreSection = page.locator("section", { has: page.getByRole("heading", { name: "Score de préqualification" }) });
    await quickScoreSection.getByRole("button", { name: "Calculer le score" }).click();
    await expect(quickScoreSection.getByText(/^\d+(\.\d+)?\/100$/)).toBeVisible();
    await expect(quickScoreSection.getByText("Certifications", { exact: true })).toBeVisible();
    await expect(quickScoreSection.getByText(/aide à la décision, jamais une prédiction de gain/)).toBeVisible();

    // Décision humaine GO — distincte de tout score/recommandation.
    await page.getByRole("button", { name: "GO", exact: true }).click();
    await page.getByRole("button", { name: "Enregistrer la décision" }).click();
    await expect(page.getByText("GO", { exact: true }).first()).toBeVisible();

    // Promotion — crée un NOUVEAU Tender, jamais une transformation de l'Opportunity. La preuve
    // visible s'arrête volontairement à l'URL réelle du Tender créé : la fiche Tender complète
    // (Cockpit/Deliverables/DCE…) est HORS PÉRIMÈTRE Sprint 5 et porte un bug préexistant sans
    // rapport (`EnsureTenderDeliverablesUseCase` non idempotent à la toute première vue d'un
    // Tender neuf) — jamais un correctif de ce module ici. La confirmation du contenu se fait via
    // la fiche Opportunity elle-même juste après, qui ne dépend d'aucun de ces modules.
    await page.getByRole("button", { name: "Promouvoir en appel d'offres" }).click();
    await page.waitForURL(/\/app\/tenders\/[0-9a-f-]+$/, { timeout: 15000 });

    // Retour sur la fiche Opportunity : statut PROMOTED, lien vers le Tender créé.
    await page.goto(`/app/opportunities/${opportunityId}`);
    await expect(page.getByRole("heading", { name: "Marché Playwright — préqualification" })).toBeVisible();
    await expect(page.getByText("Promue en appel d'offres", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Voir l'appel d'offres/ })).toBeVisible();
  });
});

test.describe.serial("Tender — parcours GO/NO-GO Niveau 2 avec décision GO_CONDITIONAL", () => {
  test("génère le rapport complet, refuse une décision GO_CONDITIONAL sans condition, puis l'accepte avec une condition — sans jamais modifier le statut du Tender", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture);

    await page.goto(`/app/tenders/${fixture.tenderWithAnalysisId}`);
    await expect(page.getByText("En analyse")).toBeVisible();

    const goNoGoSection = page.locator("section", { has: page.getByRole("heading", { name: "Rapport GO / NO-GO (analyse complète)" }) });
    await expect(goNoGoSection).toBeVisible();
    await goNoGoSection.getByRole("button", { name: "Générer le rapport" }).click();

    await expect(goNoGoSection.getByText("Recommandation IA :")).toBeVisible({ timeout: 15000 });
    await expect(goNoGoSection.getByText(/recommandation indicative/i)).toBeVisible();
    await expect(goNoGoSection.getByText("Certifications", { exact: true })).toBeVisible();

    // Décision humaine GO_CONDITIONAL — la condition reste obligatoire (mission §18), revalidée
    // ici via le VRAI backend (jamais une simple validation côté client contournable).
    await goNoGoSection.getByRole("button", { name: "GO conditionnel" }).click();
    await goNoGoSection.getByRole("button", { name: "Enregistrer la décision" }).click();
    await expect(goNoGoSection.getByText(/conditions sont obligatoires/i)).toBeVisible();

    await goNoGoSection.locator("#tender-conditions").fill("Sous réserve d'un renfort de l'équipe technique avant le dépôt.");
    await goNoGoSection.getByRole("button", { name: "Enregistrer la décision" }).click();
    await expect(goNoGoSection.getByText("GO conditionnel", { exact: true }).first()).toBeVisible();
    await expect(goNoGoSection.getByText("Sous réserve d'un renfort de l'équipe technique avant le dépôt.")).toBeVisible();

    // Preuve centrale du Niveau 2 (mission §18) : la décision GO/NO-GO ne modifie JAMAIS le statut
    // du Tender lui-même — toujours piloté exclusivement par le module Tenders.
    await expect(page.getByText("En analyse")).toBeVisible();
  });
});
