import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";
import { buildMinimalPdf } from "../../../extraction/test-support/pdf-fixture-builder";

type EntrySummary = {
  id: string;
  status: string;
  activeVersionNumber: number;
  tags: { id: string; label: string; displayLabel: string }[];
  validatedByUserId?: string;
  validatedAt?: string;
  createdByUserId?: string;
};

/**
 * Preuve réelle contre HTTP + PostgreSQL (mission Sprint 5) — contrairement aux tests HTTP
 * Analysis (Sprint 4.1/4.2), le pipeline d'extraction de contenu ne dépend d'AUCUNE clé de
 * provider IA : le chemin complet (upload PDF réel -> extraction -> chunks -> recherche) peut
 * être vérifié de bout en bout, sans se limiter à un état d'échec déterministe.
 */
describe("Knowledge Base — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];

  let tokenOwnerA: string;
  let tokenContributorA: string;
  let tokenReadOnlyA: string;
  let tokenAdminB: string;
  let tokenKarim: string;
  let ownerAUserId: string;
  let karimUserId: string;
  let clientA1Id: string;
  let clientA2Id: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Knowledge Base HTTP Test", termsAccepted: true }),
    });
    const user = (await registerRes.json()) as { id: string };
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const { accessToken } = (await loginRes.json()) as { accessToken: string };
    return { userId: user.id, token: accessToken };
  }

  async function addMembership(input: { organizationId: string; userId: string; role: (typeof OrganizationRole)[keyof typeof OrganizationRole] }): Promise<void> {
    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: input.organizationId, userId: input.userId, role: input.role, occurredAt: new Date() }),
    );
  }

  function authHeaders(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId };
  }

  async function waitForEntryStatus(entryId: string, token: string, organizationId: string, terminalStatuses: string[]): Promise<EntrySummary> {
    const deadline = Date.now() + 20000;
    for (;;) {
      const res = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entryId}`, { headers: authHeaders(token, organizationId) });
      const body = (await res.json()) as EntrySummary;
      if (terminalStatuses.includes(body.status)) return body;
      if (Date.now() > deadline) throw new Error(`Entry ${entryId} did not reach a terminal status in time (last: ${body.status})`);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    prisma = moduleRef.get(PrismaService);

    await prisma.organization.create({ data: { id: orgAId, name: "KB Org A HTTP", slug: `kb-org-a-http-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
    await prisma.organization.create({ data: { id: orgBId, name: "KB Org B HTTP", slug: `kb-org-b-http-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });

    const ownerA = await registerAndLogin(`kb-owner-a-${randomUUID()}@smoke.test`);
    const contributorA = await registerAndLogin(`kb-contributor-a-${randomUUID()}@smoke.test`);
    const readOnlyA = await registerAndLogin(`kb-readonly-a-${randomUUID()}@smoke.test`);
    const adminB = await registerAndLogin(`kb-admin-b-${randomUUID()}@smoke.test`);
    const karim = await registerAndLogin(`kb-karim-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId, contributorA.userId, readOnlyA.userId, adminB.userId, karim.userId);
    tokenOwnerA = ownerA.token;
    tokenContributorA = contributorA.token;
    tokenReadOnlyA = readOnlyA.token;
    tokenAdminB = adminB.token;
    tokenKarim = karim.token;
    ownerAUserId = ownerA.userId;
    karimUserId = karim.userId;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgAId, userId: contributorA.userId, role: OrganizationRole.Contributor });
    await addMembership({ organizationId: orgAId, userId: readOnlyA.userId, role: OrganizationRole.ReadOnly });
    await addMembership({ organizationId: orgBId, userId: adminB.userId, role: OrganizationRole.OrganizationAdmin });
    // Mission §5/§63/§64 — Karim est membre de l'organisation A (BID_MANAGER, palier large), mais
    // n'a une affectation client RÉELLE que sur Client A1, jamais A2 : la vraie restriction vit au
    // palier client (voir les tests same-org cross-client ci-dessous).
    await addMembership({ organizationId: orgAId, userId: karim.userId, role: OrganizationRole.BidManager });
    clientA1Id = randomUUID();
    clientA2Id = randomUUID();
    await prisma.clientAccount.create({ data: { id: clientA1Id, organizationId: orgAId, name: `KB Client A1 ${clientA1Id}`, nameNormalized: `kb client a1 ${clientA1Id}`, status: "ACTIVE", createdBy: ownerA.userId } });
    await prisma.clientAccount.create({ data: { id: clientA2Id, organizationId: orgAId, name: `KB Client A2 ${clientA2Id}`, nameNormalized: `kb client a2 ${clientA2Id}`, status: "ACTIVE", createdBy: ownerA.userId } });
    await prisma.clientAssignment.create({ data: { id: randomUUID(), organizationId: orgAId, clientAccountId: clientA1Id, userId: karim.userId, role: "CONTRIBUTOR", createdBy: ownerA.userId } });
  }, 60000);

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.knowledgeEntryTag.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.knowledgeTag.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.knowledgeChunk.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.knowledgeDocument.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.knowledgeEntryVersion.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.knowledgeEntry.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.knowledgeSpace.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.documentVersion.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.document.updateMany({ where: { organizationId: { in: [orgAId, orgBId] } }, data: { currentVersionId: null } });
    await prisma.document.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
  }, 30000);

  it("GET /knowledge/spaces/default is idempotent — always resolves the same space", async () => {
    const res1 = await fetch(`${baseUrl}/api/v1/knowledge/spaces/default`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const res2 = await fetch(`${baseUrl}/api/v1/knowledge/spaces/default`, { headers: authHeaders(tokenContributorA, orgAId) });
    const body1 = (await res1.json()) as { id: string };
    const body2 = (await res2.json()) as { id: string };
    expect(body1.id).toBe(body2.id);
  });

  it("creates a manual CLIENT_REFERENCE entry with tags and validated metadata (201)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/knowledge/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(tokenContributorA, orgAId) },
      body: JSON.stringify({ title: "Référence Acme", category: "CLIENT_REFERENCE", metadata: { clientName: "Acme", currency: "EUR" }, tags: ["Cloud", "secteur-public"] }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as EntrySummary & { category: string };
    expect(body.status).toBe("READY");
    expect(body.tags.map((tag) => tag.label).sort()).toEqual(["cloud", "secteur-public"]);
  });

  it("rejects invalid metadata for the category with 422", async () => {
    const res = await fetch(`${baseUrl}/api/v1/knowledge/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(tokenContributorA, orgAId) },
      body: JSON.stringify({ title: "x", category: "CLIENT_REFERENCE", metadata: { currency: "TOO_LONG" } }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("KNOWLEDGE_METADATA_VALIDATION_FAILED");
  });

  it("rejects a READ_ONLY actor trying to create an entry (403)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/knowledge/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(tokenReadOnlyA, orgAId) },
      body: JSON.stringify({ title: "x", category: "OTHER" }),
    });
    expect(res.status).toBe(403);
  });

  it("full document import pipeline: upload a real PDF, wait for READY, consult chunks and provenance, then find it via search", async () => {
    const form = new FormData();
    form.append("title", "CV de Jean Dupont");
    form.append("category", "CONSULTANT_PROFILE");
    form.append("metadata", JSON.stringify({ fullName: "Jean Dupont", yearsOfExperience: 8 }));
    // Texte volontairement court : `buildMinimalPdf` positionne tout le texte sur une seule ligne
    // (un unique Tj) sur une page étroite (MediaBox 300pt) — un texte trop long en 18pt dépasse la
    // largeur de page et l'extracteur natif de texte le tronque visuellement, comme le confirment
    // les tests d'extraction existants (`extraction-http.integration.spec.ts`) qui ne vérifient
    // jamais le contenu intégral au-delà de quelques mots pour cette même raison.
    form.append(
      "file",
      new Blob([buildMinimalPdf(["kubernetes-marker-unique"])], { type: "application/pdf" }),
      "cv.pdf",
    );

    const createRes = await fetch(`${baseUrl}/api/v1/knowledge/documents`, { method: "POST", headers: authHeaders(tokenContributorA, orgAId), body: form });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as EntrySummary;
    expect(["DRAFT", "PROCESSING"]).toContain(created.status);

    const ready = await waitForEntryStatus(created.id, tokenContributorA, orgAId, ["READY", "PARTIALLY_READY", "FAILED"]);
    expect(ready.status).toBe("READY");

    const documentsRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${created.id}/documents`, { headers: authHeaders(tokenContributorA, orgAId) });
    const documents = (await documentsRes.json()) as { id: string; status: string }[];
    expect(documents).toHaveLength(1);
    expect(documents[0]!.status).toBe("READY");

    const detailRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${created.id}/documents/${documents[0]!.id}`, { headers: authHeaders(tokenContributorA, orgAId) });
    const detail = (await detailRes.json()) as { chunks: { content: string; checksum: string }[] };
    expect(detail.chunks.length).toBeGreaterThan(0);
    expect(detail.chunks.some((chunk) => chunk.content.includes("kubernetes-marker-unique"))).toBe(true);

    const searchRes = await fetch(`${baseUrl}/api/v1/knowledge/search?query=kubernetes-marker-unique`, { headers: authHeaders(tokenContributorA, orgAId) });
    expect(searchRes.status).toBe(200);
    const searchBody = (await searchRes.json()) as { items: { knowledgeEntryId: string; title: string; snippet: string; status: string }[] };
    expect(searchBody.items.some((item) => item.knowledgeEntryId === created.id)).toBe(true);
    expect(searchBody.items[0]!.title).toBe("CV de Jean Dupont");
    // Correction audit Codex "Anomalie 3" — cette entrée doit être READY, jamais restée bloquée en
    // PROCESSING : preuve que la transition d'entrée (désormais dans la même transaction que la
    // finalisation du document, voir finalizeAttempt) a bien été appliquée avant que la recherche
    // ne la retrouve.
    expect(searchBody.items[0]!.status).toBe("READY");
  }, 25000);
  // Timeout explicite — même motif et même valeur que le test le plus proche du même genre
  // ("extracts a real native-text PDF end-to-end", extraction-http.integration.spec.ts §Sprint 3) :
  // ce test est le SEUL de ce fichier à réellement patienter un traitement asynchrone réel (upload
  // réel, extraction PDF native réelle via pdf-parse, plusieurs transactions Postgres réelles,
  // polling), contrairement à tous ses voisins qui ne font que du CRUD synchrone. La cause réelle
  // de l'instabilité observée n'était PAS un simple manque de marge : `ProcessKnowledgeDocumentUseCase`
  // déléguait la transition de `KnowledgeEntry.status` à un callback `onSuccessTx` que l'ancien code
  // invoquait via le repository INJECTÉ (`this.prisma`), jamais avec le `tx` de la transaction de
  // finalisation — un aller-retour DB supplémentaire, séquentiel, ouvert sur une connexion séparée,
  // hors transaction, sur le chemin critique du traitement (voir
  // `PrismaKnowledgeDocumentRepository.finalizeAttempt`, corrigé pour effectuer cette transition
  // directement avec `tx`). Ce timeout explicite couvre la marge légitime restante (E/S disque
  // réelles, contention de pool de connexions sous charge parallèle de suite de tests), jamais un
  // masquage : aucune assertion n'a été affaiblie, `waitForEntryStatus` garde son propre délai
  // interne de 20000ms avec polling toutes les 200ms, inchangé.

  it("PATCH update creates a new version; tags do not", async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/knowledge/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(tokenContributorA, orgAId) },
      body: JSON.stringify({ title: "Méthodologie Agile", category: "METHODOLOGY" }),
    });
    const entry = (await createRes.json()) as EntrySummary;
    expect(entry.activeVersionNumber).toBe(1);

    const tagRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(tokenContributorA, orgAId) },
      body: JSON.stringify({ label: "agile" }),
    });
    expect(tagRes.status).toBe(201);
    const afterTag = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}`, { headers: authHeaders(tokenContributorA, orgAId) });
    expect(((await afterTag.json()) as EntrySummary).activeVersionNumber).toBe(1);

    const updateRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders(tokenContributorA, orgAId) },
      body: JSON.stringify({ description: "Méthodologie de gestion de projet agile." }),
    });
    const updated = (await updateRes.json()) as EntrySummary;
    expect(updated.activeVersionNumber).toBe(2);

    const versionsRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}/versions`, { headers: authHeaders(tokenContributorA, orgAId) });
    const versions = (await versionsRes.json()) as { versionNumber: number }[];
    expect(versions).toHaveLength(2);
  });

  it("restoring an old version creates a NEW version rather than rewriting history", async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/knowledge/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(tokenContributorA, orgAId) },
      body: JSON.stringify({ title: "Titre v1", category: "OTHER" }),
    });
    const entry = (await createRes.json()) as EntrySummary;

    await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders(tokenContributorA, orgAId) },
      body: JSON.stringify({ title: "Titre v2" }),
    });

    const restoreRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}/versions/1/restore`, {
      method: "POST",
      headers: authHeaders(tokenContributorA, orgAId),
    });
    expect(restoreRes.status).toBe(200);
    const restored = (await restoreRes.json()) as EntrySummary & { title: string };
    expect(restored.title).toBe("Titre v1");
    expect(restored.activeVersionNumber).toBe(3);
  });

  it("archive/restore/delete lifecycle: delete is refused until archived, then succeeds", async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/knowledge/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(tokenOwnerA, orgAId) },
      body: JSON.stringify({ title: "À supprimer", category: "OTHER" }),
    });
    const entry = (await createRes.json()) as EntrySummary;

    const deleteBeforeArchive = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}`, { method: "DELETE", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(deleteBeforeArchive.status).toBe(409);

    const archiveRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}/archive`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(archiveRes.status).toBe(200);
    expect(((await archiveRes.json()) as EntrySummary).status).toBe("ARCHIVED");

    const restoreRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}/restore`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(((await restoreRes.json()) as EntrySummary).status).toBe("READY");

    await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}/archive`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    const deleteRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}`, { method: "DELETE", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(deleteRes.status).toBe(204);

    const getRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(getRes.status).toBe(404);
  });

  it("validate: turns the READY active version into trusted knowledge, never inherits across a new version, and never re-validates silently (mission §15/§16)", async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/knowledge/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(tokenOwnerA, orgAId) },
      body: JSON.stringify({ title: "À valider", category: "OTHER" }),
    });
    const entry = (await createRes.json()) as EntrySummary;
    expect(entry.validatedAt).toBeUndefined();

    // Un CONTRIBUTOR n'a pas la permission Validate (palier Admin uniquement, mission §Décision 4).
    const forbiddenRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}/validate`, { method: "POST", headers: authHeaders(tokenContributorA, orgAId) });
    expect(forbiddenRes.status).toBe(403);

    const validateRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}/validate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(validateRes.status).toBe(200);
    const validated = (await validateRes.json()) as EntrySummary;
    expect(validated.validatedByUserId).toBe(ownerAUserId);
    expect(validated.validatedAt).toBeDefined();

    // Jamais une revalidation silencieuse de la même version (mission §16, généralisé).
    const revalidateRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}/validate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(revalidateRes.status).toBe(409);

    // La vérité historique de la version 1 reste validée sur SA PROPRE ligne...
    const version1Res = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}/versions/1`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(((await version1Res.json()) as { validatedAt?: string }).validatedAt).toBeDefined();

    // ...mais une mutation substantielle crée une nouvelle version active JAMAIS validée par défaut.
    const updateRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders(tokenOwnerA, orgAId) },
      body: JSON.stringify({ title: "À valider (modifié)" }),
    });
    const updated = (await updateRes.json()) as EntrySummary;
    expect(updated.activeVersionNumber).toBe(2);
    expect(updated.validatedAt).toBeUndefined();

    const version2Res = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}/versions/2`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(((await version2Res.json()) as { validatedAt?: string }).validatedAt).toBeUndefined();
  });

  it("validate: refuses a DRAFT entry that has nothing stable to validate yet (409)", async () => {
    const form = new FormData();
    form.append("title", "Import en cours");
    form.append("category", "OTHER");
    form.append("file", new Blob([buildMinimalPdf(["draft-marker"])], { type: "application/pdf" }), "draft.pdf");

    const createRes = await fetch(`${baseUrl}/api/v1/knowledge/documents`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: form });
    const created = (await createRes.json()) as EntrySummary;
    expect(["DRAFT", "PROCESSING"]).toContain(created.status);

    const validateRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${created.id}/validate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(validateRes.status).toBe(409);
  });

  /** Correctif audit Codex P2 — preuve réelle (Postgres, pas un fake) que `validatedOnly` filtre
   *  CÔTÉ SQL, AVANT pagination : `total` reflète le compte filtré, jamais celui de la page brute
   *  non filtrée. */
  it("search validatedOnly=true filters at the SQL level, including a reliable total (never the unfiltered page count)", async () => {
    const marker = `validatedonly-marker-${randomUUID()}`;
    const validatedRes = await fetch(`${baseUrl}/api/v1/knowledge/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(tokenOwnerA, orgAId) },
      body: JSON.stringify({ title: `Entrée validée ${marker}`, category: "OTHER" }),
    });
    const validatedEntry = (await validatedRes.json()) as EntrySummary;
    await fetch(`${baseUrl}/api/v1/knowledge/entries/${validatedEntry.id}/validate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });

    await fetch(`${baseUrl}/api/v1/knowledge/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(tokenOwnerA, orgAId) },
      body: JSON.stringify({ title: `Entrée non validée ${marker}`, category: "OTHER" }),
    });

    const unfilteredRes = await fetch(`${baseUrl}/api/v1/knowledge/search?query=${encodeURIComponent(marker)}`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const unfiltered = (await unfilteredRes.json()) as { items: { knowledgeEntryId: string }[]; total: number };
    expect(unfiltered.total).toBe(2);

    const filteredRes = await fetch(`${baseUrl}/api/v1/knowledge/search?query=${encodeURIComponent(marker)}&validatedOnly=true`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const filtered = (await filteredRes.json()) as { items: { knowledgeEntryId: string }[]; total: number };
    expect(filtered.total).toBe(1);
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]!.knowledgeEntryId).toBe(validatedEntry.id);
  });

  it("a CONTRIBUTOR cannot permanently delete (Admin-tier only)", async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/knowledge/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(tokenContributorA, orgAId) },
      body: JSON.stringify({ title: "Protégé", category: "OTHER" }),
    });
    const entry = (await createRes.json()) as EntrySummary;
    await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}/archive`, { method: "POST", headers: authHeaders(tokenContributorA, orgAId) });

    const deleteRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}`, { method: "DELETE", headers: authHeaders(tokenContributorA, orgAId) });
    expect(deleteRes.status).toBe(403);
  });

  it("READ_ONLY can read and search but never mutate (list, get, search all 200; write attempts 403)", async () => {
    const listRes = await fetch(`${baseUrl}/api/v1/knowledge/entries`, { headers: authHeaders(tokenReadOnlyA, orgAId) });
    expect(listRes.status).toBe(200);

    const searchRes = await fetch(`${baseUrl}/api/v1/knowledge/search?query=cv`, { headers: authHeaders(tokenReadOnlyA, orgAId) });
    expect(searchRes.status).toBe(200);

    const createRes = await fetch(`${baseUrl}/api/v1/knowledge/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(tokenReadOnlyA, orgAId) },
      body: JSON.stringify({ title: "x", category: "OTHER" }),
    });
    expect(createRes.status).toBe(403);
  });

  it("never leaks an entry to another organization: list is empty, get is 404, search finds nothing", async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/knowledge/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(tokenOwnerA, orgAId) },
      body: JSON.stringify({ title: "Isolation-marker-unique-title", category: "OTHER" }),
    });
    const entry = (await createRes.json()) as EntrySummary;

    const getRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}`, { headers: authHeaders(tokenAdminB, orgBId) });
    expect(getRes.status).toBe(404);

    const listRes = await fetch(`${baseUrl}/api/v1/knowledge/entries`, { headers: authHeaders(tokenAdminB, orgBId) });
    const listBody = (await listRes.json()) as { items: { id: string }[] };
    expect(listBody.items.some((item) => item.id === entry.id)).toBe(false);

    const searchRes = await fetch(`${baseUrl}/api/v1/knowledge/search?query=Isolation-marker-unique-title`, { headers: authHeaders(tokenAdminB, orgBId) });
    const searchBody = (await searchRes.json()) as { items: { knowledgeEntryId: string }[] };
    expect(searchBody.items.some((item) => item.knowledgeEntryId === entry.id)).toBe(false);

    const archiveRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}/archive`, { method: "POST", headers: authHeaders(tokenAdminB, orgBId) });
    expect(archiveRes.status).toBe(404);
  });

  // Correctif audit — same-org cross-client (mission §5/§22/§63/§64/§70, "TEST BLOQUANT") : Karim
  // est membre de l'organisation A (BID_MANAGER) et a une affectation client RÉELLE sur A1, mais
  // AUCUNE sur A2. Avant ce correctif, seules list/search filtraient correctement par client —
  // chaque route PAR IDENTIFIANT (get/update/archive/restore/delete/versions/tags) chargeait
  // l'entrée par `(id, organizationId)` SEUL, sans jamais vérifier l'accès client réel.
  it("same-org cross-client: Karim (real access on Client A1, none on Client A2) is refused on EVERY by-id route of a Client A2 entry — never a leak (mission §64/§70)", async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/knowledge/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(tokenOwnerA, orgAId) },
      body: JSON.stringify({ title: "Contenu-secret-Client-A2", category: "OTHER", clientAccountId: clientA2Id }),
    });
    expect(createRes.status).toBe(201);
    const entry = (await createRes.json()) as EntrySummary;

    const getRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}`, { headers: authHeaders(tokenKarim, orgAId) });
    expect(getRes.status).toBe(404);

    const updateRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders(tokenKarim, orgAId) },
      body: JSON.stringify({ title: "Tentative de modification" }),
    });
    expect(updateRes.status).toBe(404);

    const listVersionsRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}/versions`, { headers: authHeaders(tokenKarim, orgAId) });
    expect(listVersionsRes.status).toBe(404);

    const getVersionRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}/versions/1`, { headers: authHeaders(tokenKarim, orgAId) });
    expect(getVersionRes.status).toBe(404);

    const restoreVersionRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}/versions/1/restore`, { method: "POST", headers: authHeaders(tokenKarim, orgAId) });
    expect(restoreVersionRes.status).toBe(404);

    const listDocsRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}/documents`, { headers: authHeaders(tokenKarim, orgAId) });
    expect(listDocsRes.status).toBe(404);

    const addTagRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(tokenKarim, orgAId) },
      body: JSON.stringify({ label: "tentative-tag" }),
    });
    expect(addTagRes.status).toBe(404);

    const removeTagRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}/tags/${randomUUID()}`, { method: "DELETE", headers: authHeaders(tokenKarim, orgAId) });
    expect(removeTagRes.status).toBe(404);

    const archiveRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}/archive`, { method: "POST", headers: authHeaders(tokenKarim, orgAId) });
    expect(archiveRes.status).toBe(404);

    const validateRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}/validate`, { method: "POST", headers: authHeaders(tokenKarim, orgAId) });
    expect(validateRes.status).toBe(404);

    const deleteRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}`, { method: "DELETE", headers: authHeaders(tokenKarim, orgAId) });
    expect(deleteRes.status).toBe(404);

    // Preuve que l'entrée existe toujours réellement (jamais supprimée par la tentative ci-dessus) —
    // vérifiée depuis la session d'OwnerA, qui a un accès réel (org-tier bypass) au client A2.
    const stillThereRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(stillThereRes.status).toBe(200);

    // Preuve inverse : ce n'est pas un bug d'authentification générale — Karim PEUT bien agir sur
    // une entrée de SON PROPRE client (A1) au sein de la MÊME organisation.
    const ownEntryRes = await fetch(`${baseUrl}/api/v1/knowledge/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(tokenKarim, orgAId) },
      body: JSON.stringify({ title: "Contenu Client A1 (autorisé)", category: "OTHER", clientAccountId: clientA1Id }),
    });
    expect(ownEntryRes.status).toBe(201);
    const ownEntry = (await ownEntryRes.json()) as EntrySummary;
    const ownGetRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${ownEntry.id}`, { headers: authHeaders(tokenKarim, orgAId) });
    expect(ownGetRes.status).toBe(200);
    expect(((await ownGetRes.json()) as EntrySummary).createdByUserId).toBe(karimUserId);
  });

  // Correctif audit — reproduit la faille pour la route document-scopée (get/reprocess), avec un
  // document réel (l'entrée manuelle ci-dessus n'en a aucun).
  it("same-org cross-client: Karim cannot read or reprocess a document attached to a Client A2 entry", async () => {
    const form = new FormData();
    form.append("title", "Document-secret-Client-A2");
    form.append("category", "ADMINISTRATIVE");
    form.append("clientAccountId", clientA2Id);
    form.append("file", new Blob([buildMinimalPdf(["secret-content-marker"])], { type: "application/pdf" }), "secret.pdf");

    const createRes = await fetch(`${baseUrl}/api/v1/knowledge/documents`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: form });
    expect(createRes.status).toBe(201);
    const entry = (await waitForEntryStatus((await createRes.json() as EntrySummary).id, tokenOwnerA, orgAId, ["READY", "FAILED", "PARTIALLY_READY"])) as EntrySummary;

    const docsAsOwner = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}/documents`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const [document] = (await docsAsOwner.json()) as { id: string }[];
    expect(document).toBeDefined();

    const getDocRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}/documents/${document!.id}`, { headers: authHeaders(tokenKarim, orgAId) });
    expect(getDocRes.status).toBe(404);

    const reprocessRes = await fetch(`${baseUrl}/api/v1/knowledge/entries/${entry.id}/documents/${document!.id}/reprocess`, { method: "POST", headers: authHeaders(tokenKarim, orgAId) });
    expect(reprocessRes.status).toBe(404);
  });

  it("rejects an unauthenticated request (401)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/knowledge/entries`);
    expect(res.status).toBe(401);
  });

  it("GET /knowledge/tags lists organization tags, tenant-scoped", async () => {
    await fetch(`${baseUrl}/api/v1/knowledge/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(tokenContributorA, orgAId) },
      body: JSON.stringify({ title: "x", category: "OTHER", tags: ["tag-liste-unique"] }),
    });

    const tagsRes = await fetch(`${baseUrl}/api/v1/knowledge/tags`, { headers: authHeaders(tokenContributorA, orgAId) });
    const tags = (await tagsRes.json()) as { label: string }[];
    expect(tags.some((tag) => tag.label === "tag-liste-unique")).toBe(true);

    const tagsFromOrgB = await fetch(`${baseUrl}/api/v1/knowledge/tags`, { headers: authHeaders(tokenAdminB, orgBId) });
    const tagsB = (await tagsFromOrgB.json()) as { label: string }[];
    expect(tagsB.some((tag) => tag.label === "tag-liste-unique")).toBe(false);
  });
});
