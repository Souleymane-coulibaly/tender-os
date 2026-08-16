import { expect, type Page, test } from "@playwright/test";
import { login, readFixture } from "./fixtures";

/**
 * V2 Sprint 25 (Pricing dédié, Checkpoint 25B) — preuve Playwright bout-en-bout contre les vraies
 * applications API + Web, même motif que `landing.spec.ts` (Sprint 23). `/pricing` est publique par
 * construction (mission §25.32) — aucune authentification requise pour la majorité des scénarios.
 */
async function gotoResilient(page: Page, path: string): Promise<void> {
  try {
    const response = await page.goto(path, { timeout: 45000 });
    if (response && response.status() >= 500) {
      await page.goto(path, { timeout: 45000 });
    }
  } catch {
    await page.goto(path, { timeout: 45000 });
  }
}

/**
 * Correctif réaudit Codex Checkpoint 25E (P1) — la version précédente de ce test injectait son
 * propre stub `window.gtag` via `addInitScript`, ce qui ne prouvait que l'appel au STUB de test,
 * jamais que l'application réelle expose correctement `window.gtag` (Codex a démontré que
 * `apps/web/src/lib/analytics.ts` ne le faisait en réalité JAMAIS — `trackEvent` était un no-op
 * silencieux en production, peu importe le consentement). Ce défaut est désormais corrigé à la
 * source dans `analytics.ts` (affectation de `window.gtag` au chargement du module, indépendante du
 * script GA4 lui-même). Ce test n'a donc plus besoin d'injecter quoi que ce soit : il lit
 * directement `window.dataLayer`, alimenté par le VRAI code applicatif, preuve du comportement de
 * production plutôt que d'un double de test.
 */
async function hasTrackedEvent(page: Page, eventName: string): Promise<boolean> {
  return page.evaluate((name) => {
    const dataLayer = (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];
    return dataLayer.some((entry) => Array.isArray(entry) && entry[0] === "event" && entry[1] === name);
  }, eventName);
}

