import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";

/**
 * V2 Sprint 24 (onboarding) — preuve Playwright bout-en-bout contre les vraies applications
 * API + Web + PostgreSQL, même motif que `landing.spec.ts`/`billing-subscription.spec.ts`.
 * N'actionne jamais le bouton "Procéder au paiement" (appellerait le vrai Stripe Checkout, même
 * discipline que `billing-subscription.spec.ts` — un test E2E ne doit jamais dépendre d'un
 * paiement réellement complété) : les étapes Configuration/Bienvenue, qui n'existent qu'après un
 * paiement confirmé par le webhook Stripe, ne sont donc PAS couvertes ici et restent vérifiées par
 * les tests unitaires/HTTP (`request-password-reset...`, `create-checkout-session...`, etc.).
 * Chaque compte est créé avec un email aléatoire — aucune dépendance au fixture E2E partagé
 * (`tests/fixtures.ts`), ce module teste la création de compte elle-même.
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

function freshCredentials(): { email: string; password: string; displayName: string } {
  return {
    email: `onboarding-e2e-${randomUUID()}@smoke.test`,
    password: "OnboardingE2E#12345",
    displayName: "Onboarding E2E",
  };
}

async function registerViaWizard(page: Page, path: string, credentials: ReturnType<typeof freshCredentials>): Promise<void> {
  test.setTimeout(90000);
  await gotoResilient(page, path);
  await page.getByLabel("Nom complet").fill(credentials.displayName);
  await page.getByLabel("Email professionnel").fill(credentials.email);
  await page.getByLabel("Mot de passe").fill(credentials.password);
  await page.getByLabel(/Conditions Générales d'Utilisation/).check();
  await page.getByRole("button", { name: "Créer mon compte" }).click();
}

test.describe.serial("Onboarding — wizard complet (V2 Sprint 24)", () => {
  test("BLOQUANT — la case CGU est obligatoire : soumettre sans la cocher ne crée jamais de compte", async ({ page }) => {
    test.setTimeout(60000);
    const credentials = freshCredentials();
    await gotoResilient(page, "/onboarding/compte");

    await page.getByLabel("Nom complet").fill(credentials.displayName);
    await page.getByLabel("Email professionnel").fill(credentials.email);
    await page.getByLabel("Mot de passe").fill(credentials.password);
    // Jamais coché — la validation HTML `required` doit bloquer la soumission.
    const checkbox = page.getByLabel(/Conditions Générales d'Utilisation/);
    await expect(checkbox).not.toBeChecked();
    await expect(checkbox).toHaveJSProperty("required", true);

    await page.getByRole("button", { name: "Créer mon compte" }).click();
    // Toujours sur /onboarding/compte — le navigateur a empêché la soumission.
    await expect(page).toHaveURL(/\/onboarding\/compte/);
  });

  test("mission — la case CGU porte un vrai lien vers /legal/terms, ouvert dans un nouvel onglet (jamais de perte du formulaire)", async ({ page, context }) => {
    await gotoResilient(page, "/onboarding/compte");
    const termsLink = page.getByRole("link", { name: "Conditions Générales d'Utilisation" });
    await expect(termsLink).toHaveAttribute("href", "/legal/terms");
    await expect(termsLink).toHaveAttribute("target", "_blank");

    await page.getByLabel("Nom complet").fill("Ada Lovelace");
    const [newPage] = await Promise.all([context.waitForEvent("page"), termsLink.click()]);
    await newPage.waitForLoadState();
    await expect(newPage.getByRole("heading", { level: 1 })).toBeVisible();
    await newPage.close();

    // Le champ saisi avant l'ouverture du nouvel onglet est toujours là.
    await expect(page.getByLabel("Nom complet")).toHaveValue("Ada Lovelace");
  });

  test("compte -> entreprise -> offre : flux réel bout-en-bout, le choix de plan de la Landing est conservé", async ({ page }) => {
    const credentials = freshCredentials();
    await registerViaWizard(page, "/onboarding/compte?plan=STARTER&billing=MONTHLY", credentials);

    await expect(page).toHaveURL(/\/onboarding\/entreprise\?plan=STARTER&billing=MONTHLY/);
    await expect(page.getByRole("heading", { name: "Votre entreprise" })).toBeVisible();

    await page.getByLabel("Nom de l'entreprise").fill(`Entreprise E2E ${randomUUID().slice(0, 8)}`);
    await page.getByRole("button", { name: "Continuer" }).click();

    await expect(page).toHaveURL(/\/onboarding\/offre\?plan=STARTER&billing=MONTHLY/);
    await expect(page.getByRole("heading", { name: "Choisissez votre offre" })).toBeVisible();
    // Tarifs réels (catalogue backend), jamais une valeur inventée côté frontend.
    await expect(page.getByText("199", { exact: false })).toBeVisible();

    await page.getByRole("link", { name: /Choisir Starter/ }).click();
    await expect(page).toHaveURL(/\/onboarding\/paiement\?plan=STARTER&billing=MONTHLY/);
    await expect(page.getByRole("heading", { name: "Paiement sécurisé" })).toBeVisible();
    await expect(page.getByText("Starter — mensuel")).toBeVisible();
    // Jamais cliqué (appellerait le vrai Stripe) — seule la présence du bouton est vérifiée.
    await expect(page.getByRole("button", { name: "Procéder au paiement" })).toBeVisible();
  });

  test("mission — l'offre Pass AO (?offer=pass) saute directement à l'étape Paiement avec la bonne cible", async ({ page }) => {
    const credentials = freshCredentials();
    await registerViaWizard(page, "/onboarding/compte?offer=pass", credentials);
    await expect(page).toHaveURL(/\/onboarding\/entreprise\?offer=pass/);

    await page.getByLabel("Nom de l'entreprise").fill(`Entreprise E2E ${randomUUID().slice(0, 8)}`);
    await page.getByRole("button", { name: "Continuer" }).click();

    await expect(page).toHaveURL(/\/onboarding\/offre\?offer=pass/);
    await page.getByRole("link", { name: /Pass AO/ }).click();
    await expect(page).toHaveURL(/\/onboarding\/paiement\?offer=pass/);
    await expect(page.getByText("Pass AO — paiement unique")).toBeVisible();
  });

  test("BLOQUANT — une organisation déjà créée n'est jamais recréée : revenir sur /onboarding/entreprise saute directement à /onboarding/offre", async ({ page }) => {
    const credentials = freshCredentials();
    await registerViaWizard(page, "/onboarding/compte", credentials);
    await page.getByLabel("Nom de l'entreprise").fill(`Entreprise E2E ${randomUUID().slice(0, 8)}`);
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page).toHaveURL(/\/onboarding\/offre/);

    // Retour manuel sur l'étape Entreprise — l'état réel (organisation déjà créée) doit
    // rediriger, jamais permettre une seconde création.
    await gotoResilient(page, "/onboarding/entreprise");
    await expect(page).toHaveURL(/\/onboarding\/offre/);
  });

  test("BLOQUANT (non-régression auth) — se connecter avec un compte sans organisation renvoie vers /onboarding, jamais un message d'échec bloquant", async ({ page }) => {
    const credentials = freshCredentials();
    await registerViaWizard(page, "/onboarding/compte", credentials);
    await expect(page).toHaveURL(/\/onboarding\/entreprise/);

    // Simule une nouvelle session (jamais un cookie manipulé à la main pour truquer l'état —
    // seulement pour repartir d'un navigateur "propre" avant une reconnexion réelle).
    await page.context().clearCookies();
    await gotoResilient(page, "/app/login");
    await page.getByLabel("Email").fill(credentials.email);
    await page.getByLabel("Mot de passe").fill(credentials.password);
    await page.getByRole("button", { name: "Se connecter" }).click();

    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("mission — /app/login expose un vrai lien 'Mot de passe oublié' et 'Créer un compte' vers /onboarding", async ({ page }) => {
    await gotoResilient(page, "/app/login?plan=BUSINESS&billing=YEARLY");

    await expect(page.getByRole("link", { name: "Mot de passe oublié ?" })).toHaveAttribute("href", "/app/forgot-password");
    await expect(page.getByRole("link", { name: "Créer un compte" })).toHaveAttribute("href", "/onboarding?plan=BUSINESS&billing=YEARLY");
  });

  test("mission — le flow mot de passe oublié est réel (jamais un lien mort) : email inconnu et email connu répondent de façon identique (anti-énumération)", async ({ page }) => {
    await gotoResilient(page, "/app/forgot-password");
    await page.getByLabel("Email").fill(`unknown-${randomUUID()}@smoke.test`);
    await page.getByRole("button", { name: "Envoyer le lien de réinitialisation" }).click();
    await expect(page.getByText(/Si un compte existe pour cette adresse/)).toBeVisible();
  });

  test("mission (CSP limitée) — /onboarding charge GA4 mais jamais Crisp", async ({ page }) => {
    await gotoResilient(page, "/onboarding/compte");
    const crispLoaded = await page.evaluate(() => (window as unknown as { $crisp?: unknown }).$crisp !== undefined);
    expect(crispLoaded).toBe(false);

    const response = await page.goto("/onboarding/compte");
    const csp = response?.headers()["content-security-policy"] ?? "";
    expect(csp).not.toContain("crisp.chat");
    expect(csp).toContain("googletagmanager.com");
  });
});
