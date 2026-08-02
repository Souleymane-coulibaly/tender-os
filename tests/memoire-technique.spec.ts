import { expect, test } from "@playwright/test";
import { login, readFixture } from "./fixtures";

/**
 * Correctif audit Codex P2-003 — preuves Playwright minimales, Mémoire technique : affichage des
 * sections, ouverture de l'éditeur, modification, sauvegarde, historique, conflit d'édition
 * visible, sélection pour export. Un seul worker (voir playwright.config.ts) : les tests partagent
 * le même livrable seedé et s'enchaînent dans un ordre réaliste (brouillon → revue → validation).
 */
async function gotoMemoEditor(page: import("@playwright/test").Page, tenderId: string): Promise<string> {
  await page.goto(`/app/tenders/${tenderId}/deliverables`);
  await page.getByText("Mémoire technique", { exact: true }).click();
  await page.waitForURL(/\/deliverables\/[0-9a-f-]+$/);
  return page.url();
}

test.describe.serial("Mémoire technique — cycle de vie complet d'une révision", () => {
  test("affiche la section Introduction issue du template actif", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture);
    await gotoMemoEditor(page, fixture.tenderId);

    await expect(page.getByRole("button", { name: /Introduction/ })).toBeVisible();
    await expect(page.getByText("Aucune révision pour l'instant.").or(page.getByText(/Chargement/))).toBeVisible();
  });

  test("ouvre l'éditeur et rédige un brouillon manuel", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture);
    await gotoMemoEditor(page, fixture.tenderId);

    await page.getByRole("button", { name: "Rédiger manuellement" }).click();
    await expect(page.getByRole("button", { name: "Enregistrer le brouillon" })).toBeVisible();

    const textarea = page.locator("textarea").first();
    await textarea.fill("Notre équipe propose une méthodologie éprouvée pour ce marché.");
    await page.getByRole("button", { name: "Enregistrer le brouillon" }).click();

    await expect(page.getByText("Enregistré")).toBeVisible();
    await expect(page.getByText(/Révision #1/)).toBeVisible();
  });

  test("l'historique affiche la révision créée avec son statut", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture);
    await gotoMemoEditor(page, fixture.tenderId);

    const revisionHeader = page.getByText("Révision #1 — Manuelle", { exact: true }).locator("..");
    await expect(revisionHeader).toBeVisible();
    await expect(revisionHeader.getByText("Brouillon", { exact: true })).toBeVisible();
  });

  test("soumet à revue puis valide — la sélection pour export apparaît ensuite", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture);
    await gotoMemoEditor(page, fixture.tenderId);

    await page.getByRole("button", { name: "Soumettre à revue" }).click();
    await expect(page.getByRole("button", { name: "Valider" })).toBeVisible();

    await page.getByRole("button", { name: "Valider" }).click();
    await expect(page.getByRole("button", { name: "Sélectionner pour l'export" })).toBeVisible();
    await expect(page.getByText("Validée", { exact: true })).toBeVisible();
  });
});

test.describe("Mémoire technique — conflit d'édition visible (verrou optimiste)", () => {
  test("deux onglets modifiant la même révision : le second se voit refuser sa sauvegarde avec un message explicite", async ({ browser }) => {
    const fixture = readFixture();

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      await login(pageA, fixture);
      await login(pageB, fixture);

      const url = await gotoMemoEditor(pageA, fixture.tenderId);
      await pageB.goto(url);

      // Une nouvelle révision manuelle pour isoler ce scénario du précédent (déjà VALIDÉE).
      await pageA.getByRole("button", { name: "Rédiger manuellement" }).click();
      await pageA.locator("textarea").first().fill("Version initiale, avant conflit.");
      await pageA.getByRole("button", { name: "Enregistrer le brouillon" }).click();
      await expect(pageA.getByText("Enregistré")).toBeVisible();

      // Les deux onglets ouvrent la MÊME révision brouillon la plus récente.
      await pageA.reload();
      await pageB.reload();
      await pageA.getByRole("button", { name: "Éditer" }).first().click();
      await pageB.getByRole("button", { name: "Éditer" }).first().click();

      await pageA.locator("textarea").first().fill("Modification depuis l'onglet A — sauvegardée en premier.");
      await pageA.getByRole("button", { name: "Enregistrer le brouillon" }).click();
      await expect(pageA.getByText("Enregistré")).toBeVisible();

      await pageB.locator("textarea").first().fill("Modification concurrente depuis l'onglet B — doit être refusée.");
      await pageB.getByRole("button", { name: "Enregistrer le brouillon" }).click();

      // Exclut l'annonceur de route interne de Next.js (`role="alert"` lui aussi, mais vide) —
      // ne cible que la véritable alerte applicative.
      await expect(pageB.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("modifiée par quelqu'un d'autre entre-temps");
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