test.describe.serial("/pricing — flux principal", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("mission §25.111 — affiche les prix réels de chaque palier (valeurs du catalogue, jamais recalculées côté frontend)", async ({ page }) => {
    test.setTimeout(90000);
    await gotoResilient(page, "/pricing");

    await expect(page.getByRole("heading", { name: "Des offres adaptées à votre façon de répondre" })).toBeVisible();

    await expect(page.getByText("99", { exact: false }).first()).toBeVisible(); // Pass
    await expect(page.getByText("199", { exact: false }).first()).toBeVisible(); // Starter mensuel
    await expect(page.getByText("599", { exact: false }).first()).toBeVisible(); // Business mensuel
    await expect(page.getByText("1 099", { exact: false }).first()).toBeVisible(); // Enterprise mensuel
    await expect(page.getByText("Sur devis")).toBeVisible(); // Conseil
  });

  test("mission §25.23/§25.111 — le toggle Mensuel/Annuel change le prix affiché (Starter 199 -> 2 189, Business 599 -> 6 589)", async ({ page }) => {
    await gotoResilient(page, "/pricing");

    const offersSection = page.locator("#offres");
    await offersSection.scrollIntoViewIfNeeded();
    await expect(offersSection.getByText("199", { exact: false })).toBeVisible();
    await expect(offersSection.getByText("599", { exact: false })).toBeVisible();

    await offersSection.getByRole("button", { name: "Annuel" }).click();
    await expect(offersSection.getByText("2 189", { exact: false })).toBeVisible();
    await expect(offersSection.getByText("6 589", { exact: false })).toBeVisible();
  });

  test("mission §25.5/§25.45 — la carte Starter affiche le badge Trial, la date projetée et la mention carte bancaire/aucun débit", async ({ page }) => {
    await gotoResilient(page, "/pricing");

    const offersSection = page.locator("#offres");
    await offersSection.scrollIntoViewIfNeeded();
    await expect(offersSection.getByText("14 JOURS D'ESSAI GRATUIT")).toBeVisible();
    await expect(offersSection.getByText("à partir du", { exact: false })).toBeVisible();
    await expect(offersSection.getByText("Carte bancaire requise", { exact: false })).toBeVisible();
    await expect(offersSection.getByText("résilier avant cette date", { exact: false })).toBeVisible();
  });

  test("mission §25.112 — le CTA Starter route vers /onboarding en conservant l'intervalle sélectionné", async ({ page }) => {
    await gotoResilient(page, "/pricing");

    const offersSection = page.locator("#offres");
    await offersSection.scrollIntoViewIfNeeded();
    await offersSection.getByRole("button", { name: "Annuel" }).click();

    await offersSection.getByRole("link", { name: "Démarrer mon essai gratuit" }).click();
    await expect(page).toHaveURL(/\/onboarding\?plan=STARTER&billing=YEARLY/);
  });

  test("mission §25.50 — le comparateur affiche les offres avec des lignes dérivées des Entitlements réels (jamais une matrice inventée)", async ({ page }) => {
    await gotoResilient(page, "/pricing");

    await expect(page.getByRole("heading", { name: "Comparer les offres" })).toBeVisible();
    const table = page.getByRole("table");
    await table.scrollIntoViewIfNeeded();
    await expect(table.getByRole("rowheader", { name: "Crédits AO", exact: true })).toBeVisible();

    const headerCells = await table.locator("thead th").allInnerTexts();
    expect(headerCells).toContain("Entreprise");

    // API/Webhooks réservés à Entreprise dans le catalogue réel (mission "ne pas maintenir une
    // deuxième matrice manuelle divergente") : une seule des 4 colonnes doit porter la coche, jamais
    // "inclus partout" comme les fonctionnalités de base (Analyse, Checklist, etc.).
    const apiRow = table.locator("tr", { has: page.getByRole("rowheader", { name: "API" }) });
    await expect(apiRow.locator("svg")).toHaveCount(1);
    const webhooksRow = table.locator("tr", { has: page.getByRole("rowheader", { name: "Webhooks" }) });
    await expect(webhooksRow.locator("svg")).toHaveCount(1);
    const analysisRow = table.locator("tr", { has: page.getByRole("rowheader", { name: "Analyse IA du DCE" }) });
    await expect(analysisRow.locator("svg")).toHaveCount(4);
  });

  test("mission §25.51 — la FAQ Pricing est présente et distincte de la FAQ produit de la Landing", async ({ page }) => {
    await gotoResilient(page, "/pricing");

    const faqSection = page.locator("#faq-pricing");
    await faqSection.scrollIntoViewIfNeeded();
    await expect(faqSection.getByText("Comment fonctionne l'essai Starter ?")).toBeVisible();
    await expect(faqSection.getByText("Quand serai-je débité ?")).toBeVisible();
  });

  test("mission §25.115 — /pricing est indexable avec une metadata SEO correcte", async ({ page }) => {
    await gotoResilient(page, "/pricing");

    await expect(page).toHaveTitle(/Tarifs TenderOS/);
    const description = await page.locator('meta[name="description"]').getAttribute("content");
    expect(description).toContain("14 jours d'essai");
    const robotsMeta = await page.locator('meta[name="robots"]').count();
    expect(robotsMeta).toBe(0); // aucune balise noindex n'a été ajoutée
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(canonical).toContain("/pricing");
  });

  test("mission §25.92 — pricing_page_viewed part réellement après consentement, jamais avant, jamais perdu si le consentement arrive après le montage", async ({ page }) => {
    await gotoResilient(page, "/pricing");

    // Avant consentement — jamais d'événement émis (mission §34 "avant tout consentement, tout est denied").
    expect(await hasTrackedEvent(page, "pricing_page_viewed")).toBe(false);

    await page.getByRole("button", { name: "Tout accepter" }).click();

    // Correctif P2 — le composant réagit au consentement accordé APRÈS son montage, jamais un
    // simple événement raté par un `useEffect(() => {}, [])` qui ne se redéclenche jamais.
    await expect.poll(() => hasTrackedEvent(page, "pricing_page_viewed")).toBe(true);
  });

  test("mission §25.92 — starter_trial_selected part au clic sur le CTA Starter, distinct de pricing_plan_selected", async ({ page }) => {
    await gotoResilient(page, "/pricing");
    await page.getByRole("button", { name: "Tout accepter" }).click();

    const offersSection = page.locator("#offres");
    await offersSection.scrollIntoViewIfNeeded();
    await offersSection.getByRole("link", { name: "Démarrer mon essai gratuit" }).click();

    await expect.poll(() => hasTrackedEvent(page, "starter_trial_selected")).toBe(true);
  });

  test("mission §25.114 — un utilisateur déjà connecté avec une organisation ne voit jamais l'étape de création d'organisation depuis un CTA Pricing", async ({ page }) => {
    test.setTimeout(90000);
    const fixture = readFixture();
    await login(page, fixture);

    await gotoResilient(page, "/pricing");
    const offersSection = page.locator("#offres");
    await offersSection.scrollIntoViewIfNeeded();
    await offersSection.getByRole("link", { name: "Choisir Business" }).click();

    // L'organisation existante est réutilisée (mission "ne doit pas recréer une organisation") :
    // direction l'étape de sélection d'offre pour CETTE organisation, jamais la création de compte
    // ni la création d'organisation.
    await expect(page).toHaveURL(/\/onboarding\/offre/);
    await expect(page.getByRole("heading", { name: "Choisissez votre offre" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Créez votre compte" })).toHaveCount(0);
    await expect(page.getByLabel("Nom de l'entreprise")).toHaveCount(0);
  });
});
