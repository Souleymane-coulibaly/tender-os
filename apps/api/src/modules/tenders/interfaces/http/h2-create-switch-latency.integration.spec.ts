import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";

/**
 * Checkpoint TENDEROS-2.1-H.2 — MESURE de la latence serveur, création et changement de candidat.
 *
 * Ce fichier MESURE, il ne conclut pas. Il établit la part SERVEUR (HTTP entrant → réponse) sur un
 * échantillon représentatif, avec une horloge monotone. La part navigateur — action serveur
 * Next.js, revalidation, navigation — n'est pas observable ici et se mesure séparément.
 *
 * AUCUN SEUIL DE PERFORMANCE N'EST ASSERTÉ : une machine de développement chargée ferait alors
 * échouer une suite de correction pour une raison sans rapport avec le produit. Les seuils posés
 * ci-dessous sont volontairement très larges et ne servent qu'à détecter un ordre de grandeur
 * pathologique — les dizaines de secondes signalées dans le constat d'origine.
 */
describe("H.2 — latence serveur de la création et du changement de candidat (HTTP + PostgreSQL réels)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgId = randomUUID();
  const userIds: string[] = [];
  let token: string;
  let ownerId: string;
  let clientId: string;
  const candidates: string[] = [];

  const ITERATIONS = 10;

  function headers(): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": orgId, "Content-Type": "application/json" };
  }

  function summarize(samples: number[]): { median: number; p95: number; worst: number } {
    const sorted = [...samples].sort((a, b) => a - b);
    const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
    return { median: Math.round(at(0.5)), p95: Math.round(at(0.95)), worst: Math.round(sorted[sorted.length - 1] ?? 0) };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    prisma = moduleRef.get(PrismaService);

    await prisma.organization.create({ data: { id: orgId, name: "H2 lat", slug: `h2-lat-${orgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });

    const password = "SmokeTest#12345";
    const email = `h2-lat-${randomUUID()}@smoke.test`;
    const r = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "H2 lat", termsAccepted: true }),
    });
    ownerId = ((await r.json()) as { id: string }).id;
    userIds.push(ownerId);
    const l = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    token = ((await l.json()) as { accessToken: string }).accessToken;

    await new PrismaMembershipRepository(prisma).save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId: ownerId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    clientId = randomUUID();
    await prisma.clientAccount.create({
      data: { id: clientId, organizationId: orgId, name: `H2 lat client ${clientId}`, nameNormalized: `h2 lat client ${clientId}`, status: "ACTIVE", createdBy: ownerId },
    });
    for (let i = 0; i < 2; i += 1) {
      const id = randomUUID();
      await prisma.candidateCompany.create({
        data: { id, organizationId: orgId, name: `Candidate ${i}`, nameNormalized: `candidate ${i} ${id}`, legalName: `CANDIDATE ${i} SAS`, siren: "356000000", status: "ACTIVE", createdBy: ownerId },
      });
      candidates.push(id);
    }
  }, 300000);

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.tender.deleteMany({ where: { organizationId: orgId } });
    await prisma.candidateCompany.deleteMany({ where: { organizationId: orgId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: orgId } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: orgId } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: orgId } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await app.close();
  }, 180000);

  it(`CRÉATION — ${ITERATIONS} appels HTTP réels, latence serveur mesurée à l'horloge monotone`, async () => {
    const samples: number[] = [];
    const created: string[] = [];

    for (let i = 0; i < ITERATIONS; i += 1) {
      const started = performance.now();
      const res = await fetch(`${baseUrl}/api/v1/tenders`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ title: `Tender latence ${i} ${randomUUID()}`, clientAccountId: clientId, candidateCompanyId: candidates[0] }),
      });
      samples.push(performance.now() - started);
      expect(res.status).toBe(201);
      created.push(((await res.json()) as { id: string }).id);
    }

    const stats = summarize(samples);
    console.log("H2_CREATE_LATENCY_MS", JSON.stringify(stats));

    // Seuil volontairement très large : on cherche l'ordre de grandeur pathologique du constat
    // d'origine (dizaines de secondes), pas une performance cible.
    expect(stats.worst, `pire cas ${stats.worst} ms`).toBeLessThan(10000);
    expect(created).toHaveLength(ITERATIONS);
  }, 600000);

  it(`CHANGEMENT DE CANDIDAT — ${ITERATIONS} bascules A→B→A réelles`, async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/tenders`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ title: `Tender bascule ${randomUUID()}`, clientAccountId: clientId, candidateCompanyId: candidates[0] }),
    });
    expect(createRes.status).toBe(201);
    const tenderId = ((await createRes.json()) as { id: string }).id;

    const samples: number[] = [];
    for (let i = 0; i < ITERATIONS; i += 1) {
      // On alterne réellement A→B→A : répéter la même cible produirait un no-op depuis H.2 et
      // mesurerait un chemin court sans rapport avec un vrai changement.
      const target = candidates[i % 2 === 0 ? 1 : 0]!;
      const started = performance.now();
      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/candidate-company`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ candidateCompanyId: target }),
      });
      samples.push(performance.now() - started);
      expect(res.status, `statut ${res.status}`).toBeLessThan(400);
    }

    const stats = summarize(samples);
    console.log("H2_SWITCH_LATENCY_MS", JSON.stringify(stats));

    expect(stats.worst, `pire cas ${stats.worst} ms`).toBeLessThan(10000);
  }, 600000);
});
