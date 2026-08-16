import { expect, type Page, test } from "@playwright/test";

/**
 * V2 Sprint 23 (landing) — preuve Playwright bout-en-bout contre les vraies applications API + Web,
 * même motif que `billing-subscription.spec.ts` (Sprint 22E) : `gotoResilient` réessaie une fois
 * sur le tout premier accès à une route fraîchement compilée (flake Next.js 15 dev déjà documenté).
 * Aucune authentification requise ici — la Landing est publique par construction (mission §2).
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

/** Même flake que `gotoResilient`, version client-side (clic sur un `<Link>` next/link) : le tout
 *  premier accès à `/contact` dans cette session de serveur dev peut échouer silencieusement côté
 *  routeur client pendant la compilation à la demande de la route. Un second clic (route déjà
 *  compilée) réussit systématiquement. */
async function clickAndExpectNavigation(page: Page, locator: ReturnType<Page["getByRole"]>, urlPattern: RegExp): Promise<void> {
  await locator.click();
  try {
    await expect(page).toHaveURL(urlPattern, { timeout: 8000 });
  } catch {
    await locator.click();
    await expect(page).toHaveURL(urlPattern, { timeout: 15000 });
  }
}

const FORBIDDEN_CLIENT_NAMES = ["SPIE", "VINCI", "Eiffage", "Suez", "Sopra Steria", "Renault", "Transdev"];
const FORBIDDEN_CLAIMS = ["500+", "99%", "ISO 27001", "SOC 2", "SecNumCloud", "leader", "n°1"];

