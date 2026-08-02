import { expect, test } from "@playwright/test";
import { login, readFixture } from "./fixtures";

/**
 * Correctif audit Codex P2-003 — preuves Playwright minimales, Templates et Thèmes : affichage des
 * versions actives, palier de résolution affiché, formulaire de création réservé OWNER/Admin.
 * Le repli TENDEROS lui-même est déjà prouvé côté backend (tests HTTP réels, P1-004) — il n'existe
 * aujourd'hui aucune page tenant affichant `templateSourceLevel`/`themeSourceLevel`, donc ce
 * fichier ne peut pas (et n'affirme pas) le vérifier visuellement ; voir le rapport final §I.
 */
test.describe("Templates de mémoire", () => {
  test("affiche le template ORGANIZATION seedé avec sa version active", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture);

    await page.goto("/app/ai-configuration/deliverable-templates");
    await expect(page.getByRole("heading", { name: "Templates de mémoire" })).toBeVisible();

    const row = page.locator("tr", { hasText: "Modèle E2E" });
    await expect(row).toBeVisible();
    await expect(row.getByText("ORGANIZATION")).toBeVisible();
    await expect(row.getByText("v1")).toBeVisible();

    // Formulaire de création visible pour OWNER (mission §5/§17).
    await expect(page.getByRole("heading", { name: "Nouveau template" })).toBeVisible();
  });

  test("ouvre le détail d'un template et affiche ses versions", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture);
    await page.goto("/app/ai-configuration/deliverable-templates");

    await page.getByText("Modèle E2E").click();
    await expect(page).toHaveURL(/\/deliverable-templates\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: "Version active" })).toBeVisible();
    await expect(page.getByText("v1", { exact: true })).toBeVisible();
  });
});

test.describe("Identité documentaire (thèmes)", () => {
  test("état vide réel — aucun thème n'a été configuré pour cette organisation e2e", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture);

    await page.goto("/app/ai-configuration/document-themes");
    await expect(page.getByRole("heading", { name: "Identité documentaire" })).toBeVisible();
    await expect(page.getByText("Aucun thème pour l'instant.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nouveau thème" })).toBeVisible();
  });

  test("crée un thème, puis crée et active une version — l'aperçu couleur d'accent apparaît", async ({ page }) => {
    const fixture = readFixture();
    await login(page, fixture);
    await page.goto("/app/ai-configuration/document-themes");

    await page.getByLabel("Nom").fill("Thème E2E Playwright");
    await page.getByLabel("Couleur d'accent").fill("#1a73e8");
    await page.getByRole("button", { name: "Créer le thème" }).click();

    // La création redirige vers le détail du thème créé — preuve réelle par l'URL, pas seulement
    // un message. La première version créée est DRAFT (mission §6) : aucune version active tant
    // qu'elle n'a pas été explicitement activée.
    await page.waitForURL(/\/document-themes\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: "Thème E2E Playwright" })).toBeVisible();
    await expect(page.getByText("Aucune version active")).toBeVisible();

    await page.getByRole("button", { name: "Créer une nouvelle version" }).click();
    await page.getByLabel("Couleur d'accent", { exact: false }).last().fill("#e8341a");
    await page.getByRole("button", { name: "Créer la version" }).click();
    await expect(page.getByText(/Nouvelle version v2 créée/)).toBeVisible();

    await page.getByRole("button", { name: "Activer cette version" }).click();
    await expect(page.getByText("v2", { exact: true })).toBeVisible();
    await expect(page.getByText("#e8341a")).toBeVisible();
  });
});
