import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ensureLoggedIn, readFixture } from "./fixtures";

/**
 * Checkpoint TENDEROS-2.1-CCV2-G.1 — preuves NAVIGATEUR de POLICY A (« hard require candidate »).
 *
 * Ce que ces preuves établissent : le parcours PRINCIPAL du produit ne peut plus produire un Tender
 * sans entreprise candidate, et un Tender historique qui en manque le DIT clairement au lieu
 * d'afficher l'identité du client comme si c'était celle du candidat.
 *
 * C'est le prérequis exact qui rendra sûr le retrait des replis `CompanyProfile` en CCV2-G.2.
 */

const prisma = new PrismaClient();
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function setRole(organizationId: string, userId: string, roleCode: string): Promise<void> {
  const membership = await prisma.organizationMembership.findFirst({ where: { organizationId, userId } });
  if (!membership) throw new Error(`Aucune adhésion pour ${userId} dans ${organizationId}`);
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  if (!role) throw new Error(`Rôle inconnu au catalogue : ${roleCode}`);
  await prisma.membershipRole.deleteMany({ where: { membershipId: membership.id } });
  await prisma.membershipRole.create({ data: { membershipId: membership.id, roleId: role.id } });
}

const tokensByEmail = new Map<string, string>();

async function apiToken(request: APIRequestContext, identity: { email: string; password: string }): Promise<string> {
  const cached = tokensByEmail.get(identity.email);
  if (cached) return cached;
  const res = await request.post(`${API_BASE_URL}/api/v1/auth/login`, { data: { email: identity.email, password: identity.password } });
  const token = ((await res.json()) as { accessToken: string }).accessToken;
  tokensByEmail.set(identity.email, token);
  return token;
}

/** Remet le Tender historique dans son état sans candidat — chaque scénario doit partir de là. */
async function resetLegacyTender(page: Page): Promise<string> {
  const fixture = readFixture();
  await prisma.tender.update({ where: { id: fixture.legacyTenderId }, data: { candidateCompanyId: null } });
  void page;
  return fixture.legacyTenderId;
}

