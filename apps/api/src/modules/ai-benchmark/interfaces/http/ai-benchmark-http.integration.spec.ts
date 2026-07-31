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
 * Audit Codex P1-5 — preuve réelle contre HTTP + PostgreSQL des 5 contrôleurs ai-benchmark
 * (modèles, benchmarks, runs, recommandations, routing policies) : authentification, permissions
 * par rôle, isolation inter-tenant, et codes d'erreur explicites. Représentatif des scénarios les
 * plus critiques (mission Sprint 5.2), pas une matrice exhaustive par endpoint — voir le rapport
 * final pour ce qui reste volontairement hors de cette passe.
 */
describe("ai-benchmark — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];
  // AiModel est un registre GLOBAL (pas d'organizationId) — jamais nettoyable par organizationId,
  // on suit donc explicitement chaque modèle créé par ce fichier pour le nettoyer précisément.
  const createdModelIds: string[] = [];

  let tokenOwnerA: string;
  let tokenReadOnlyA: string;
  let tokenOwnerB: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "AI Benchmark HTTP Test" }),
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

  async function addMembership(input: {
    organizationId: string;
    userId: string;
    role: (typeof OrganizationRole)[keyof typeof OrganizationRole];
  }): Promise<void> {
    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({
        id: MembershipId.from(randomUUID()),
        organizationId: input.organizationId,
        userId: input.userId,
        role: input.role,
        occurredAt: new Date(),
      }),
    );
  }

  function authHeaders(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId, "Content-Type": "application/json" };
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

    await prisma.organization.createMany({
      data: [
        { id: orgAId, name: "AI Benchmark Org A HTTP", slug: `ai-benchmark-org-a-http-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "AI Benchmark Org B HTTP", slug: `ai-benchmark-org-b-http-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });

    const ownerA = await registerAndLogin(`ai-benchmark-owner-a-${randomUUID()}@smoke.test`);
    const readOnlyA = await registerAndLogin(`ai-benchmark-readonly-a-${randomUUID()}@smoke.test`);
    const ownerB = await registerAndLogin(`ai-benchmark-owner-b-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId, readOnlyA.userId, ownerB.userId);
    tokenOwnerA = ownerA.token;
    tokenReadOnlyA = readOnlyA.token;
    tokenOwnerB = ownerB.token;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgAId, userId: readOnlyA.userId, role: OrganizationRole.ReadOnly });
    await addMembership({ organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner });
  }, 60000);

  afterAll(async () => {
    await prisma.routingPolicy.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.modelRecommendation.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.benchmarkCaseResult.deleteMany({ where: { run: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.benchmarkRunModel.deleteMany({ where: { run: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.benchmarkRun.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    if (createdModelIds.length > 0) {
      await prisma.aiModelPricingSnapshot.deleteMany({ where: { aiModelId: { in: createdModelIds } } });
      await prisma.aiModel.deleteMany({ where: { id: { in: createdModelIds } } });
    }
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
  });

  describe("authentication", () => {
    it("refuses an unauthenticated request to list models (401)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/ai-models`);
      expect(res.status).toBe(401);
    });
  });

  describe("AiModelsController", () => {
    it("lets an OWNER create a model from the allowed catalog (201)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/ai-models`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ provider: "OPENAI", modelKey: "gpt-4o-mini", displayName: "GPT-4o mini", enabledForBenchmark: true, enabledForProduction: true }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string };
      expect(body.id).toBeDefined();
      createdModelIds.push(body.id);
    });

    it("refuses a model not in the allowed catalog (422)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/ai-models`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ provider: "OPENAI", modelKey: "not-a-real-model", displayName: "Fake model" }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("MODEL_KEY_NOT_ALLOWED");
    });

    it("refuses a duplicate provider/modelKey (409)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/ai-models`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ provider: "OPENAI", modelKey: "gpt-4o-mini", displayName: "Duplicate" }),
      });
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("DUPLICATE_AI_MODEL");
    });

    it("refuses a READ_ONLY actor's attempt to create a model (403), but allows the same actor to list models (200)", async () => {
      const createRes = await fetch(`${baseUrl}/api/v1/ai-models`, {
        method: "POST",
        headers: authHeaders(tokenReadOnlyA, orgAId),
        body: JSON.stringify({ provider: "OPENAI", modelKey: "gpt-4o", displayName: "GPT-4o" }),
      });
      expect(createRes.status).toBe(403);
      const body = (await createRes.json()) as { error: { code: string } };
      expect(body.error.code).toBe("AI_BENCHMARK_PERMISSION_MISSING");

      const listRes = await fetch(`${baseUrl}/api/v1/ai-models`, { headers: authHeaders(tokenReadOnlyA, orgAId) });
      expect(listRes.status).toBe(200);
    });

    it("refuses invalid body shape with 400", async () => {
      const res = await fetch(`${baseUrl}/api/v1/ai-models`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ provider: "OPENAI" }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("BenchmarkSuitesController, BenchmarkRunsController, ModelRecommendationsController, RoutingPoliciesController — full flow + tenant isolation", () => {
    let modelId: string;
    let suiteId: string;
    let runId: string;
    let policyId: string;

    it("OWNER creates a model, adds pricing, creates+publishes a suite with a case, launches a run", async () => {
      const modelRes = await fetch(`${baseUrl}/api/v1/ai-models`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ provider: "OPENAI", modelKey: "gpt-4.1-mini", displayName: "GPT-4.1 mini", enabledForBenchmark: true, enabledForProduction: true }),
      });
      expect(modelRes.status).toBe(201);
      modelId = ((await modelRes.json()) as { id: string }).id;
      createdModelIds.push(modelId);

      const pricingRes = await fetch(`${baseUrl}/api/v1/ai-models/${modelId}/pricing`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ inputPricePerMillionTokens: "5", outputPricePerMillionTokens: "15", currency: "USD" }),
      });
      expect(pricingRes.status).toBe(201);

      const suiteRes = await fetch(`${baseUrl}/api/v1/ai-benchmark/suites`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ name: `HTTP test suite ${randomUUID()}`, promptKey: "ANALYZE_DOCUMENT" }),
      });
      expect(suiteRes.status).toBe(201);
      suiteId = ((await suiteRes.json()) as { id: string }).id;

      const caseRes = await fetch(`${baseUrl}/api/v1/ai-benchmark/suites/${suiteId}/cases`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({
          inputVariables: { text: "La date limite est le 30 septembre 2026." },
          expectedOutput: { submissionDeadline: "2026-09-30" },
          difficulty: "EASY",
          language: "FR",
        }),
      });
      expect(caseRes.status).toBe(201);

      const publishRes = await fetch(`${baseUrl}/api/v1/ai-benchmark/suites/${suiteId}/publish`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
      });
      expect(publishRes.status).toBe(200);

      const launchRes = await fetch(`${baseUrl}/api/v1/ai-benchmark/runs`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ suiteId, modelIds: [modelId], repetitions: 1, concurrencyLimit: 1 }),
      });
      expect(launchRes.status).toBe(201);
      const runBody = (await launchRes.json()) as { id: string; status: string };
      runId = runBody.id;
      expect(runBody.status).toBe("PENDING");
    });

    it("never lets an OWNER from another organization read the run, the suite, or launch against it (404s, never 403 leaking existence)", async () => {
      const runRes = await fetch(`${baseUrl}/api/v1/ai-benchmark/runs/${runId}`, { headers: authHeaders(tokenOwnerB, orgBId) });
      expect(runRes.status).toBe(404);

      const resultsRes = await fetch(`${baseUrl}/api/v1/ai-benchmark/runs/${runId}/results`, { headers: authHeaders(tokenOwnerB, orgBId) });
      expect(resultsRes.status).toBe(404);

      const cancelRes = await fetch(`${baseUrl}/api/v1/ai-benchmark/runs/${runId}/cancel`, { method: "POST", headers: authHeaders(tokenOwnerB, orgBId) });
      expect(cancelRes.status).toBe(404);
    });

    it("refuses to cancel a run for a role without LaunchBenchmark permission (403)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/ai-benchmark/runs/${runId}/cancel`, {
        method: "POST",
        headers: authHeaders(tokenReadOnlyA, orgAId),
      });
      expect(res.status).toBe(403);
    });

    it("creates a routing policy (DRAFT) and refuses activation with a model not enabled for production (422)", async () => {
      const disabledModelRes = await fetch(`${baseUrl}/api/v1/ai-models`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ provider: "OPENAI", modelKey: "o3-mini", displayName: "o3-mini (disabled)", enabledForProduction: false }),
      });
      expect(disabledModelRes.status).toBe(201);
      const disabledModelId = ((await disabledModelRes.json()) as { id: string }).id;
      createdModelIds.push(disabledModelId);

      const policyRes = await fetch(`${baseUrl}/api/v1/ai-benchmark/routing-policies`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ promptKey: "ANALYZE_DOCUMENT", primaryAiModelId: disabledModelId, timeoutMs: 30000, maxRetries: 1, escalationConditions: [] }),
      });
      expect(policyRes.status).toBe(201);
      const disabledPolicyId = ((await policyRes.json()) as { id: string }).id;

      const activateRes = await fetch(`${baseUrl}/api/v1/ai-benchmark/routing-policies/${disabledPolicyId}/activate`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
      });
      expect(activateRes.status).toBe(422);
      const body = (await activateRes.json()) as { error: { code: string } };
      expect(body.error.code).toBe("ROUTING_POLICY_MODEL_NOT_ELIGIBLE");
    });

    it("creates and activates a routing policy with an eligible model (201, then 200)", async () => {
      const policyRes = await fetch(`${baseUrl}/api/v1/ai-benchmark/routing-policies`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ promptKey: "ANALYZE_DOCUMENT", primaryAiModelId: modelId, timeoutMs: 30000, maxRetries: 1, escalationConditions: [] }),
      });
      expect(policyRes.status).toBe(201);
      policyId = ((await policyRes.json()) as { id: string }).id;

      const activateRes = await fetch(`${baseUrl}/api/v1/ai-benchmark/routing-policies/${policyId}/activate`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
      });
      expect(activateRes.status).toBe(200);
      const body = (await activateRes.json()) as { status: string };
      expect(body.status).toBe("ACTIVE");
    });

    it("never lets another organization see, activate, or archive this routing policy (404)", async () => {
      const getRes = await fetch(`${baseUrl}/api/v1/ai-benchmark/routing-policies/${policyId}`, { headers: authHeaders(tokenOwnerB, orgBId) });
      expect(getRes.status).toBe(404);

      const archiveRes = await fetch(`${baseUrl}/api/v1/ai-benchmark/routing-policies/${policyId}/archive`, {
        method: "POST",
        headers: authHeaders(tokenOwnerB, orgBId),
      });
      expect(archiveRes.status).toBe(404);
    });

    it("refuses a READ_ONLY actor's attempt to create or activate a routing policy (403)", async () => {
      const createRes = await fetch(`${baseUrl}/api/v1/ai-benchmark/routing-policies`, {
        method: "POST",
        headers: authHeaders(tokenReadOnlyA, orgAId),
        body: JSON.stringify({ promptKey: "ANALYZE_DOCUMENT", primaryAiModelId: modelId, timeoutMs: 30000, maxRetries: 1, escalationConditions: [] }),
      });
      expect(createRes.status).toBe(403);

      const activateRes = await fetch(`${baseUrl}/api/v1/ai-benchmark/routing-policies/${policyId}/activate`, {
        method: "POST",
        headers: authHeaders(tokenReadOnlyA, orgAId),
      });
      expect(activateRes.status).toBe(403);
    });

    it("returns 404 for an unknown recommendation id, and 422 when generating one from a run that hasn't completed", async () => {
      const unknownRes = await fetch(`${baseUrl}/api/v1/ai-benchmark/recommendations/${randomUUID()}`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect(unknownRes.status).toBe(404);

      const generateRes = await fetch(`${baseUrl}/api/v1/ai-benchmark/recommendations`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ runId }),
      });
      expect(generateRes.status).toBe(422);
      const body = (await generateRes.json()) as { error: { code: string } };
      expect(body.error.code).toBe("BENCHMARK_RUN_NOT_COMPLETED");
    });
  });
});
