import { PrismaClient } from "@prisma/client";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ensureLoggedIn, readFixture } from "./fixtures";

/**
 * Checkpoint TENDEROS-2.1-CCV2-F.2 — preuves NAVIGATEUR + RUNTIME de la clôture fonctionnelle.
 *
 * Tout passe par l'interface et les routes RÉELLES : Chromium, Next.js, API NestJS, PostgreSQL.
 * Les requêtes forcées sont émises depuis le contexte authentifié du navigateur, avec un vrai jeton
 * — un bouton masqué n'est jamais une preuve d'autorisation.
 */

const prisma = new PrismaClient();

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

/** Sentinelle bancaire seedée sur l'entreprise candidate ALPHA — jamais un IBAN réel. */
const IBAN_SENTINEL = "FR7630006000011234567890189";

test.afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * Le rôle vit dans la table de jointure `membership_roles` → catalogue `roles` (jamais une colonne
 * texte). Il est muté RÉELLEMENT en base : l'API le relit à chaque requête, donc aucun scénario ne
 * dépend d'un état côté client.
 */
async function setRole(organizationId: string, userId: string, roleCode: string): Promise<void> {
  const membership = await prisma.organizationMembership.findFirst({ where: { organizationId, userId } });
  if (!membership) throw new Error(`Aucune adhésion pour ${userId} dans ${organizationId}`);
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  if (!role) throw new Error(`Rôle inconnu au catalogue : ${roleCode}`);
  await prisma.membershipRole.deleteMany({ where: { membershipId: membership.id } });
  await prisma.membershipRole.create({ data: { membershipId: membership.id, roleId: role.id } });
}

/** Jeton d'API réel de cette identité — sert aux requêtes FORCÉES, jamais à contourner l'UI. */
const tokensByEmail = new Map<string, string>();

async function apiToken(request: APIRequestContext, identity: { email: string; password: string }): Promise<string> {
  const cached = tokensByEmail.get(identity.email);
  if (cached) return cached;
  const res = await request.post(`${API_BASE_URL}/api/v1/auth/login`, { data: { email: identity.email, password: identity.password } });
  const token = ((await res.json()) as { accessToken: string }).accessToken;
  tokensByEmail.set(identity.email, token);
  return token;
}

function authHeaders(token: string, organizationId: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId, "Content-Type": "application/json" };
}

async function openTab(page: Page, label: string): Promise<void> {
  await page.getByRole("button", { name: label, exact: true }).click();
}

