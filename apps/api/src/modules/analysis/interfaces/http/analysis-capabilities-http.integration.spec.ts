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

/**
 * Mission — preuve bout-en-bout de `GET /tenders/:tenderId/analysis-capabilities`, réel HTTP +
 * PostgreSQL, réutilisant le VRAI `DefaultAIProviderRegistry` câblé dans `AppModule` (jamais un
 * double). Checkpoint TENDEROS-2.1-P2.3-E4.1 — `GetAnalysisCapabilitiesUseCase` résout désormais
 * le provider avec un sélecteur EXPLICITE `{ provider: "OPENAI" }` (mirroir exact de
 * `resolveModelForAnalysis`/`AiModelRouter`, qui fournit toujours `provider: "OPENAI"` sans jamais
 * consulter `config.aiProvider`/`AI_PROVIDER`). Un `OPENAI_API_KEY` réel est présent dans cet
 * environnement (`apps/api/.env`) : le résultat réel et déterministe ici est donc `ready: true`
 * pour les deux tâches, MÊME si `AI_PROVIDER` reste non configuré — exactement ce que fait
 * réellement une analyse au runtime désormais (avant ce checkpoint, cet endpoint mentait :
 * il rapportait `AI_PROVIDER_NOT_CONFIGURED` alors qu'une analyse réelle aurait réussi).
 */
describe("Analysis — capabilities endpoint, real HTTP + PostgreSQL", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgId = randomUUID();
  const clientId = randomUUID();
  const tenderId = randomUUID();
  const userIds: string[] = [];

  let tokenOwner: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Analysis Capabilities HTTP Test", termsAccepted: true }),
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

  function authHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": orgId, "Content-Type": "application/json" };
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

    await prisma.organization.create({ data: { id: orgId, name: "Analysis Capabilities Org HTTP", slug: `analysis-capabilities-org-http-${orgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });

    const owner = await registerAndLogin(`analysis-capabilities-owner-${randomUUID()}@smoke.test`);
    userIds.push(owner.userId);
    tokenOwner = owner.token;

    await addMembership({ organizationId: orgId, userId: owner.userId, role: OrganizationRole.Owner });

    await prisma.clientAccount.create({ data: { id: clientId, organizationId: orgId, name: "Client Analysis Capabilities HTTP", nameNormalized: "client analysis capabilities http", status: "ACTIVE", createdBy: owner.userId } });
    await prisma.tender.create({ data: { id: tenderId, organizationId: orgId, clientAccountId: clientId, title: "Tender analysis capabilities — HTTP", status: "DRAFT", tags: [], createdBy: owner.userId } });
  }, 60000);

  afterAll(async () => {
    await prisma.tender.deleteMany({ where: { organizationId: orgId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: orgId } });
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: orgId } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: orgId } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await app.close();
  }, 30000);

  it("BLOQUANT — Checkpoint TENDEROS-2.1-P2.3-E4.1: reports both ANALYZE_DOCUMENT and CONSOLIDATE_TENDER_ANALYSIS as ready via the explicit { provider: OPENAI } selector, even though AI_PROVIDER itself is unset in this environment (mirrors the real AiModelRouter runtime path, never config.aiProvider)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/analysis-capabilities`, { headers: authHeaders(tokenOwner) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { taskType: string; ready: boolean; reasonCode?: string }[] };

    expect(body.items).toEqual([
      { taskType: "ANALYZE_DOCUMENT", ready: true },
      { taskType: "CONSOLIDATE_TENDER_ANALYSIS", ready: true },
    ]);
  });

  it("returns 404 for a tender that does not exist, never a silently empty capabilities list", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${randomUUID()}/analysis-capabilities`, { headers: authHeaders(tokenOwner) });
    expect(res.status).toBe(404);
  });
});
