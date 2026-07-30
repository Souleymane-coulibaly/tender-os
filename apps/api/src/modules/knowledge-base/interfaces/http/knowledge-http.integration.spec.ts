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

type EntrySummary = { id: string; status: string; activeVersionNumber: number; tags: { id: string; label: string; displayLabel: string }[] };

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

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Knowledge Base HTTP Test" }),
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
    userIds.push(ownerA.userId, contributorA.userId, readOnlyA.userId, adminB.userId);
    tokenOwnerA = ownerA.token;
    tokenContributorA = contributorA.token;
    tokenReadOnlyA = readOnlyA.token;
    tokenAdminB = adminB.token;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgAId, userId: contributorA.userId, role: OrganizationRole.Contributor });
    await addMembership({ organizationId: orgAId, userId: readOnlyA.userId, role: OrganizationRole.ReadOnly });
    await addMembership({ organizationId: orgBId, userId: adminB.userId, role: OrganizationRole.OrganizationAdmin });
  }, 60000);

  afterAll(async () => {
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
