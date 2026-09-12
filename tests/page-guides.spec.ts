import { expect, type Page, test } from "@playwright/test";
import { ensureLoggedIn, readFixture } from "./fixtures";

/**
 * Guides de page — preuve bout-en-bout : chaque page proposant un guide affiche « Guide de cette
 * page », le guide se déroule jusqu'à « Terminer » avec chaque étape ancrée sur un élément
 * réellement visible, et le bandeau de première visite, une fois écarté (« Plus tard »), ne revient
 * pas — l'état est mémorisé côté serveur, par utilisateur. Même utilisateur de fixture pour tous
 * les tests : `.serial()`, comme `guide.spec.ts`.
 */
async function gotoResilient(page: Page, path: string): Promise<void> {
  try {
    const response = await page.goto(path, { timeout: 45000 });
    if (response && response.status() >= 500) await page.goto(path, { timeout: 45000 });
  } catch {
    await page.goto(path, { timeout: 45000 });
  }
}

/** La proposition de bienvenue (visite globale) a priorité sur le bandeau de page : on l'écarte. */
async function dismissWelcomePromptIfVisible(page: Page): Promise<void> {
  const welcome = page.getByRole("region", { name: "Bienvenue" });
  if (await welcome.isVisible().catch(() => false)) {
    await welcome.getByRole("button", { name: "Plus tard" }).click();
    await expect(welcome).toBeHidden();
  }
}

function pageGuideDialog(page: Page) {
  return page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Fermer le guide de la page" }) });
}

/** Ouvre « Guide de cette page » et le déroule jusqu'à « Terminer » : chaque étape doit viser un
 *  élément visible et surligné, l'infobulle rester dans l'écran. */
async function runGuideToEnd(page: Page, guideKey: string): Promise<void> {
  await page.getByRole("button", { name: "Guide de cette page" }).click();
  const dialog = pageGuideDialog(page);
  await expect(dialog).toBeVisible();

  const counter = await dialog.getByText(/Étape 1 \/ \d/).textContent();
  const total = Number(counter?.match(/\/ (\d+)/)?.[1]);
  expect(total, "au moins 2 étapes présentes à l'écran").toBeGreaterThanOrEqual(2);

  for (let step = 1; step <= total; step += 1) {
    await expect(dialog.getByText(`Étape ${step} / ${total}`)).toBeVisible();
    // L'élément ciblé par l'étape courante est surligné et visible — jamais un guide qui pointe
    // dans le vide.
    const highlighted = page.locator(`[data-tour^="guide-${guideKey}-"].tenderos-guide-target`);
    await expect(highlighted).toBeVisible();
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport && box.x >= 0 && box.x + box.width <= viewport.width, "infobulle dans l'écran").toBeTruthy();
    await dialog.getByRole("button", { name: step === total ? "Terminer" : "Suivant" }).click();
  }
  await expect(dialog).toBeHidden();
  await expect(page.locator(".tenderos-guide-target")).toHaveCount(0);
}

type GuidePage = { key: string; label: string; path: (fixture: ReturnType<typeof readFixture>) => string };

const LOT_A: readonly GuidePage[] = [
  { key: "dashboard", label: "Tableau de bord", path: () => "/app" },
  { key: "market-watch", label: "Veille", path: () => "/app/market-watch" },
  { key: "opportunities", label: "Opportunités", path: () => "/app/opportunities" },
  { key: "tenders", label: "Appels d'offres", path: () => "/app/tenders" },
  { key: "tender-overview", label: "Fiche appel d'offres", path: (f) => `/app/tenders/${f.tenderId}` },
  { key: "knowledge", label: "Base de connaissances", path: () => "/app/knowledge" },
  { key: "documents", label: "Documents", path: () => "/app/documents" },
  { key: "clients", label: "Clients", path: () => "/app/clients" },
  { key: "validations", label: "Mes validations", path: () => "/app/validations" },
];

/** Lot B — onglets de la fiche AO, sur l'organisation ABONNÉE de la fixture : plusieurs onglets
 *  exigent un droit actif que l'organisation principale n'a volontairement pas. */
const LOT_B: readonly { key: string; label: string; tab: string }[] = [
  { key: "tender-dce", label: "DCE", tab: "dce" },
  { key: "tender-analysis", label: "Analyse", tab: "analysis" },
  { key: "tender-checklist", label: "Checklist", tab: "checklist" },
  { key: "tender-collaboration", label: "Collaboration", tab: "workspace" },
  { key: "tender-assistant", label: "Assistant IA", tab: "assistant" },
  { key: "tender-technical-memo", label: "Rédaction IA du mémoire", tab: "technical-memo" },
  { key: "tender-administrative-dossier", label: "Dossier administratif", tab: "administrative-dossier" },
  { key: "tender-pricing-schedule", label: "Chiffrage", tab: "pricing-schedule" },
  { key: "tender-pricing", label: "Estimation & coûts IA", tab: "pricing" },
  { key: "tender-deliverables", label: "Livrables", tab: "deliverables" },
  { key: "tender-generations", label: "Générations", tab: "generations" },
  { key: "tender-documents-generated", label: "Documents générés", tab: "documents-generated" },
  { key: "tender-validation", label: "Validation", tab: "validation" },
  { key: "tender-signature", label: "Signature", tab: "signature" },
  { key: "tender-submission-package", label: "Dossier de soumission", tab: "submission-package" },
  { key: "tender-response-package", label: "Dossier final", tab: "response-package" },
  { key: "tender-submission", label: "Dépôt", tab: "submission" },
  { key: "tender-export", label: "Export", tab: "export" },
];

