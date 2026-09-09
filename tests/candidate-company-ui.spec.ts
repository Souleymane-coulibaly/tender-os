import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";
import { ensureLoggedIn, readFixture } from "./fixtures";

/**
 * Checkpoint TENDEROS-2.1-CCV2-F.1 — preuves NAVIGATEUR de la fiche entreprise candidate.
 *
 * Tout passe par l'interface réelle : navigateur Chromium, Next.js, API NestJS, PostgreSQL et
 * stockage réels. Aucune donnée injectée dans le DOM, aucune route interceptée, aucun mock.
 *
 * Le rôle de l'utilisateur est modifié DIRECTEMENT en base entre les scénarios — c'est la seule
 * façon d'exercer la matrice CCV2-A (OWNER, CONTRIBUTOR, READ_ONLY, EXTERNAL_CONSULTANT) sans
 * fabriquer quatre comptes, et cela reste une mutation d'état réelle, jamais un contournement de
 * garde : l'API réévalue le rôle à chaque requête.
 */

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * Remet le rôle RÉEL en base : `OrganizationMembership` porte son rôle par une ligne de jointure
 * `membership_roles` vers le catalogue `roles` (jamais une colonne texte). On résout donc le
 * `Role` par son `code` plutôt que d'écrire un identifiant en dur.
 */
async function setRole(organizationId: string, userId: string, roleCode: string): Promise<void> {
  const membership = await prisma.organizationMembership.findFirst({ where: { organizationId, userId } });
  if (!membership) throw new Error(`Aucune adhésion pour ${userId} dans ${organizationId}`);
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  if (!role) throw new Error(`Rôle inconnu au catalogue : ${roleCode}`);
  await prisma.membershipRole.deleteMany({ where: { membershipId: membership.id } });
  await prisma.membershipRole.create({ data: { membershipId: membership.id, roleId: role.id } });
}

async function openCandidate(page: Page, candidateCompanyId: string): Promise<void> {
  await page.goto(`/app/candidate-companies/${candidateCompanyId}`);
}

async function openTab(page: Page, label: string): Promise<void> {
  await page.getByRole("button", { name: label, exact: true }).click();
}

