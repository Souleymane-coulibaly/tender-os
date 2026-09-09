import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { ensureLoggedIn, readFixture } from "./fixtures";

/**
 * Checkpoint TENDEROS-2.1-CCV2-I.1 — preuves NAVIGATEUR de la frontière sémantique
 * `ClientAccount` (relation commerciale / CRM) ↔ `CandidateCompany` (entité juridique qui candidate).
 *
 * Ce que ces preuves établissent, et qu'aucun test d'API ne peut établir : ce que l'utilisateur VOIT
 * et peut CLIQUER. L'API refuse désormais les écritures de candidature sur la surface client (409
 * `CLIENT_BIDDER_WRITE_RETIRED`) ; si l'interface continuait à proposer ces formulaires, le produit
 * offrirait des actions vouées à échouer — un défaut réel, seulement déplacé.
 *
 * Ce qu'elles vérifient AUSSI, et qui compte autant : les données historiques restent VISIBLES. Le
 * décommissionnement ne doit pas se manifester à l'écran comme une perte de données.
 */

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

/** Même motif que la preuve CCV2-G.1 : le rôle est POSITIONNÉ explicitement, jamais supposé — les
 *  capacités candidate (`canManageIdentity`) sont gardées côté produit, et un rôle hérité d'une
 *  spec précédente rendrait ces preuves dépendantes de l'ordre d'exécution. */
async function setRole(organizationId: string, userId: string, roleCode: string): Promise<void> {
  const membership = await prisma.organizationMembership.findFirst({ where: { organizationId, userId } });
  if (!membership) throw new Error(`Aucune adhésion pour ${userId} dans ${organizationId}`);
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  if (!role) throw new Error(`Rôle inconnu au catalogue : ${roleCode}`);
  await prisma.membershipRole.deleteMany({ where: { membershipId: membership.id } });
  await prisma.membershipRole.create({ data: { membershipId: membership.id, roleId: role.id } });
}