/** Lot C — ressources et paramètres, sur l'organisation PRINCIPALE (sans abonnement) : les guides
 *  doivent tenir aussi quand une fonction est réservée à un forfait supérieur. Intégrations et
 *  Configuration IA : un guide par section, parcouru sur chaque onglet. */
const LOT_C: readonly GuidePage[] = [
  { key: "subscription", label: "Abonnement & utilisation", path: () => "/app/subscription" },
  { key: "members", label: "Membres", path: () => "/app/members" },
  { key: "integrations", label: "Intégrations › Clés API", path: () => "/app/integrations/api-keys" },
  { key: "integrations", label: "Intégrations › Webhooks", path: () => "/app/integrations/webhooks" },
  { key: "integrations", label: "Intégrations › Connecteurs", path: () => "/app/integrations/connectors" },
  { key: "ai-configuration", label: "Configuration IA", path: () => "/app/ai-configuration/models" },
  { key: "ai-costs", label: "Coûts IA", path: () => "/app/pricing" },
  { key: "candidate-companies", label: "Entreprises candidates", path: () => "/app/candidate-companies" },
  { key: "subcontractors", label: "Sous-traitants", path: () => "/app/subcontractor-profiles" },
];

test.describe.serial("Guides de page", () => {
  test("bandeau de première visite : « Plus tard » l'écarte, et il ne revient pas après rechargement", async ({ page }) => {
    const fixture = readFixture();
    // Session réutilisée : une connexion par test dépassait la limite partagée de 10 connexions
    // par minute (« Trop de tentatives »), sans rapport avec les guides.
    await ensureLoggedIn(page, fixture);
    // La visite de bienvenue a priorité : tant que l'utilisateur n'a pas répondu à sa proposition
    // (affichée sur le tableau de bord), aucun bandeau de page n'apparaît. On y répond d'abord.
    await gotoResilient(page, "/app");
    await dismissWelcomePromptIfVisible(page);
    await gotoResilient(page, "/app/knowledge");

    // Premier test de la suite, utilisateur recréé à chaque passage : le guide de cette page n'a
    // jamais été vu — le bandeau DOIT apparaître.
    const banner = page.getByRole("region", { name: "Guide de la page Base de connaissances" });
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: "Plus tard" }).click();
    await expect(banner).toBeHidden();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(banner).toBeHidden();
  });

  for (const guidePage of LOT_A) {
    test(`${guidePage.label} — « Guide de cette page » se déroule jusqu'à « Terminer », chaque étape sur un élément visible`, async ({ page }) => {
      const fixture = readFixture();
      await ensureLoggedIn(page, fixture);
      await gotoResilient(page, guidePage.path(fixture));
      await dismissWelcomePromptIfVisible(page);
      await runGuideToEnd(page, guidePage.key);
    });
  }

  for (const tab of LOT_B) {
    test(`Fiche AO › ${tab.label} — « Guide de cette page » se déroule jusqu'à « Terminer », chaque étape sur un élément visible`, async ({ page }) => {
      const fixture = readFixture();
      await ensureLoggedIn(page, fixture.cockpit);
      await gotoResilient(page, `/app/tenders/${fixture.cockpit.tenderId}/${tab.tab}`);
      await runGuideToEnd(page, tab.key);
    });
  }

  for (const guidePage of LOT_C) {
    test(`${guidePage.label} — « Guide de cette page » se déroule jusqu'à « Terminer », chaque étape sur un élément visible`, async ({ page }) => {
      const fixture = readFixture();
      await ensureLoggedIn(page, fixture);
      await gotoResilient(page, guidePage.path(fixture));
      await runGuideToEnd(page, guidePage.key);
    });
  }

  test("mobile (390 px) : le guide reste dans l'écran", async ({ page }) => {
    const fixture = readFixture();
    await page.setViewportSize({ width: 390, height: 844 });
    await ensureLoggedIn(page, fixture);
    await gotoResilient(page, "/app/tenders");
    await dismissWelcomePromptIfVisible(page);

    await page.getByRole("button", { name: "Guide de cette page" }).click();
    const dialog = pageGuideDialog(page);
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= 390, "infobulle dans l'écran à 390 px").toBeTruthy();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});
