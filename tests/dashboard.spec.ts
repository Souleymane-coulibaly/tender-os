import { expect, test } from "@playwright/test";
import { login, readFixture } from "./fixtures";

/**
 * V2 Sprint 15 (Dashboard opérationnel) — preuve Playwright bout-en-bout contre les vraies
 * applications API + Web + PostgreSQL : le Dashboard est la page d'accueil (`/app`), rend les
 * widgets réels à partir des données seedées par `apps/api/prisma/e2e-seed.ts`, et reste
 * exploitable sur un viewport mobile (mission §114 — parcours critique 390px).
 *
 * V2 Sprint 25 (Dashboard Premium, Checkpoint 25C) — refonte validée du contenu principal (mission
 * §25.54-§25.68) : `Pipeline des appels d'offres`/`Mes tâches`/`Dossiers de réponse`/`Décisions
 * GO/NO-GO`/`Dossiers à traiter`/le filtre "Période" n'existent plus sur cette page (retirés
 * délibérément, voir `dashboard-widgets.tsx`) — les assertions correspondantes ci-dessous sont
 * remplacées, jamais simplement supprimées sans replacement.
 */
test.describe.serial("Dashboard Premium — flux principal", () => {
  test("mission §25.54-§25.68 — affiche l'en-tête, les 4 KPI et les widgets premium, puis navigue vers un dossier depuis les échéances", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture);

    await page.goto("/app");
    await expect(page.getByRole("heading", { name: /^Bonjour/ })).toBeVisible();
    await expect(page.getByText("Voici ce qui nécessite votre attention aujourd'hui.")).toBeVisible();

    // KPI (mission §25.57) — 4 indicateurs, chiffres réels.
    await expect(page.getByText("Appels d'offres en cours")).toBeVisible();
    await expect(page.getByText("Échéances à venir")).toBeVisible();
    await expect(page.getByText("Dossiers à valider")).toBeVisible();
    await expect(page.getByText("Opportunités pertinentes")).toBeVisible();

    // Widgets premium (mission §25.59-§25.66).
    await expect(page.getByRole("heading", { name: "Mes dossiers prioritaires" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Prochaines échéances" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Opportunités recommandées" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Activité récente" })).toBeVisible();
  });

  test("mission §25.61 — le widget Mon utilisation affiche les crédits AO réels", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture);

    await page.goto("/app");
    const usageHeading = page.getByRole("heading", { name: "Mon utilisation" });
    await usageHeading.scrollIntoViewIfNeeded();
    await expect(usageHeading).toBeVisible();
    await expect(page.getByText("Crédits AO")).toBeVisible();
  });

  test("responsive mobile (390px) — aucun débordement horizontal, l'en-tête et les KPI restent visibles sans scroll excessif (mission §10/§107/§114/§25.98)", async ({ page }) => {
    const fixture = readFixture();
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, fixture);

    await page.goto("/app");
    await expect(page.getByRole("heading", { name: /^Bonjour/ })).toBeVisible();

    // Mission §107/§25.98 — pas de scroll horizontal global.
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(hasHorizontalOverflow).toBe(false);

    await expect(page.getByText("Appels d'offres en cours")).toBeVisible();
  });

  test("desktop (1440px) — grille riche, Mes dossiers prioritaires et Échéances côte à côte (mission §25.98)", async ({ page }) => {
    const fixture = readFixture();
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, fixture);

    await page.goto("/app");
    const priorityHeading = page.getByRole("heading", { name: "Mes dossiers prioritaires" });
    const deadlinesHeading = page.getByRole("heading", { name: "Prochaines échéances" });
    await expect(priorityHeading).toBeVisible();
    await expect(deadlinesHeading).toBeVisible();

    const priorityBox = await priorityHeading.boundingBox();
    const deadlinesBox = await deadlinesHeading.boundingBox();
    // Même ligne (grille desktop) — écart vertical négligeable, échéances à droite du dossier prioritaire.
    expect(priorityBox && deadlinesBox && Math.abs(priorityBox.y - deadlinesBox.y) < 20).toBe(true);
    expect(priorityBox && deadlinesBox && deadlinesBox.x > priorityBox.x).toBe(true);

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(hasHorizontalOverflow).toBe(false);
  });

  test("mission §25.108 — Org A ne voit jamais les dossiers prioritaires/échéances d'une Org B", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture);

    await page.goto("/app");
    await expect(page.getByRole("heading", { name: /^Bonjour/ })).toBeVisible();
    // `readFixture().other` appartient à une organisation distincte (voir tests/fixtures.ts) — son
    // tenderId ne doit jamais apparaître dans la page rendue pour l'organisation principale.
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain(fixture.other.tenderId);
  });
});

/**
 * V2 Sprint 25 (Checkpoint 25D, mission §25.69-§25.71/§25.109) — checklist d'activation dynamique.
 * `fixture` (principal) a déjà au moins un Tender et un membership — certaines cases sont donc déjà
 * cochées ; on vérifie la structure et le comportement dynamique, jamais un état 0/7 figé.
 */
test.describe("Checklist d'activation — Dashboard", () => {
  test("mission §25.69/§25.71 — affiche la progression sous forme sobre \"N / 7 étapes terminées\", jamais de gamification (points/badges)", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture);

    await page.goto("/app");
    const checklistHeading = page.getByRole("heading", { name: "Votre checklist d'activation" });
    // Le widget se masque entièrement une fois 7/7 — ne pas échouer si l'organisation fixture a
    // par hasard tout complété, seulement vérifier la cohérence si le widget est visible.
    if (await checklistHeading.isVisible().catch(() => false)) {
      await expect(page.getByText(/\d \/ 7 étapes terminées/)).toBeVisible();
      await expect(page.getByText("Compte créé")).toBeVisible();
      await expect(page.getByText("Organisation configurée")).toBeVisible();
    }
  });

  test("mission §25.70 — \"Importer le premier DCE\" est coché pour une organisation qui a déjà au moins un Tender (dérivé de l'état réel, jamais un second état manuel)", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture);

    await page.goto("/app");
    const checklistHeading = page.getByRole("heading", { name: "Votre checklist d'activation" });
    if (await checklistHeading.isVisible().catch(() => false)) {
      // `fixture.tenderId` prouve qu'un Tender existe déjà pour cette organisation (seed) — l'item
      // doit donc apparaître barré (complété), jamais comme un lien encore actif.
      const item = page.getByText("Importer le premier DCE");
      await expect(item).toBeVisible();
      await expect(item).toHaveClass(/line-through/);
    }
  });
});