test.describe("CCV2-I.1 — séparation client commercial / entreprise candidate (preuves navigateur)", () => {
  // Next.js en mode dev compile chaque route au premier accès : ces preuves traversent plusieurs
  // routes jamais encore visitées dans la session. Borne LOCALE, aucun délai global n'est touché.
  test.describe.configure({ timeout: 180000 });

  test.beforeEach(async () => {
    const fixture = readFixture();
    await setRole(fixture.organizationId, fixture.userId, "OWNER");
  });

  /**
   * Next.js en mode dev compile chaque route au PREMIER acces : sur un serveur fraichement demarre,
   * cette compilation depasse a elle seule le `navigationTimeout` global de 20 s. Le delai est donc
   * borne ICI, au seul appel concerne — jamais elargi globalement, ce qui masquerait de vraies
   * lenteurs produit sur toutes les autres specs.
   */
  const FIRST_VISIT_TIMEOUT = 120000;

  test("la fiche client sépare visiblement le CRM des rubriques de candidature devenues historiques", async ({ page }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture);

    await page.goto(`/app/clients/${fixture.clientAccountId}/company-profile`, { timeout: FIRST_VISIT_TIMEOUT });

    // Le vocabulaire des onglets porte lui-même la frontière : « Contacts » (CRM) et non
    // « Représentants » (autorité juridique), « Documents commerciaux » et non « Documents ».
    await expect(page.getByRole("button", { name: "Contacts", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Documents commerciaux", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Identité légale (historique)", exact: true })).toBeVisible();
  });

  test("l'onglet Identité légale reste lisible mais aucun de ses champs n'est modifiable", async ({ page }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture);
    await page.goto(`/app/clients/${fixture.clientAccountId}/company-profile`, { timeout: FIRST_VISIT_TIMEOUT });

    await page.getByRole("button", { name: "Identité légale (historique)", exact: true }).click();

    // 1. L'avertissement explique le DÉPLACEMENT, jamais une simple indisponibilité — et oriente
    //    vers la fiche où l'action est désormais possible.
    //
    //    CCV2-I.2 a introduit DEUX formulations, parce que la rubrique a désormais deux états réels :
    //    tant qu'il reste une donnée historique, elle est « consultable en lecture seule » ; une fois
    //    toutes ses données migrées vers l'entreprise candidate, elle est vide et le dire autrement
    //    laisserait croire à une perte. Le test lit l'état EFFECTIF en base et exige la formulation
    //    qui lui correspond — asserter une seule des deux rendrait la preuve dépendante du jeu de
    //    données plutôt que du comportement.
    const hasLegacyIdentity =
      (await prisma.companyLegalIdentity.count({ where: { organizationId: fixture.organizationId, clientAccountId: fixture.clientAccountId } })) > 0;
    const expectedHeading = hasLegacyIdentity ? "Rubrique historique — lecture seule" : "Rubrique transférée à l'entreprise candidate";

    await expect(page.getByText(expectedHeading).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Entreprise candidate" }).first()).toBeVisible();

    // 2. Le contenu historique reste AFFICHÉ : c'est une rubrique consultable, pas une rubrique vidée.
    const fieldset = page.locator("fieldset[disabled]").first();
    await expect(fieldset).toBeVisible();

    // 3. CCV2-I.4 — la rubrique ne contient PLUS AUCUN champ de saisie : le formulaire a été retiré
    //    en même temps que sa route. L'ancienne assertion (« chaque contrôle est disabled ») est
    //    devenue vide de sens faute de contrôles ; elle est remplacée par une assertion qui, elle,
    //    échouerait si un formulaire était réintroduit ici.
    await expect(fieldset.locator("input, select, textarea")).toHaveCount(0);
    await expect(fieldset.locator("button[type='submit']")).toHaveCount(0);

    // 4. Et le `fieldset disabled` reste en place : filet de sécurité natif si un contrôle venait
    //    à réapparaître, plutôt qu'une protection qu'on retire au motif qu'elle ne sert plus.
    const remaining = fieldset.locator("input, select, textarea, button");
    const count = await remaining.count();
    for (let index = 0; index < count; index += 1) {
      await expect(remaining.nth(index)).toBeDisabled();
    }
  });

  test("CCV2-I.3 — la rubrique documents du client ne propose QUE des catégories commerciales", async ({ page }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture);
    await page.goto(`/app/clients/${fixture.clientAccountId}/company-profile`, { timeout: FIRST_VISIT_TIMEOUT });

    await page.getByRole("button", { name: "Documents commerciaux", exact: true }).click();

    // Le défaut corrigé en I.3 : cette liste proposait le catalogue de CANDIDATURE, dont l'API
    // refuse CHAQUE valeur en 422 depuis I.1. L'interface n'offrait donc que des actions vouées à
    // échouer — ce que la preuve ci-dessous rend désormais impossible de réintroduire sans le voir.
    const options = await page.locator("select#category option").allTextContents();

    expect(options.length).toBeGreaterThan(0);
    expect(options.join(" | ")).toContain("Contrat commercial");
    for (const interdit of ["Kbis", "Attestation fiscale", "Attestation sociale", "Statuts"]) {
      expect(options.join(" | "), `« ${interdit} » est une pièce de candidature`).not.toContain(interdit);
    }

    // Le texte oriente vers la bonne fiche plutôt que de se contenter d'interdire.
    await expect(page.getByRole("link", { name: "entreprise candidate" }).first()).toBeVisible();
  });

  test("l'entreprise candidate, elle, reste pleinement modifiable — la surface n'est pas fermée, elle est déplacée", async ({ page }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture);

    // Contre-preuve indispensable : sans elle, ces tests seraient également satisfaits par un
    // produit où l'identité juridique n'est plus modifiable NULLE PART.
    await page.goto("/app/candidate-companies", { timeout: FIRST_VISIT_TIMEOUT });

    // `/new` exclu explicitement : c'est le bouton de création, pas une fiche existante — sans quoi
    // ce test naviguerait vers un formulaire vierge et prouverait autre chose que ce qu'il annonce.
    const firstCompany = page.locator('a[href^="/app/candidate-companies/"]:not([href$="/new"])').first();
    await expect(firstCompany).toBeVisible();
    await firstCompany.click();
    await page.waitForURL((url) => /\/app\/candidate-companies\/[0-9a-f-]{36}/.test(url.pathname));

    // La fiche s'ouvre sur « Vue d'ensemble », qui affiche l'identité en lecture ; la gestion vit
    // dans l'onglet « Identité ».
    await page.getByRole("button", { name: "Identité", exact: true }).click();

    // Le CONTRAIRE exact de la fiche client : ici le bouton existe et il est actionnable.
    await expect(page.getByRole("button", { name: /modifier l'identité/i }).first()).toBeEnabled();
  });
});
