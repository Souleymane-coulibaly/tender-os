import { expect, test } from "@playwright/test";
import { login, readFixture } from "./fixtures";
import { buildMinimalPdf } from "./pdf-fixture";

const VIEWPORTS = [
  { name: "desktop", size: { width: 1280, height: 800 } },
  { name: "tablette", size: { width: 834, height: 1112 } },
  { name: "mobile", size: { width: 390, height: 844 } },
] as const;

/**
 * Mission Sprint 8A.2 — Cockpit Bid Manager : preuves Playwright de la section ajoutée en tête de
 * la fiche Tender (GetTenderCockpitUseCase, backend-driven) et du parcours DCE → extraction
 * automatique → bouton "Analyser" (bug #2 élargi). Les assertions ne portent jamais sur le module
 * DELIVERABLES (état partagé avec memoire-technique.spec.ts, ordre d'exécution des fichiers non
 * garanti) — uniquement sur DCE/Analyse, propres à ce fichier et à ce Tender.
 */
for (const viewport of VIEWPORTS) {
  test.describe(`Cockpit — état initial — ${viewport.name}`, () => {
    test.use({ viewport: viewport.size });

    test("un Tender neuf affiche l'étape Découverte et invite à initialiser le DCE", async ({ page }) => {
      const fixture = readFixture();
      await login(page, fixture);
      await page.goto(`/app/tenders/${fixture.tenderId}`);

      const cockpit = page.locator("section", { has: page.getByRole("heading", { name: "Cockpit" }) });
      await expect(cockpit).toBeVisible();
      await expect(cockpit.getByText("Découverte du dossier")).toBeVisible();
      await expect(cockpit.getByText(/Prochaine action\s*:\s*Initialiser le DCE/)).toBeVisible();
      await expect(cockpit.getByText("Documents & DCE")).toBeVisible();
      await expect(cockpit.getByText("Pas commencé").first()).toBeVisible();
    });
  });
}

test.describe("Cockpit — navigation clavier vers les sous-écrans (accessibilité minimale)", () => {
  test("les liens de module du Cockpit sont atteignables et activables au clavier", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture);
    await page.goto(`/app/tenders/${fixture.tenderId}`);

    const cockpit = page.locator("section", { has: page.getByRole("heading", { name: "Cockpit" }) });
    const deliverablesLink = cockpit.getByRole("link", { name: /Livrables/ });
    await expect(deliverablesLink).toBeVisible();
    await deliverablesLink.focus();
    await expect(deliverablesLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/tenders\/[0-9a-f-]+\/deliverables$/);
  });
});

test.describe.serial("Cockpit — parcours DCE jusqu'à l'analyse (correction bug #2 élargie)", () => {
  // Organisation abonnée dédiée (fixture.cockpit) : le DCE exige un droit actif (P2.3-E1.3).
  test("initialise le DCE puis importe un document PDF réellement extractible", async ({ page }) => {
    const fixture = readFixture().cockpit;
    await login(page, fixture);
    // Le DCE a son propre écran depuis la consolidation v2.1 (be5f1fe).
    await page.goto(`/app/tenders/${fixture.tenderId}/dce`);

    await page.getByRole("button", { name: "Initialiser le DCE" }).click();
    await expect(page.getByText("Aucun document du DCE.")).toBeVisible();

    const pdfBytes = buildMinimalPdf(["Cahier des charges — preuve Playwright Cockpit."]);
    await page.locator('input[name="files"]').setInputFiles({ name: "cctp-cockpit.pdf", mimeType: "application/pdf", buffer: pdfBytes });
    await page.getByRole("button", { name: "Importer", exact: true }).click();

    await expect(page.getByText(/cctp-cockpit\.pdf — import[ée]/)).toBeVisible();
    await expect(page.getByText("cctp-cockpit.pdf")).toBeVisible();
  });

  test("l'extraction se déclenche automatiquement sans action manuelle, jusqu'à Prêt pour analyse", async ({ page }) => {
    const fixture = readFixture().cockpit;
    await login(page, fixture);
    // Le DCE a son propre écran depuis la consolidation v2.1 (be5f1fe).
    await page.goto(`/app/tenders/${fixture.tenderId}/dce`);

    // Mission Sprint 8A.2 (correction bug #2 élargie) — jamais un déclenchement manuel de
    // l'extraction ici : seul "Actualiser" relit l'état déjà déclenché en arrière-plan par
    // l'import (AutoTriggerDocumentExtractionUseCase), jamais un second bouton d'extraction.
    await expect(async () => {
      await page.getByRole("button", { name: "Actualiser" }).first().click();
      await expect(page.getByText("Prêt pour analyse")).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20000, intervals: [500] });
  });

  test("le bouton Analyser se déclenche une fois l'extraction terminée, et affiche un statut en français", async ({ page }) => {
    const fixture = readFixture().cockpit;
    await login(page, fixture);
    // Le DCE a son propre écran depuis la consolidation v2.1 (be5f1fe).
    await page.goto(`/app/tenders/${fixture.tenderId}/dce`);

    await expect(async () => {
      await page.getByRole("button", { name: "Actualiser" }).first().click();
      await expect(page.getByText("Prêt pour analyse")).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20000, intervals: [500] });

    const analyzeButton = page.getByRole("button", { name: "Analyser", exact: true });
    await expect(analyzeButton).toBeEnabled();
    await analyzeButton.click();

    // Aucune clé IA configurée dans cet environnement Playwright (comportement déterministe déjà
    // exploité côté backend, mission §"Configuration") — le statut progresse à travers un cycle de
    // libellés FRANÇAIS (ANALYSIS_STATUS_LABELS), jamais un code technique brut affiché tel quel
    // (bug #10) : "En attente"/"En file d'attente"/"En cours" puis un état terminal.
    await expect(
      page.getByText(/En attente|En file d'attente|En cours|[ÉE]chou[ée]e|Termin[ée]e|Annul[ée]e/),
    ).toBeVisible({ timeout: 15000 });
  });

  test("le Cockpit reflète la progression réelle : DCE Terminé, étape Analyse IA", async ({ page }) => {
    const fixture = readFixture().cockpit;
    await login(page, fixture);
    await page.goto(`/app/tenders/${fixture.tenderId}`);

    const cockpit = page.locator("section", { has: page.getByRole("heading", { name: "Cockpit" }) });
    await expect(cockpit).toBeVisible();
    // Le libellé d'étape est le seul <p> direct du Cockpit (les autres occurrences de "Analyse IA"
    // sont la prochaine action et la carte de module) — jamais une ambiguïté silencieuse.
    await expect(cockpit.locator("p", { hasText: "Analyse IA" })).toBeVisible();
    await expect(cockpit.getByText(/Prochaine action\s*:\s*Lancer l'analyse IA/)).toBeVisible();

    const dceCard = cockpit.locator("li", { hasText: "Documents & DCE" });
    await expect(dceCard.getByText("Terminé")).toBeVisible();
  });
});