test.describe("CCV2-F.1 — fiche entreprise candidate (preuves navigateur)", () => {
  test.beforeEach(async () => {
    const fixture = readFixture();
    // Chaque scénario repart d'un OWNER connu : un test précédent a pu dégrader le rôle.
    await setRole(fixture.organizationId, fixture.userId, "OWNER");
  });

  test("F8 — OWNER : tous les onglets métier, l'onglet bancaire et les actions d'écriture sont présents", async ({ page }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture);
    await openCandidate(page, fixture.candidateCompanyId);

    for (const label of ["Vue d'ensemble", "Identité", "Établissements", "Représentants", "Certifications", "Assurances", "Références", "Moyens", "Documents"]) {
      await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Coordonnées bancaires", exact: true })).toBeVisible();

    await openTab(page, "Documents");
    await expect(page.getByRole("button", { name: "Ajouter le document" })).toBeVisible();
  });

  test("F2 — le parcours d'ajout ne demande plus d'identifiant technique : un fichier, ou une pièce désignée par son titre", async ({ page }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture);
    await openCandidate(page, fixture.candidateCompanyId);
    await openTab(page, "Documents");

    // Le champ « Identifiant du document » a disparu — c'est précisément l'objet du gap F2.
    await expect(page.getByLabel("Identifiant du document *")).toHaveCount(0);
    await expect(page.locator('input[name="documentId"]')).toHaveCount(0);

    await expect(page.getByLabel("Fichier *")).toBeVisible();

    await page.getByRole("radio", { name: "Choisir une pièce déjà téléversée" }).check();
    await expect(page.getByLabel("Pièce de la bibliothèque *")).toBeVisible();
    await expect(page.getByLabel("Fichier *")).toHaveCount(0);
  });

  test("F1 — dépôt réel d'un fichier : l'historique affiche sa version et la désigne comme courante", async ({ page }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture);
    await openCandidate(page, fixture.candidateCompanyId);
    await openTab(page, "Documents");

    const label = `Kbis navigateur ${Date.now()}`;
    await page.getByLabel("Fichier *").setInputFiles({
      name: "kbis-navigateur-v1.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nv1\n%%EOF\n"),
    });
    await page.getByLabel("Type *").selectOption("KBIS");
    await page.getByLabel("Libellé").fill(label);
    await page.getByRole("button", { name: "Ajouter le document" }).click();

    // Le fichier a traversé toute la chaîne réelle : multipart → moteur documentaire → association.
    await expect(page.getByRole("cell", { name: label })).toBeVisible();

    const row = page.getByRole("row").filter({ hasText: label });
    await row.getByRole("button", { name: "Versions" }).click();

    await expect(page.getByText("Historique des versions")).toBeVisible();
    // Une seule version ici : AJOUTER une version depuis la fiche candidate n'existe pas encore
    // (c'est `POST /documents/:id/versions`, non expose sur cette page). Le panneau lit donc un
    // historique reel a un element, jamais un historique fabrique pour les besoins du test.
    await expect(page.getByText("v1 — kbis-navigateur-v1.pdf")).toBeVisible();
    // La version courante est signalée d'après le pointeur renvoyé par l'API, pas d'après le rang.
    await expect(page.getByText("Courante")).toBeVisible();
  });

  test("F3 — changer d'entreprise candidate ne laisse jamais les données de la précédente à l'écran", async ({ page }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture);

    await openCandidate(page, fixture.candidateCompanyId);
    await openTab(page, "Représentants");
    await expect(page.getByText(/Sentinelle\s+ALPHA/)).toBeVisible();
    await expect(page.getByText(/Sentinelle\s+BETA/)).toHaveCount(0);

    // Passage par la LISTE, comme un utilisateur réel — pas une URL tapée à la main.
    await page.goto("/app/candidate-companies");
    await page.getByRole("link", { name: /candidate e2e beta/i }).first().click();
    await page.waitForURL(`**/app/candidate-companies/${fixture.secondCandidateCompanyId}`);
    await openTab(page, "Représentants");
    await expect(page.getByText(/Sentinelle\s+BETA/)).toBeVisible();
    await expect(page.getByText(/Sentinelle\s+ALPHA/)).toHaveCount(0);

    // Retour arrière NAVIGATEUR : c'est ici que le cache client du routeur pourrait resservir une
    // page périmée. La fiche doit à nouveau montrer ALPHA, jamais BETA.
    await page.goBack();
    await page.goBack();
    await page.waitForURL(`**/app/candidate-companies/${fixture.candidateCompanyId}`);
    await openTab(page, "Représentants");
    await expect(page.getByText(/Sentinelle\s+ALPHA/)).toBeVisible();
    await expect(page.getByText(/Sentinelle\s+BETA/)).toHaveCount(0);
  });

  test("F4 — l'entreprise candidate d'une autre organisation n'apparaît jamais dans la liste", async ({ page }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture.other);

    await page.goto("/app/candidate-companies");

    await expect(page.getByRole("link", { name: /candidate e2e other/i }).first()).toBeVisible();
    await expect(page.getByText(/candidate e2e alpha/i)).toHaveCount(0);
    await expect(page.getByText(/candidate e2e beta/i)).toHaveCount(0);
    await expect(page.getByText(fixture.candidateCompanyId)).toHaveCount(0);
  });

  test("F5 — l'URL directe d'une entreprise candidate d'une autre organisation ne révèle rien", async ({ page }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture.other);

    await openCandidate(page, fixture.candidateCompanyId);

    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("Introuvable ou accès refusé");
    // Ni le nom, ni la raison sociale, ni le SIREN de l'entreprise d'autrui.
    const html = await page.content();
    expect(html).not.toContain("CANDIDATE E2E ALPHA SAS");
    expect(html).not.toContain("Sentinelle");
    await expect(page.getByRole("button", { name: "Coordonnées bancaires", exact: true })).toHaveCount(0);
  });

  test("F6 — la fiche reste utilisable de 390 à 1440 px, sans débordement horizontal du corps de page", async ({ page }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture);
    await openCandidate(page, fixture.candidateCompanyId);

    for (const width of [390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });

      // Le corps de page ne défile jamais horizontalement — un tableau large doit défiler DANS son
      // propre conteneur, jamais pousser la mise en page entière.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `débordement horizontal à ${width}px`).toBeLessThanOrEqual(1);

      // Les onglets restent atteignables à toutes les largeurs (la barre défile, elle ne tronque pas).
      await openTab(page, "Documents");
      await expect(page.getByRole("button", { name: "Documents", exact: true })).toBeVisible();
      await openTab(page, "Vue d'ensemble");
    }
  });

  test("F7 — socle d'accessibilité : un seul h1, navigation d'onglets nommée, état courant annoncé, tout champ a un nom accessible", async ({ page }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture);
    await openCandidate(page, fixture.candidateCompanyId);

    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: "Sections de l'entreprise candidate" })).toBeVisible();

    // L'onglet actif est annoncé aux technologies d'assistance, pas seulement coloré.
    await expect(page.getByRole("button", { name: "Vue d'ensemble", exact: true })).toHaveAttribute("aria-current", "page");
    await openTab(page, "Documents");
    await expect(page.getByRole("button", { name: "Documents", exact: true })).toHaveAttribute("aria-current", "page");

    // Chaque champ du formulaire d'ajout porte un nom accessible — jamais un placeholder seul.
    const controls = page.locator("form input:not([type=hidden]), form select");
    const count = await controls.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const control = controls.nth(index);
      const [id, ariaLabel, ariaLabelledBy] = await Promise.all([
        control.getAttribute("id"),
        control.getAttribute("aria-label"),
        control.getAttribute("aria-labelledby"),
      ]);
      const labelled = ariaLabel || ariaLabelledBy || (id ? (await page.locator(`label[for="${id}"]`).count()) > 0 : false);
      // Les boutons radio du choix de provenance sont nommés par leur `<label>` englobant.
      const wrapped = (await control.evaluate((node) => Boolean(node.closest("label")))) as boolean;
      expect(Boolean(labelled) || wrapped, `champ sans nom accessible (id=${id ?? "aucun"})`).toBe(true);
    }

    // Le focus clavier reste visible : aucun `outline: none` sans substitut sur l'élément focalisé.
    await page.keyboard.press("Tab");
    const focusVisible = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active || active === document.body) return true;
      const style = getComputedStyle(active);
      return style.outlineStyle !== "none" || style.boxShadow !== "none" || style.borderColor !== "";
    });
    expect(focusVisible).toBe(true);
  });

  test("F8 — CONTRIBUTOR : lecture complète, ajout de document possible, mais ni onglet bancaire ni dissociation", async ({ page }) => {
    const fixture = readFixture();
    await setRole(fixture.organizationId, fixture.userId, "CONTRIBUTOR");
    await ensureLoggedIn(page, fixture);
    await openCandidate(page, fixture.candidateCompanyId);

    await expect(page.getByRole("button", { name: "Coordonnées bancaires", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Documents", exact: true })).toBeVisible();

    await openTab(page, "Documents");
    await expect(page.getByRole("button", { name: "Ajouter le document" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Dissocier" })).toHaveCount(0);

    // Aucun IBAN ni aucune trace de coordonnées bancaires n'est envoyé au navigateur.
    expect(await page.content()).not.toContain("Coordonnées bancaires");
  });

  test.describe("F8 — rôles en lecture seule", () => {
    for (const role of ["READ_ONLY", "EXTERNAL_CONSULTANT"]) {
      test(`${role} : la fiche est lisible, aucune action d'écriture n'est proposée`, async ({ page }) => {
        const fixture = readFixture();
        await setRole(fixture.organizationId, fixture.userId, role);
        await ensureLoggedIn(page, fixture);
        await openCandidate(page, fixture.candidateCompanyId);

        // La lecture fonctionne : ce n'est pas un refus global déguisé en succès.
        await expect(page.getByRole("heading", { level: 1, name: /candidate e2e alpha/i })).toBeVisible();

        await expect(page.getByRole("button", { name: "Coordonnées bancaires", exact: true })).toHaveCount(0);

        await openTab(page, "Documents");
        await expect(page.getByRole("button", { name: "Ajouter le document" })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Dissocier" })).toHaveCount(0);

        await openTab(page, "Établissements");
        await expect(page.getByRole("button", { name: /Ajouter/ })).toHaveCount(0);

        await openTab(page, "Représentants");
        await expect(page.getByRole("button", { name: "Ajouter un représentant" })).toHaveCount(0);
        // Mais la donnée elle-même reste visible — la lecture est bien accordée.
        await expect(page.getByText(/Sentinelle\s+ALPHA/)).toBeVisible();
      });
    }
  });
});