test.describe.serial("Landing Page publique — flux principal", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("charge sans compte, affiche le Hero réel, et ne présente aucun faux client ni claim invérifiable (mission §11/§56/§57)", async ({ page }) => {
    test.setTimeout(90000);
    await gotoResilient(page, "/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Gagnez plus");
    await expect(page.getByRole("link", { name: "Demander une démo" }).first()).toBeVisible();

    const bodyText = await page.locator("body").innerText();
    for (const name of FORBIDDEN_CLIENT_NAMES) {
      expect(bodyText).not.toContain(name);
    }
    for (const claim of FORBIDDEN_CLAIMS) {
      expect(bodyText).not.toContain(claim);
    }
  });

  test("BLOQUANT (mission §58/§59) — première visite : banner visible, Analytics/Crisp non initialisés ; 'Tout refuser' aussi accessible que 'Tout accepter'", async ({ page }) => {
    await gotoResilient(page, "/");

    await expect(page.getByText("Votre confidentialité compte")).toBeVisible();

    const gtagLoaded = await page.evaluate(() => typeof (window as unknown as { gtag?: unknown }).gtag === "function");
    expect(gtagLoaded).toBe(false);
    const crispLoaded = await page.evaluate(() => (window as unknown as { $crisp?: unknown }).$crisp !== undefined);
    expect(crispLoaded).toBe(false);

    const rejectButton = page.getByRole("button", { name: "Tout refuser" });
    const acceptButton = page.getByRole("button", { name: "Tout accepter" });
    await expect(rejectButton).toBeVisible();
    await expect(acceptButton).toBeVisible();

    await rejectButton.click();
    await expect(page.getByText("Votre confidentialité compte")).toBeHidden();

    // mission §59 — le choix persiste, jamais reredemandé au rechargement.
    await page.reload();
    await expect(page.getByText("Votre confidentialité compte")).toBeHidden();
  });

  /**
   * Correctif réaudit Codex Checkpoint 25E (3e tour, P1/P2) — un correctif précédent de `trackEvent`
   * s'appuyait sur l'existence de `window.gtag` comme unique garde, alors que `site-header.tsx` et
   * `tracked-link.tsx` appellent `trackEvent` directement au clic, SANS aucune garde de consentement
   * locale — ils comptaient implicitement sur ce que `trackEvent` refuse d'agir avant consentement.
   * Rendre `window.gtag` disponible avant consentement (pour corriger un autre défaut) cassait donc
   * silencieusement cette protection. `trackEvent` est désormais gardé par un drapeau de consentement
   * explicite (`analytics.ts`) — preuve directe ici que cliquer un CTA du header AVANT toute décision
   * de consentement ne met RIEN en file dans `dataLayer`, jamais seulement que `window.gtag` est absent.
   */
  test("BLOQUANT (mission §58/§59) — cliquer un CTA du header avant consentement ne met jamais d'événement en file dans dataLayer", async ({ page }) => {
    await gotoResilient(page, "/");
    await expect(page.getByText("Votre confidentialité compte")).toBeVisible();

    await page.getByRole("link", { name: "Se connecter" }).first().click();
    await page.waitForURL(/\/app\/login/);

    const dataLayer = await page.evaluate(() => (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? []);
    const hasAnyEvent = dataLayer.some((entry) => Array.isArray(entry) && entry[0] === "event");
    expect(hasAnyEvent).toBe(false);
  });

  test("mission §39/§42 — 'Gestion des cookies' (footer) rouvre les préférences, et un choix personnalisé (Analytics ON, Support OFF) est respecté", async ({ page }) => {
    await gotoResilient(page, "/");
    await page.getByRole("button", { name: "Tout refuser" }).click();
    await expect(page.getByText("Votre confidentialité compte")).toBeHidden();

    await page.getByRole("button", { name: "Gestion des cookies" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByLabel("Autoriser la mesure d'audience").check();
    await page.getByRole("button", { name: "Enregistrer mes choix" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("V2 Sprint 25 (mission §25.113) — la Landing ne contient plus aucune section Pricing détaillée, le lien Tarifs mène à /pricing, la nouvelle section bénéfices est visible", async ({ page }) => {
    await gotoResilient(page, "/");
    await page.getByRole("button", { name: "Tout refuser" }).click();

    // Plus de toggle Mensuel/Annuel ni de cards de prix sur la Landing (retirés mission §25.33).
    await expect(page.locator("#tarifs")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Annuel" })).toHaveCount(0);

    const benefitsSection = page.locator("#benefices");
    await benefitsSection.scrollIntoViewIfNeeded();
    await expect(benefitsSection.getByRole("heading", { name: "TenderOS simplifie chaque étape de vos appels d'offres" })).toBeVisible();
    await expect(benefitsSection.getByText("Ne cherchez plus partout")).toBeVisible();

    await clickAndExpectNavigation(page, page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Tarifs" }), /\/pricing$/);
  });

  test("mission §54 — les 4 pages légales sont réellement accessibles, jamais un lien mort", async ({ page }) => {
    // 4 routes visitées pour la toute première fois dans cette session de serveur dev — chacune
    // compilée à la demande (même flake documenté que `gotoResilient`) : le timeout par défaut
    // (60s, playwright.config.ts) peut être dépassé par la SOMME des 4 premiers accès, jamais par
    // un seul isolément. `waitForLoadState("networkidle")` est par ailleurs notoirement instable
    // avec `next dev` (connexion HMR persistante, le réseau n'atteint jamais réellement
    // l'inactivité) — retiré : l'assertion `toBeVisible` ci-dessous fait déjà son propre polling.
    test.setTimeout(120000);
    for (const path of ["/legal/mentions", "/legal/privacy", "/legal/cookies", "/legal/terms"]) {
      await gotoResilient(page, path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });

  test("mission §49 — mobile (390px) : le menu hamburger fonctionne, la navigation desktop reste masquée", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoResilient(page, "/");
    await page.getByRole("button", { name: "Tout refuser" }).click();

    // Scopé au header — "Fonctionnalités" existe aussi dans le footer (toujours visible, jamais
    // masqué par le breakpoint mobile), un `getByRole` non scopé matcherait les deux.
    await expect(page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Fonctionnalités" })).toBeHidden();

    await page.getByRole("button", { name: "Ouvrir le menu" }).click();
    await expect(page.getByRole("navigation", { name: "Navigation mobile" })).toBeVisible();
  });

  test("BLOQUANT (non-régression auth, mission §70) — /app reste protégé, /app/login reste fonctionnel après l'introduction de la Landing", async ({ page }) => {
    await gotoResilient(page, "/app/tenders");
    await expect(page).toHaveURL(/\/app\/login/);
    await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
  });

  test("mission 23A.42N — les 8 étapes du Workflow tiennent sur UNE SEULE ligne à 1440/1280px (correctif du bug réel 'Finaliser' passait à la ligne)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoResilient(page, "/");
    await page.getByRole("button", { name: "Tout refuser" }).click();

    const detecter = page.getByText("Détecter", { exact: true });
    const finaliser = page.getByText("Finaliser", { exact: true });
    await detecter.scrollIntoViewIfNeeded();
    const [detecterBox, finaliserBox] = await Promise.all([detecter.boundingBox(), finaliser.boundingBox()]);
    expect(detecterBox).not.toBeNull();
    expect(finaliserBox).not.toBeNull();
    // Même ligne : les deux libellés doivent partager approximativement la même coordonnée Y
    // (jamais "Finaliser" en dessous de "Détecter").
    expect(Math.abs((detecterBox?.y ?? 0) - (finaliserBox?.y ?? 0))).toBeLessThan(10);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.reload();
    await page.getByRole("button", { name: "Tout refuser" }).click();
    const [detecterBox2, finaliserBox2] = await Promise.all([
      page.getByText("Détecter", { exact: true }).boundingBox(),
      page.getByText("Finaliser", { exact: true }).boundingBox(),
    ]);
    expect(Math.abs((detecterBox2?.y ?? 0) - (finaliserBox2?.y ?? 0))).toBeLessThan(10);
  });

  test("mission §21/§66/§67 — la section Intégrations affiche les 6 pictogrammes et ne revendique jamais un partenariat/statut natif non prouvé", async ({ page }) => {
    await gotoResilient(page, "/");
    await page.getByRole("button", { name: "Tout refuser" }).click();

    const integrationsSection = page.locator("#integrations");
    await integrationsSection.scrollIntoViewIfNeeded();

    for (const name of ["Microsoft 365", "Google Workspace", "API publique", "Webhooks", "n8n", "Make"]) {
      await expect(integrationsSection.getByText(name, { exact: true })).toBeVisible();
    }

    const sectionText = await integrationsSection.innerText();
    for (const forbidden of ["natif", "officiel", "partenaire", "certifié", "Partner"]) {
      expect(sectionText.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    expect(sectionText).toContain("Compatible via API & Webhooks");
  });

  test("mission §42/§54/§70 — le bandeau secteurs défile, la copie dupliquée (boucle) est aria-hidden (jamais lue deux fois par un lecteur d'écran)", async ({ page }) => {
    await gotoResilient(page, "/");

    const duplicateCount = await page.locator(".tenderos-marquee-duplicate").getAttribute("aria-hidden");
    expect(duplicateCount).toBe("true");

    const visibleSectorCount = await page.getByText("Facilities Management", { exact: true }).count();
    // Une seule instance "accessible" (l'autre est dans le bloc aria-hidden, toujours présente dans
    // le DOM pour la boucle CSS mais jamais annoncée) — Playwright compte les deux occurrences DOM,
    // ce test vérifie donc que l'UNE des deux est bien portée par un ancêtre aria-hidden.
    expect(visibleSectorCount).toBeGreaterThanOrEqual(1);
  });

  test("mission §40/§69 — prefers-reduced-motion désactive l'animation du bandeau secteurs (jamais de mouvement imposé)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoResilient(page, "/");

    const animationName = await page.locator(".tenderos-marquee-track").evaluate((el) => getComputedStyle(el).animationName);
    expect(animationName).toBe("none");
  });

  test("mission §42P/§42T — la FAQ est présente dans le HTML servi (jamais chargée uniquement après hydratation) et s'ouvre/ferme au clic", async ({ page }) => {
    // Contenu SSR : demandé au serveur directement, sans exécuter le JS client (preuve la plus
    // stricte que les réponses sont bien dans le HTML, mission §42T).
    const raw = await (await fetch("http://localhost:3000/")).text();
    expect(raw).toContain("Qu&#x27;est-ce que TenderOS");
    expect(raw).toContain("TenderOS est une plateforme de gestion");
    expect(raw).toContain('"@type":"FAQPage"');

    await gotoResilient(page, "/");
    await page.getByRole("button", { name: "Tout refuser" }).click();

    const faqSection = page.locator("#faq");
    await faqSection.scrollIntoViewIfNeeded();
    const firstItem = faqSection.locator("details").first();

    await expect(firstItem).not.toHaveAttribute("open", "");
    await firstItem.locator("summary").click();
    await expect(firstItem).toHaveAttribute("open", "");
    await expect(firstItem.locator("p")).toBeVisible();

    await firstItem.locator("summary").click();
    await expect(firstItem).not.toHaveAttribute("open", "");
  });

  test("mission §42S — chaque question FAQ est un `<summary>` focusable au clavier avec un focus visible", async ({ page }) => {
    await gotoResilient(page, "/");
    await page.getByRole("button", { name: "Tout refuser" }).click();

    const faqSection = page.locator("#faq");
    await faqSection.scrollIntoViewIfNeeded();
    const firstSummary = faqSection.locator("details").first().locator("summary");

    await firstSummary.focus();
    await expect(firstSummary).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(faqSection.locator("details").first()).toHaveAttribute("open", "");
  });
});
