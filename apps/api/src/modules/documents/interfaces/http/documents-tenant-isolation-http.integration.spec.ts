import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { ACCESS_TOKEN_SERVICE, type AccessTokenService } from "../../../identity/application/ports/access-token.service";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E12 (mission §15/§16/§22/§93) — comble la lacune de preuve n°1 de
 * l'audit : le module `documents` n'avait AUCUN test HTTP d'isolation tenant (uniquement une preuve
 * au niveau repository), alors qu'il porte la surface la plus sensible du produit — le
 * TÉLÉCHARGEMENT de fichier. Le code est correct par inspection (clé de stockage minée côté serveur
 * à partir d'une ligne déjà lue avec `organizationId`, jamais depuis une entrée utilisateur) ; ce
 * test le PROUVE en HTTP + PostgreSQL réel, y compris sur les deux routes de téléchargement.
 *
 * Convention anti-énumération du dépôt (mission §80) : 404, jamais 403 — un 403 confirmerait
 * l'existence de la ressource d'un autre tenant.
 */
describe("Documents — tenant isolation (Checkpoint TENDEROS-2.1-P2.3-E12) — HTTP + PostgreSQL réel", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let accessTokenService: AccessTokenService;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];
  let tokenA: string;
  let tokenB: string;
  let documentAId: string;
  let versionAId: string;

  async function createActor(email: string): Promise<{ userId: string; token: string }> {
    const userId = randomUUID();
    await prisma.user.create({ data: { id: userId, email, displayName: "Documents Isolation Test", status: "ACTIVE", passwordHash: "not-used-direct-actor-creation" } });
    const sessionId = randomUUID();
    await prisma.session.create({ data: { id: sessionId, userId, expiresAt: new Date(Date.now() + 3600_000) } });
    return { userId, token: accessTokenService.issue({ userId, sessionId }, 3600) };
  }

  function headersFor(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId };
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
    accessTokenService = moduleRef.get(ACCESS_TOKEN_SERVICE);

    await prisma.organization.createMany({
      data: [
        { id: orgAId, name: "Documents Isolation Org A", slug: `documents-isolation-a-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Documents Isolation Org B", slug: `documents-isolation-b-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });

    const membershipRepository = new PrismaMembershipRepository(prisma);
    const ownerA = await createActor(`documents-isolation-a-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId);
    tokenA = ownerA.token;
    await membershipRepository.save(OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner, occurredAt: new Date() }));

    const ownerB = await createActor(`documents-isolation-b-${randomUUID()}@smoke.test`);
    userIds.push(ownerB.userId);
    tokenB = ownerB.token;
    await membershipRepository.save(OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner, occurredAt: new Date() }));

    // Document RÉEL d'Org A, créé via le VRAI endpoint d'upload (jamais un insert Prisma direct) :
    // la clé de stockage et la version sont donc produites par le vrai pipeline.
    const form = new FormData();
    form.append("title", "Document confidentiel Org A");
    form.append("origin", "USER_UPLOAD");
    form.append("domain", "TENDER");
    form.append("file", new Blob([Buffer.from("contenu strictement reserve a l'organisation A")], { type: "application/pdf" }), "confidentiel-a.pdf");
    const uploadRes = await fetch(`${baseUrl}/api/v1/documents`, { method: "POST", headers: headersFor(tokenA, orgAId), body: form });
    expect(uploadRes.status).toBe(201);
    const created = (await uploadRes.json()) as { id: string; currentVersion: { id: string } };
    documentAId = created.id;
    versionAId = created.currentVersion.id;
  }, 60000);

  afterAll(async () => {
    await prisma.documentVersion.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.document.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
    await prisma.$disconnect();
  }, 60000);

  it("BLOQUANT (P0 surface) — Org B ne peut jamais LIRE la fiche d'un document d'Org A (404, jamais 403)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/documents/${documentAId}`, { headers: headersFor(tokenB, orgBId) });
    expect(res.status).toBe(404);
  });

  it("BLOQUANT (P0 surface) — Org B ne peut jamais TÉLÉCHARGER le fichier d'Org A, même en connaissant l'UUID exact", async () => {
    const res = await fetch(`${baseUrl}/api/v1/documents/${documentAId}/download`, { headers: headersFor(tokenB, orgBId) });
    expect(res.status).toBe(404);
    // Jamais le moindre octet du contenu d'Org A dans la réponse.
    const body = await res.text();
    expect(body).not.toContain("strictement reserve");
  });

  it("BLOQUANT (P0 surface) — Org B ne peut jamais télécharger une VERSION précise d'un document d'Org A", async () => {
    const res = await fetch(`${baseUrl}/api/v1/documents/${documentAId}/versions/${versionAId}/download`, { headers: headersFor(tokenB, orgBId) });
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).not.toContain("strictement reserve");
  });

  it("BLOQUANT — Org B ne voit jamais le document d'Org A dans SA propre liste", async () => {
    const res = await fetch(`${baseUrl}/api/v1/documents`, { headers: headersFor(tokenB, orgBId) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string }> };
    expect(body.items.some((d) => d.id === documentAId)).toBe(false);
  });

  it("BLOQUANT (write cross-tenant) — Org B ne peut jamais ARCHIVER un document d'Org A, et l'état DB reste intact", async () => {
    const res = await fetch(`${baseUrl}/api/v1/documents/${documentAId}/archive`, { method: "POST", headers: headersFor(tokenB, orgBId) });
    expect(res.status).toBe(404);

    // Preuve en base — jamais seulement le code HTTP (mission §16 "inspecter PostgreSQL après les
    // attaques write").
    const row = await prisma.document.findUniqueOrThrow({ where: { id: documentAId } });
    expect(row.deletedAt).toBeNull();
    expect(row.organizationId).toBe(orgAId);
  });

  it("BLOQUANT (write cross-tenant) — Org B ne peut jamais ajouter une version à un document d'Org A", async () => {
    const form = new FormData();
    form.append("file", new Blob([Buffer.from("injection depuis org B")], { type: "application/pdf" }), "injection-b.pdf");
    const res = await fetch(`${baseUrl}/api/v1/documents/${documentAId}/versions`, { method: "POST", headers: headersFor(tokenB, orgBId), body: form });
    expect(res.status).toBe(404);

    const versions = await prisma.documentVersion.findMany({ where: { documentId: documentAId } });
    expect(versions).toHaveLength(1);
    expect(versions[0]!.organizationId).toBe(orgAId);
  });

  it("le propriétaire légitime (Org A) télécharge bien son document — la garde n'est jamais un faux positif", async () => {
    const res = await fetch(`${baseUrl}/api/v1/documents/${documentAId}/download`, { headers: headersFor(tokenA, orgAId) });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("strictement reserve");
  });
});