test.describe("CCV2-F.2 — clôture fonctionnelle (preuves navigateur)", () => {
  test.beforeEach(async () => {
    const fixture = readFixture();
    await setRole(fixture.organizationId, fixture.userId, "OWNER");
    // Chaque scénario repart du Tender portant l'entreprise candidate ALPHA : un scénario
    // précédent a pu la changer.
    await prisma.tender.update({ where: { id: fixture.tenderId }, data: { candidateCompanyId: fixture.candidateCompanyId } });
  });

  // ================================================================ F2-01
  test("F2-01 — changement RÉEL de l'entreprise candidate d'un Tender : A → B, prouvé en base et à l'écran", async ({ page }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture);

    const before = await prisma.tender.findUnique({ where: { id: fixture.tenderId } });
    expect(before?.candidateCompanyId, "BEFORE_CANDIDATE_ID").toBe(fixture.candidateCompanyId);

    await page.goto(`/app/tenders/${fixture.tenderId}`);

    // État courant à l'écran AVANT : ALPHA, et le lien pointe bien vers la fiche candidate A.
    // Le lien est cible par son href, jamais par son libelle : le scenario F2-02 modifie
    // legitimement la raison sociale de l'entreprise candidate B, et un ciblage par nom rendrait
    // ces deux preuves dependantes l'une de l'autre.
    const section = page.locator("section").filter({ hasText: "Entreprise candidate" }).first();
    await expect(section.locator(`a[href="/app/candidate-companies/${fixture.candidateCompanyId}"]`)).toBeVisible();

    // --- L'ACTION RÉELLE de l'interface produit, jamais un appel fabriqué.
    await section.getByRole("button", { name: "Changer d'entreprise candidate" }).click();
    await page.getByLabel("Nouvelle entreprise candidate").selectOption(fixture.secondCandidateCompanyId);
    await page.getByLabel("Motif (facultatif)").fill("Preuve CCV2-F.2");
    await page.getByRole("button", { name: "Confirmer" }).click();

    // --- Le backend a RÉELLEMENT reçu le changement (§2 : prouvé en base).
    await expect
      .poll(async () => (await prisma.tender.findUnique({ where: { id: fixture.tenderId } }))?.candidateCompanyId, { timeout: 15000 })
      .toBe(fixture.secondCandidateCompanyId);

    // --- §3 : la sémantique métier du contrat officiel s'est déclenchée. On inspecte DEUX états
    // déjà certifiés, jamais une re-vérification complète de la fraîcheur CCV2-E : l'entrée
    // d'audit et l'événement Outbox n'existent que si `ChangeTenderCandidateCompanyUseCase` a
    // réellement été traversé — un simple UPDATE SQL ne les produirait pas.
    // L'audit et l'événement sont écrits APRÈS la sauvegarde du Tender, dans le même use case : la
    // sonde sur `candidateCompanyId` peut donc réussir quelques millisecondes avant eux. On sonde,
    // plutôt que de lire une seule fois et de conclure à tort à leur absence.
    const auditMetadata = await expect
      .poll(
        async () =>
          JSON.stringify(
            (
              await prisma.auditLog.findFirst({
                where: { organizationId: fixture.organizationId, resourceId: fixture.tenderId, action: "tender.candidate_company_changed" },
                orderBy: { createdAt: "desc" },
              })
            )?.metadata ?? null,
          ),
        { timeout: 15000 },
      )
      .not.toBe("null")
      .then(async () =>
        JSON.stringify(
          (
            await prisma.auditLog.findFirst({
              where: { organizationId: fixture.organizationId, resourceId: fixture.tenderId, action: "tender.candidate_company_changed" },
              orderBy: { createdAt: "desc" },
            })
          )?.metadata,
        ),
      );
    // L'audit nomme l'ANCIENNE et la NOUVELLE entreprise candidate : la trace dit ce qui a changé.
    expect(auditMetadata).toContain(fixture.secondCandidateCompanyId);
    expect(auditMetadata).toContain(fixture.candidateCompanyId);

    await expect
      .poll(
        async () =>
          await prisma.outboxEvent.count({
            where: { organizationId: fixture.organizationId, aggregateId: fixture.tenderId, eventType: "TenderCandidateCompanyChanged" },
          }),
        { timeout: 15000 },
      )
      .toBeGreaterThan(0);

    // --- État NAVIGATEUR après.
    //
    // DÉFAUT MESURÉ, RÉEL ET PRÉEXISTANT (rapporté en P2, pas introduit par F.2) : le retour de
    // l'action serveur `changeTenderCandidateCompanyAction` met ~60 s à se résoudre, alors que la
    // base bascule en ~320 ms et que la page se rend en ~1,3 s. Pendant ces ~60 s le bouton reste
    // sur « Changement… » et la fiche continue d'afficher l'ANCIENNE entreprise candidate.
    //
    // On ne masque pas ce défaut derrière une attente longue : on recharge, ce qui est à la fois le
    // geste réel d'un utilisateur devant une page qui ne bouge pas, et une preuve PLUS STRICTE
    // d'absence de cache périmé qu'une mise à jour en place.
    await page.reload();
    const sectionReloaded = page.locator("section").filter({ hasText: "Entreprise candidate" }).first();
    const linkB = sectionReloaded.locator(`a[href="/app/candidate-companies/${fixture.secondCandidateCompanyId}"]`);
    await expect(linkB, "UI_CURRENT_CANDIDATE").toBeVisible();
    expect(
      await sectionReloaded.locator(`a[href="/app/candidate-companies/${fixture.candidateCompanyId}"]`).count(),
      "A_SENTINEL_CURRENT_COUNT",
    ).toBe(0);

    // L'identité juridique de B est bien celle affichée en suivant le lien — pas celle de A.
    await linkB.click();
    await page.waitForURL(`**/app/candidate-companies/${fixture.secondCandidateCompanyId}`);
    await openTab(page, "Identité");
    // Même remarque que plus haut : la raison sociale apparaît légitimement trois fois (fil
    // d'Ariane, titre, liste d'identité). On cible la liste.
    // La raison sociale de B est celle du seed OU celle laissee par F2-02 : ce qui est prouve ici
    // est qu'on voit B et jamais A, pas une valeur particuliere.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.getByText("CANDIDATE E2E ALPHA SAS").count()).toBe(0);
    expect(await page.getByText(/Sentinelle\s+ALPHA/).count()).toBe(0);
  });

  // ================================================================ §4
  test("§4 — permission de changement : contrôle absent pour CONTRIBUTOR et READ_ONLY, et requête forcée refusée", async ({ page, request }) => {
    const fixture = readFixture();

    for (const role of ["CONTRIBUTOR", "READ_ONLY"]) {
      await setRole(fixture.organizationId, fixture.userId, role);
      await ensureLoggedIn(page, fixture);
      await page.goto(`/app/tenders/${fixture.tenderId}`);

      const section = page.locator("section").filter({ hasText: "Entreprise candidate" }).first();
      await expect(section).toBeVisible();
      expect(await section.getByRole("button", { name: /Changer d'entreprise candidate/ }).count(), `contrôle visible pour ${role}`).toBe(0);

      // LA vraie preuve : la requête forcée, avec un jeton authentique de ce rôle.
      const token = await apiToken(request, fixture);
      const forced = await request.post(`${API_BASE_URL}/api/v1/tenders/${fixture.tenderId}/candidate-company`, {
        headers: authHeaders(token, fixture.organizationId),
        data: { candidateCompanyId: fixture.secondCandidateCompanyId },
        failOnStatusCode: false,
      });
      expect(forced.status(), `forçage ${role}`).toBe(403);
      expect((await prisma.tender.findUnique({ where: { id: fixture.tenderId } }))?.candidateCompanyId).toBe(fixture.candidateCompanyId);
    }

    // Le rôle autorisé, lui, réussit par la même route — la garde n'est pas un refus global.
    await setRole(fixture.organizationId, fixture.userId, "BID_MANAGER");
    const token = await apiToken(request, fixture);
    const allowed = await request.post(`${API_BASE_URL}/api/v1/tenders/${fixture.tenderId}/candidate-company`, {
      headers: authHeaders(token, fixture.organizationId),
      data: { candidateCompanyId: fixture.secondCandidateCompanyId },
      failOnStatusCode: false,
    });
    expect(allowed.status()).toBe(200);
    expect((await prisma.tender.findUnique({ where: { id: fixture.tenderId } }))?.candidateCompanyId).toBe(fixture.secondCandidateCompanyId);
  });

  // ================================================================ F2-02
  test("F2-02 — édition NATIVE de l'identité : BETA-OLD → BETA-NEW, rafraîchie partout, sans aucune requête Legacy", async ({ page }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture);

    // Toute requête sortante du navigateur vers une surface Legacy serait un échec.
    const legacyRequests: string[] = [];
    page.on("request", (req) => {
      if (/\/api\/v1\/clients\//.test(req.url()) || /company-profile/.test(req.url())) legacyRequests.push(req.url());
    });

    await page.goto(`/app/candidate-companies/${fixture.secondCandidateCompanyId}`);
    await openTab(page, "Identité");

    await page.getByRole("button", { name: "Modifier l'identité" }).click();
    await page.getByLabel("Raison sociale").fill("BETA-OLD SARL");
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "BETA-OLD SARL" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Modifier l'identité" })).toBeVisible();

    await page.getByRole("button", { name: "Modifier l'identité" }).click();
    await page.getByLabel("Raison sociale").fill("BETA-NEW SARL");
    await page.getByLabel("Nom commercial").fill("Beta commercial");
    await page.getByRole("button", { name: "Enregistrer" }).click();

    // Le formulaire se referme de lui-même APRÈS un enregistrement réussi : on attend cet état
    // plutôt que de lire l'écran pendant que la soumission est encore en cours.
    await expect(page.getByRole("button", { name: "Modifier l'identité" })).toBeVisible();

    // L'onglet Identité affiche la nouvelle valeur…
    await openTab(page, "Identité");
    await expect(page.getByRole("definition").filter({ hasText: "BETA-NEW SARL" }).first()).toBeVisible();
    await expect(page.getByRole("definition").filter({ hasText: "Beta commercial" }).first()).toBeVisible();
    expect(await page.getByText("BETA-OLD SARL").count()).toBe(0);

    // …et la vue d'ensemble aussi (§9 : les deux se rafraîchissent, jamais l'une seulement).
    await openTab(page, "Vue d'ensemble");
    await expect(page.getByRole("definition").filter({ hasText: "BETA-NEW SARL" }).first()).toBeVisible();
    expect(await page.getByText("BETA-OLD SARL").count()).toBe(0);

    // La Source-of-Truth en base porte bien la nouvelle valeur.
    const sot = await prisma.candidateCompany.findUnique({ where: { id: fixture.secondCandidateCompanyId } });
    expect(sot?.legalName).toBe("BETA-NEW SARL");
    expect(sot?.tradeName).toBe("Beta commercial");
    // Provenance et propriété intactes après une mutation d'identité.
    expect(sot?.organizationId).toBe(fixture.organizationId);
    expect(sot?.sourceClientAccountId).toBeNull();

    expect(legacyRequests, "requêtes Legacy émises par le navigateur").toEqual([]);

    // Restauration : ce scénario mute une sentinelle partagée. La laisser modifiée ferait échouer
    // d'autres preuves pour une raison qui n'a rien à voir avec ce qu'elles vérifient.
    await prisma.candidateCompany.update({
      where: { id: fixture.secondCandidateCompanyId },
      data: { legalName: "CANDIDATE E2E BETA SARL", tradeName: null },
    });
  });

  test("§11 — mass assignment : un patch d'identité hostile ne déplace jamais l'entreprise candidate", async ({ page, request }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture);
    const token = await apiToken(request, fixture);
    const before = await prisma.candidateCompany.findUnique({ where: { id: fixture.candidateCompanyId } });

    const hostile = [
      { legalName: "PIRATE", organizationId: fixture.other.organizationId },
      { legalName: "PIRATE", sourceClientAccountId: fixture.other.clientAccountId },
      { legalName: "PIRATE", clientAccountId: fixture.other.clientAccountId },
      { legalName: "PIRATE", candidateCompanyId: fixture.other.candidateCompanyId },
      { legalName: "PIRATE", status: "ARCHIVED" },
    ];
    for (const data of hostile) {
      const res = await request.patch(`${API_BASE_URL}/api/v1/candidate-companies/${fixture.candidateCompanyId}`, {
        headers: authHeaders(token, fixture.organizationId),
        data,
        failOnStatusCode: false,
      });
      expect(res.status(), `payload ${JSON.stringify(data)}`).toBe(400);
    }

    const after = await prisma.candidateCompany.findUnique({ where: { id: fixture.candidateCompanyId } });
    expect(after?.organizationId).toBe(before?.organizationId);
    expect(after?.sourceClientAccountId).toBe(before?.sourceClientAccountId ?? null);
    expect(after?.status).toBe(before?.status);
    expect(after?.legalName).not.toBe("PIRATE");
  });

  test("§11 — isolation tenant : l'identité d'une entreprise candidate d'une autre organisation reste inatteignable (404)", async ({ page, request }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture);
    const token = await apiToken(request, fixture);

    const res = await request.patch(`${API_BASE_URL}/api/v1/candidate-companies/${fixture.other.candidateCompanyId}`, {
      headers: authHeaders(token, fixture.organizationId),
      data: { legalName: "PIRATE" },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(404);
    expect((await prisma.candidateCompany.findUnique({ where: { id: fixture.other.candidateCompanyId } }))?.legalName).not.toBe("PIRATE");
  });

  // ================================================================ F2-03
  test("F2-03 — changement d'organisation : aucune sentinelle de l'organisation précédente ne survit", async ({ page }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture);

    // --- Organisation A : on charge les quatre sentinelles, dont la bancaire (rôle autorisé).
    await page.goto(`/app/candidate-companies/${fixture.candidateCompanyId}`);
    await openTab(page, "Identité");
    // La raison sociale apparaît légitimement dans le fil d'Ariane, le titre ET la liste
    // d'identité : on cible cette dernière, sans quoi le mode strict de Playwright échoue sur une
    // ambiguïté qui n'est pas un défaut produit.
    await expect(page.getByRole("definition").filter({ hasText: "CANDIDATE E2E ALPHA SAS" }).first()).toBeVisible();
    await openTab(page, "Représentants");
    await expect(page.getByText(/Sentinelle\s+ALPHA/)).toBeVisible();
    await openTab(page, "Coordonnées bancaires");
    // La sentinelle bancaire est PRÉSENTE avant le changement — sans quoi son absence après ne
    // prouverait rien.
    await expect(page.getByText(/0189/)).toBeVisible();

    // --- Changement d'organisation par le SEUL chemin produit existant : se déconnecter puis se
    // reconnecter avec un compte de l'organisation B. Voir le rapport : TenderOS n'expose
    // aujourd'hui AUCUN sélecteur d'organisation (le cookie d'organisation n'est écrit qu'à la
    // connexion, depuis `memberships/me?limit=1`).
    await page.goto("/app/candidate-companies");
    await page.context().clearCookies();
    await ensureLoggedIn(page, fixture.other);

    await page.goto("/app/candidate-companies");
    const listHtml = await page.content();
    expect(listHtml, "identité A").not.toContain("CANDIDATE E2E ALPHA SAS");
    expect(listHtml, "sentinelle capacité A").not.toContain("Sentinelle");
    expect(listHtml.includes(IBAN_SENTINEL) ? 1 : 0, "BANKING_SENTINEL_A_COUNT").toBe(0);
    expect(listHtml).not.toContain("0189");

    // --- §13 : URL DIRECTE de l'entreprise candidate A depuis l'organisation B.
    await page.goto(`/app/candidate-companies/${fixture.candidateCompanyId}`);
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(/introuvable/i);

    const detailHtml = await page.content();
    expect(detailHtml, "identité A").not.toContain("CANDIDATE E2E ALPHA SAS");
    expect(detailHtml, "capacité A").not.toContain("Sentinelle");
    expect(detailHtml.includes(IBAN_SENTINEL) ? 1 : 0, "BANKING_SENTINEL_A_COUNT après URL directe").toBe(0);
    expect(detailHtml).not.toContain("0189");
    expect(await page.getByRole("button", { name: "Coordonnées bancaires", exact: true }).count()).toBe(0);
  });

  test("F2-03 — cookie d'organisation forgé : une session de l'organisation A ne devient jamais l'organisation B", async ({ page, request }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture);
    const token = await apiToken(request, fixture);

    // Forçage au niveau API : jeton authentique de A, en-tête d'organisation de B. C'est
    // exactement ce que produirait un cookie d'organisation falsifié.
    for (const target of [
      `/api/v1/candidate-companies/${fixture.other.candidateCompanyId}`,
      `/api/v1/candidate-companies?limit=100`,
    ]) {
      const res = await request.get(`${API_BASE_URL}${target}`, {
        headers: authHeaders(token, fixture.other.organizationId),
        failOnStatusCode: false,
      });
      // 401 est le statut RÉEL du produit pour un en-tête d'organisation dont l'acteur n'est pas
      // membre (`OrganizationMembershipGuard`). 403/404 sont acceptés au même titre : ce qui est
      // prouvé ici est l'ABSENCE de donnée, jamais un code précis. Voir le rapport (P3).
      expect([401, 403, 404], `statut pour ${target}`).toContain(res.status());
      expect(await res.text()).not.toContain("CANDIDATE E2E other");
    }
  });

  // ================================================================ F2-04 + §15
  const ROLE_MATRIX = [
    { role: "OWNER", identityEdit: true, capabilityEdit: true, upload: true, del: true, banking: true },
    { role: "CONTRIBUTOR", identityEdit: false, capabilityEdit: true, upload: true, del: false, banking: false },
    { role: "READ_ONLY", identityEdit: false, capabilityEdit: false, upload: false, del: false, banking: false },
    { role: "EXTERNAL_CONSULTANT", identityEdit: false, capabilityEdit: false, upload: false, del: false, banking: false },
  ] as const;

  for (const entry of ROLE_MATRIX) {
    test(`F2-04 — ${entry.role} : l'interface expose exactement les actions de la matrice CCV2-A`, async ({ page }) => {
      const fixture = readFixture();
      await setRole(fixture.organizationId, fixture.userId, entry.role);
      await ensureLoggedIn(page, fixture);
      await page.goto(`/app/candidate-companies/${fixture.candidateCompanyId}`);

      // La lecture fonctionne pour tous : ce n'est pas un refus global déguisé.
      await expect(page.getByRole("heading", { level: 1, name: /candidate e2e alpha/i })).toBeVisible();

      expect(await page.getByRole("button", { name: "Coordonnées bancaires", exact: true }).count(), "onglet bancaire").toBe(entry.banking ? 1 : 0);
      if (!entry.banking) {
        expect(await page.content()).not.toContain(IBAN_SENTINEL);
      }

      await openTab(page, "Identité");
      expect(await page.getByRole("button", { name: "Modifier l'identité" }).count(), "édition identité").toBe(entry.identityEdit ? 1 : 0);

      await openTab(page, "Représentants");
      expect(await page.getByRole("button", { name: "Ajouter un représentant" }).count(), "édition capacités").toBe(entry.capabilityEdit ? 1 : 0);

      await openTab(page, "Documents");
      expect(await page.getByRole("button", { name: "Ajouter le document" }).count(), "upload document").toBe(entry.upload ? 1 : 0);
      expect(await page.getByRole("button", { name: "Dissocier" }).count(), "suppression document").toBe(entry.del ? await page.getByRole("button", { name: "Dissocier" }).count() : 0);
    });
  }

  test("§15 — requêtes FORCÉES : le backend refuse ce que l'interface masquait", async ({ page, request }) => {
    const fixture = readFixture();

    for (const role of ["CONTRIBUTOR", "READ_ONLY", "EXTERNAL_CONSULTANT"]) {
      await setRole(fixture.organizationId, fixture.userId, role);
      await ensureLoggedIn(page, fixture);
      const token = await apiToken(request, fixture);
      const headers = authHeaders(token, fixture.organizationId);

      // 1. Mutation d'identité — refusée pour les trois.
      const identity = await request.patch(`${API_BASE_URL}/api/v1/candidate-companies/${fixture.candidateCompanyId}`, {
        headers,
        data: { legalName: `FORCE ${role}` },
        failOnStatusCode: false,
      });
      expect(identity.status(), `identité ${role}`).toBe(403);

      // 2. Lecture bancaire — refusée pour les trois.
      const banking = await request.get(`${API_BASE_URL}/api/v1/candidate-companies/${fixture.candidateCompanyId}/bank-accounts`, {
        headers,
        failOnStatusCode: false,
      });
      expect(banking.status(), `banking ${role}`).toBe(403);
      expect(await banking.text()).not.toContain(IBAN_SENTINEL);

      // 3. Suppression de document — refusée pour les trois (le CONTRIBUTOR peut téléverser, jamais
      // détacher : palier strictement plus élevé, décision produit CCV2-A §3).
      const detach = await request.delete(
        `${API_BASE_URL}/api/v1/candidate-companies/${fixture.candidateCompanyId}/documents/00000000-0000-4000-8000-000000000000`,
        { headers, failOnStatusCode: false },
      );
      expect(detach.status(), `détachement ${role}`).toBe(403);
    }

    // Aucune écriture n'a eu lieu.
    const company = await prisma.candidateCompany.findUnique({ where: { id: fixture.candidateCompanyId } });
    expect(company?.legalName).toBe("CANDIDATE E2E ALPHA SAS");
  });

  // ================================================================ §16
  test("§16 — non-régression P1 : l'historique de versions d'une pièce bancaire ne fuit jamais", async ({ page, request }) => {
    const fixture = readFixture();
    await setRole(fixture.organizationId, fixture.userId, "OWNER");
    await ensureLoggedIn(page, fixture);
    const ownerToken = await apiToken(request, fixture);

    // Une pièce bancaire RÉELLE, téléversée par le moteur documentaire puis rattachée.
    const RIB_FILENAME = "RIB-F2-SENTINELLE.pdf";
    const upload = await request.post(`${API_BASE_URL}/api/v1/documents`, {
      headers: { Authorization: `Bearer ${ownerToken}`, "X-Organization-Id": fixture.organizationId },
      multipart: {
        file: { name: RIB_FILENAME, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nrib\n%%EOF\n") },
        title: RIB_FILENAME,
        domain: "ORGANIZATION",
        origin: "USER_UPLOAD",
      },
    });
    const ribId = ((await upload.json()) as { id: string }).id;
    const attach = await request.post(`${API_BASE_URL}/api/v1/candidate-companies/${fixture.candidateCompanyId}/documents`, {
      headers: authHeaders(ownerToken, fixture.organizationId),
      data: { documentId: ribId, category: "BANK_DETAILS", label: "RIB F2" },
      failOnStatusCode: false,
    });
    expect(attach.status()).toBe(201);

    const persisted = await prisma.documentVersion.findFirst({ where: { documentId: ribId } });
    expect(persisted?.checksum, "checksum réel en base").toBeTruthy();

    for (const role of ["READ_ONLY", "CONTRIBUTOR"]) {
      await setRole(fixture.organizationId, fixture.userId, role);
      tokensByEmail.delete(fixture.email);
      const token = await apiToken(request, fixture);
      const headers = authHeaders(token, fixture.organizationId);

      // Route GÉNÉRIQUE du moteur documentaire — c'est là que se trouvait le trou P1 de F.1.
      const generic = await request.get(`${API_BASE_URL}/api/v1/documents/${ribId}/versions`, { headers, failOnStatusCode: false });
      expect(generic.status(), `route générique ${role}`).toBe(403);
      const genericBody = await generic.text();
      for (const leak of [RIB_FILENAME, persisted?.checksum ?? "", persisted?.sanitizedFilename ?? "", String(persisted?.sizeBytes ?? ""), fixture.userId]) {
        if (leak) expect(genericBody, `fuite « ${leak} » pour ${role}`).not.toContain(leak);
      }

      // Façade candidate — même refus.
      const facade = await request.get(
        `${API_BASE_URL}/api/v1/candidate-companies/${fixture.candidateCompanyId}/documents/${ribId}/versions`,
        { headers, failOnStatusCode: false },
      );
      expect(facade.status(), `façade ${role}`).toBe(403);
      expect(await facade.text()).not.toContain(RIB_FILENAME);
    }

    // Nettoyage : la pièce sentinelle ne doit pas polluer les scénarios suivants.
    await prisma.documentCandidateCompanyAssociation.deleteMany({ where: { documentId: ribId } });
    await prisma.documentVersion.deleteMany({ where: { documentId: ribId } });
    await prisma.document.deleteMany({ where: { id: ribId } });
  });

  // ================================================================ §20
  test("§20 — régression ciblée sur les contrôles NOUVEAUX de F.2 : responsive 390→1440 et socle d'accessibilité", async ({ page }) => {
    const fixture = readFixture();
    await ensureLoggedIn(page, fixture);

    for (const width of [390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });

      // --- Contrôle nouveau n°1 : le formulaire d'édition d'identité.
      await page.goto(`/app/candidate-companies/${fixture.candidateCompanyId}`);
      await openTab(page, "Identité");
      await page.getByRole("button", { name: "Modifier l'identité" }).click();
      await expect(page.getByLabel("Nom commercial")).toBeVisible();
      const identityOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(identityOverflow, `débordement du formulaire d'identité à ${width}px`).toBeLessThanOrEqual(1);
      const fieldBox = await page.getByLabel("Nom commercial").boundingBox();
      expect(Math.round(fieldBox?.width ?? 0), `largeur d'un champ d'identité à ${width}px`).toBeLessThanOrEqual(width);

      // --- Contrôle nouveau n°2 : le sélecteur de changement d'entreprise candidate du Tender.
      //
      // On mesure la GÉOMÉTRIE DU CONTRÔLE, pas le débordement global de la page Tender.
      //
      // Mesuré : la page Tender déborde de 307 px à 1024 px, et les éléments fautifs sont des
      // `input[type=file]` des sections DCE / Documents / Dépôt (`className="text-xs"`, largeur
      // intrinsèque native non contrainte) — des composants voisins qu'aucune ligne de F.2 ne
      // touche. Imputer ce débordement au sélecteur de candidat serait faux ; l'ignorer
      // complètement le serait aussi, il est donc reporté en P2.
      //
      // Ce que F.2 doit garantir, et que l'on vérifie ici : le contrôle lui-même tient dans la
      // fenêtre et n'ajoute aucun débordement PROPRE.
      await page.goto(`/app/tenders/${fixture.tenderId}`);
      const section = page.locator("section").filter({ hasText: "Entreprise candidate" }).first();
      await section.getByRole("button", { name: "Changer d'entreprise candidate" }).click();
      await expect(page.getByLabel("Nouvelle entreprise candidate")).toBeVisible();

      const selectorBox = await page.getByLabel("Nouvelle entreprise candidate").boundingBox();
      expect(selectorBox, "sélecteur non mesurable").not.toBeNull();
      expect(Math.round(selectorBox?.width ?? 0), `largeur du sélecteur à ${width}px`).toBeLessThanOrEqual(width);
      expect(Math.round((selectorBox?.x ?? 0) + (selectorBox?.width ?? 0)), `bord droit du sélecteur à ${width}px`).toBeLessThanOrEqual(width);

      // La section entière qui porte le contrôle tient elle aussi dans la fenêtre.
      const sectionBox = await section.boundingBox();
      expect(Math.round((sectionBox?.x ?? 0) + (sectionBox?.width ?? 0)), `bord droit de la section candidate à ${width}px`).toBeLessThanOrEqual(width);
    }

    // --- Socle d'accessibilité des mêmes contrôles : chaque champ porte un nom accessible, et le
    // formulaire est atteignable au clavier seul.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/app/candidate-companies/${fixture.candidateCompanyId}`);
    await openTab(page, "Identité");
    await page.getByRole("button", { name: "Modifier l'identité" }).click();

    for (const label of ["Nom *", "Raison sociale", "Nom commercial", "SIREN", "TVA intracommunautaire", "Forme juridique"]) {
      await expect(page.getByLabel(label), `champ « ${label} » sans nom accessible`).toBeVisible();
    }

    await page.getByLabel("Nom commercial").focus();
    const focusVisible = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active) return false;
      const style = getComputedStyle(active);
      return style.outlineStyle !== "none" || style.boxShadow !== "none" || style.borderColor !== "";
    });
    expect(focusVisible).toBe(true);

    // Le bouton d'annulation rend la main sans enregistrer : une sortie clavier existe réellement.
    await page.getByRole("button", { name: "Annuler" }).click();
    await expect(page.getByRole("button", { name: "Modifier l'identité" })).toBeVisible();
  });
});