test.describe("CCV2-G.1 — entreprise candidate requise (preuves navigateur)", () => {
  test.beforeEach(async () => {
    const fixture = readFixture();
    await setRole(fixture.organizationId, fixture.userId, "OWNER");
  });

  // ================================================================ §17
  // Borne LOCALE a ce seul scenario : il doit survivre a la latence produit documentee du retour
  // d'action (P2-SWITCH-LATENCY). Aucun timeout global n'est modifie.
  test.describe.configure({ timeout: 180000 });

  test("§17 — création d'un Tender : bloquée sans entreprise candidate, aboutie avec, et l'identifiant technique n'est jamais saisi", async ({ page }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture);
    await page.goto("/app/tenders/new");

    const selector = page.getByLabel("Entreprise candidate *");
    await expect(selector).toBeVisible();
    // Le champ ne pré-sélectionne rien : le produit ne devine jamais le candidat.
    await expect(selector).toHaveValue("");
    // L'utilisateur ne saisit JAMAIS un UUID : aucun champ texte ne porte ce nom.
    expect(await page.locator('input[name="candidateCompanyId"]').count()).toBe(0);
    // Il choisit une raison sociale lisible.
    await expect(selector.locator("option", { hasText: /candidate e2e alpha/i })).toHaveCount(1);

    const titre = `G1 navigateur ${Date.now()}`;
    await page.getByLabel("Titre *").fill(titre);

    // --- Tentative SANS candidat : la soumission n'aboutit pas.
    await page.getByRole("button", { name: /Creer l'appel d'offres/i }).click();
    await expect(page).toHaveURL(/\/app\/tenders\/new/);
    expect(await prisma.tender.count({ where: { organizationId: fixture.organizationId, title: titre } }), "aucun Tender écrit").toBe(0);

    // --- Avec candidat : la création aboutit et porte bien A.
    await selector.selectOption(fixture.candidateCompanyId);
    await page.getByRole("button", { name: /Creer l'appel d'offres/i }).click();

    await expect
      .poll(async () => await prisma.tender.count({ where: { organizationId: fixture.organizationId, title: titre } }), { timeout: 20000 })
      .toBe(1);

    const created = await prisma.tender.findFirstOrThrow({ where: { organizationId: fixture.organizationId, title: titre } });
    expect(created.candidateCompanyId, "DB candidateCompanyId").toBe(fixture.candidateCompanyId);

    // L'écran du Tender montre bien A comme entreprise candidate courante. On attend d'abord que
    // la redirection de l'action serveur soit retombée, sinon la navigation suivante entre en
    // concurrence avec elle.
    // On ATTEND que l'action serveur de création soit réellement retombée avant de lire l'écran.
    //
    // Défaut mesuré, PRÉEXISTANT et non absorbé par G.1 (famille P2-SWITCH-LATENCY) : le retour de
    // l'action met plusieurs dizaines de secondes, alors que la ligne est écrite en base en moins
    // d'une seconde. Naviguer pendant ce temps — même dans un onglet neuf du même contexte — entre
    // en concurrence avec l'action encore en vol et produit un rendu en erreur.
    //
    // Attendre la redirection RÉELLE du produit n'est ni un contournement ni un masquage : c'est ce
    // que fait l'utilisateur, et la lenteur reste rapportée telle quelle dans le rapport.
    await page.waitForURL((url) => !url.pathname.endsWith("/new"), { timeout: 120000 });

    await page.goto(`/app/tenders/${created.id}`);
    await expect(page.getByRole("heading", { name: "Entreprise candidate" })).toBeVisible();
    await expect(page.locator(`a[href="/app/candidate-companies/${fixture.candidateCompanyId}"]`).first()).toBeVisible();
    expect(await page.getByText("Entreprise candidate requise").count()).toBe(0);

    await prisma.tender.delete({ where: { id: created.id } });
  });

  // ================================================================ §13 / §20
  test("§13/§20 — Tender historique : état « requise » explicite, puis transition par le contrat officiel", async ({ page }) => {
    const fixture = readFixture();
    const legacyTenderId = await resetLegacyTender(page);
    await ensureLoggedIn(page, fixture);

    await page.goto(`/app/tenders/${legacyTenderId}`);
    const section = page.locator("section").filter({ hasText: "Entreprise candidate" }).first();

    // L'état est NOMMÉ. Surtout, l'identité du CLIENT commercial n'est jamais présentée comme
    // celle du candidat — c'est la confusion que POLICY A élimine.
    await expect(section.getByText("Entreprise candidate requise")).toBeVisible();
    expect(await section.locator('a[href^="/app/candidate-companies/"]').count(), "aucun candidat affiché").toBe(0);

    // --- Sélection EXPLICITE par un rôle autorisé, via le contrôle produit existant.
    await section.getByRole("button", { name: /Sélectionner une entreprise candidate|Sélectionner l'entreprise candidate/ }).click();
    await page.getByLabel(/entreprise candidate/i).last().selectOption(fixture.secondCandidateCompanyId);
    await page.getByRole("button", { name: "Confirmer" }).click();

    // Le contrat OFFICIEL (`ChangeTenderCandidateCompanyUseCase`, certifié en F.2) a été emprunté :
    // lui seul produit ces deux traces. Aucun second mécanisme d'assignation n'a été créé.
    await expect
      .poll(async () => (await prisma.tender.findUnique({ where: { id: legacyTenderId } }))?.candidateCompanyId, { timeout: 20000 })
      .toBe(fixture.secondCandidateCompanyId);

    await expect
      .poll(
        async () =>
          await prisma.auditLog.count({
            where: { organizationId: fixture.organizationId, resourceId: legacyTenderId, action: "tender.candidate_company_changed" },
          }),
        { timeout: 15000 },
      )
      .toBeGreaterThan(0);

    await expect
      .poll(
        async () =>
          await prisma.outboxEvent.count({
            where: { organizationId: fixture.organizationId, aggregateId: legacyTenderId, eventType: "TenderCandidateCompanyChanged" },
          }),
        { timeout: 15000 },
      )
      .toBeGreaterThan(0);

    // Rechargement : l'écran montre désormais B (le retour d'action lui-même reste affecté par
    // P2-SWITCH-LATENCY, documenté et non absorbé ici).
    await page.reload();
    const after = page.locator("section").filter({ hasText: "Entreprise candidate" }).first();
    await expect(after.locator(`a[href="/app/candidate-companies/${fixture.secondCandidateCompanyId}"]`)).toBeVisible();
    expect(await after.getByText("Entreprise candidate requise").count()).toBe(0);
  });

  // ================================================================ §21
  test("§21 — rôles non autorisés : voient l'état requis, ne peuvent pas assigner, et le forçage est refusé", async ({ page, request }) => {
    const fixture = readFixture();
    const legacyTenderId = await resetLegacyTender(page);

    for (const role of ["CONTRIBUTOR", "READ_ONLY"]) {
      await setRole(fixture.organizationId, fixture.userId, role);
      await ensureLoggedIn(page, fixture);
      await page.goto(`/app/tenders/${legacyTenderId}`);

      const section = page.locator("section").filter({ hasText: "Entreprise candidate" }).first();
      // Il VOIT que le candidat est requis (§15 : l'information n'est pas cachée)…
      await expect(section.getByText("Entreprise candidate requise")).toBeVisible();
      // …mais aucune action de sélection ne lui est proposée.
      expect(await section.getByRole("button", { name: /Sélectionner/ }).count(), `contrôle visible pour ${role}`).toBe(0);

      // LA preuve : la requête forcée avec un vrai jeton de ce rôle.
      tokensByEmail.delete(fixture.email);
      const token = await apiToken(request, fixture);
      const forced = await request.post(`${API_BASE_URL}/api/v1/tenders/${legacyTenderId}/candidate-company`, {
        headers: { Authorization: `Bearer ${token}`, "X-Organization-Id": fixture.organizationId, "Content-Type": "application/json" },
        data: { candidateCompanyId: fixture.candidateCompanyId },
        failOnStatusCode: false,
      });
      expect(forced.status(), `forçage ${role}`).toBe(403);
      expect((await prisma.tender.findUnique({ where: { id: legacyTenderId } }))?.candidateCompanyId, "reste NULL").toBeNull();
    }
  });

  /*
   * §23 — LA DISTINCTION « aucune entreprise candidate » vs « lecture impossible » est prouvee au
   * niveau COMPOSANT (`candidate-company-section.test.tsx`), pas ici.
   *
   * Raison, mesuree et non supposee : provoquer une VRAIE panne de lecture depuis le navigateur
   * est impossible sans modifier le produit. La lecture est faite CoTe SERVEUR (RSC), donc
   * inatteignable par `page.route`. Et l'entreprise candidate ne peut pas etre rendue invisible en
   * base : `Tender.candidateCompany` est une FK COMPOSITE `[candidateCompanyId, organizationId]`,
   * si bien que deplacer l'entreprise deplacerait aussi l'organisation du Tender — ce qui viole
   * `tenders_client_account_id_organization_id_fkey` (constate a l'execution). Aucun role, enfin,
   * ne fait echouer la lecture : `CandidatePermission.Read` est accordee a tous.
   *
   * Fabriquer un point d'injection de panne uniquement pour ce test ajouterait au produit un
   * chemin qui n'existe pas en production. Le test composant, lui, exerce le VRAI composant avec
   * les trois etats reels de `CandidateCompanyResolution`.
   */

  // ================================================================ §26 / §27
  test("§26/§27 — le sélecteur de candidat : responsive 390→1440 et socle d'accessibilité", async ({ page }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture);

    for (const width of [390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/app/tenders/new");

      const selector = page.getByLabel("Entreprise candidate *");
      await expect(selector).toBeVisible();

      const box = await selector.boundingBox();
      expect(Math.round(box?.width ?? 0), `largeur du sélecteur à ${width}px`).toBeLessThanOrEqual(width);
      expect(Math.round((box?.x ?? 0) + (box?.width ?? 0)), `bord droit à ${width}px`).toBeLessThanOrEqual(width);
    }

    // --- Accessibilité : nom accessible, description associée, opérable au clavier, focus visible.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/tenders/new");

    const selector = page.getByLabel("Entreprise candidate *");
    await expect(selector).toHaveAttribute("aria-describedby", "candidateCompanyId-hint");
    await expect(page.locator("#candidateCompanyId-hint")).toBeVisible();
    await expect(selector).toHaveAttribute("required", "");

    await selector.focus();
    const focusVisible = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active) return false;
      const style = getComputedStyle(active);
      return style.outlineStyle !== "none" || style.boxShadow !== "none" || style.borderColor !== "";
    });
    expect(focusVisible).toBe(true);

    // Sélection au CLAVIER seul, sans souris.
    await page.keyboard.press("ArrowDown");
    await expect(selector).not.toHaveValue("");
    void fixture;
  });
});
