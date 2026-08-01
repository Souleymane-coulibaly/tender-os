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
import { AiModel } from "../../../ai-benchmark/domain/ai-model.aggregate";
import { DuplicateAiModelError } from "../../../ai-benchmark/domain/errors";
import { RoutingPolicy } from "../../../ai-benchmark/domain/routing-policy.aggregate";
import type { AiModelRepository } from "../../../ai-benchmark/application/ports/ai-model.repository";
import { PrismaAiModelRepository } from "../../../ai-benchmark/infrastructure/prisma-ai-model.repository";
import { PrismaRoutingPolicyRepository } from "../../../ai-benchmark/infrastructure/prisma-routing-policy.repository";
import { PrismaGenerationRepository } from "../../infrastructure/prisma-generation.repository";

const CANDIDATE_MODEL_KEYS = ["gpt-4.1", "gpt-4.1-mini", "o3-mini", "gpt-4o", "gpt-4o-mini"] as const;

/** Le registre `ai_model` est GLOBAL et partagé par tous les fichiers de test exécutés en parallèle
 *  contre la MÊME base réelle — essaie chaque clé autorisée jusqu'à ce qu'une création réussisse,
 *  plutôt que de parier sur une clé "probablement libre" (déjà observé fragile sous forte charge). */
async function createUniqueProductionAiModel(
  aiModelRepository: AiModelRepository,
  input: { displayNamePrefix: string; occurredAt: Date },
): Promise<AiModel> {
  let lastError: unknown;
  for (const modelKey of CANDIDATE_MODEL_KEYS) {
    const model = AiModel.create({
      id: randomUUID(),
      provider: "OPENAI",
      modelKey,
      displayName: `${input.displayNamePrefix} (${modelKey})`,
      enabledForProduction: true,
      occurredAt: input.occurredAt,
    });
    try {
      await aiModelRepository.create(model);
      return model;
    } catch (error) {
      if (error instanceof DuplicateAiModelError) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/**
 * Preuve réelle HTTP + PostgreSQL du module Generation (Sprint 6) — flux complet (prompt →
 * activation → génération → lecture), permissions par rôle, et isolation inter-tenant.
 * Représentatif des scénarios les plus critiques, pas une matrice exhaustive par endpoint.
 */
describe("Generation — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const clientAId = randomUUID();
  const tenderAId = randomUUID();
  const userIds: string[] = [];

  let tokenOwnerA: string;
  let tokenContributorA: string;
  let tokenOwnerB: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Generation HTTP Test" }),
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
        { id: orgAId, name: "Generation Org A HTTP", slug: `generation-org-a-http-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Generation Org B HTTP", slug: `generation-org-b-http-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });

    const ownerA = await registerAndLogin(`generation-owner-a-${randomUUID()}@smoke.test`);
    const contributorA = await registerAndLogin(`generation-contrib-a-${randomUUID()}@smoke.test`);
    const ownerB = await registerAndLogin(`generation-owner-b-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId, contributorA.userId, ownerB.userId);
    tokenOwnerA = ownerA.token;
    tokenContributorA = contributorA.token;
    tokenOwnerB = ownerB.token;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgAId, userId: contributorA.userId, role: OrganizationRole.Contributor });
    await addMembership({ organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner });

    await prisma.clientAccount.create({
      data: { id: clientAId, organizationId: orgAId, name: "Client A", nameNormalized: "client a", status: "ACTIVE", createdBy: ownerA.userId },
    });
    await prisma.tender.create({
      data: { id: tenderAId, organizationId: orgAId, clientAccountId: clientAId, title: "Marché HTTP", status: "DRAFT", tags: [], createdBy: ownerA.userId },
    });
  }, 60000);

  afterAll(async () => {
    await prisma.generation.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.promptVersion.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.promptTemplate.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tender.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
  });

  it("refuses an unauthenticated request (401)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/prompt-templates`);
    expect(res.status).toBe(401);
  });

  describe("prompt template management", () => {
    let templateId: string;
    let versionId: string;

    it("OWNER creates a prompt template + version and activates it", async () => {
      const templateRes = await fetch(`${baseUrl}/api/v1/prompt-templates`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ taskType: "EXECUTIVE_SUMMARY", name: "Synthèse exécutive", outputMode: "FREE_TEXT" }),
      });
      expect(templateRes.status).toBe(201);
      const template = (await templateRes.json()) as { id: string };
      templateId = template.id;

      const versionRes = await fetch(`${baseUrl}/api/v1/prompt-templates/${templateId}/versions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ systemPrompt: "You are helpful.", userPromptTemplate: "Summarize {{tender.title}}.", requiredVariables: ["tender.title"] }),
      });
      expect(versionRes.status).toBe(201);
      const version = (await versionRes.json()) as { id: string; status: string };
      versionId = version.id;
      expect(version.status).toBe("DRAFT");

      const activateRes = await fetch(`${baseUrl}/api/v1/prompt-templates/${templateId}/versions/${versionId}/activate`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
      });
      expect(activateRes.status).toBe(200);
      const activated = (await activateRes.json()) as { status: string };
      expect(activated.status).toBe("ACTIVE");
    });

    it("refuses a CONTRIBUTOR's attempt to manage prompt templates (403), but allows reading them (200)", async () => {
      const createRes = await fetch(`${baseUrl}/api/v1/prompt-templates`, {
        method: "POST",
        headers: authHeaders(tokenContributorA, orgAId),
        body: JSON.stringify({ taskType: "METHODOLOGY", name: "Méthodologie", outputMode: "FREE_TEXT" }),
      });
      expect(createRes.status).toBe(403);
      const body = (await createRes.json()) as { error: { code: string } };
      expect(body.error.code).toBe("GENERATION_PERMISSION_MISSING");

      const listRes = await fetch(`${baseUrl}/api/v1/prompt-templates`, { headers: authHeaders(tokenContributorA, orgAId) });
      expect(listRes.status).toBe(200);
    });

    it("never lets org B see org A's prompt template (404)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/prompt-templates/${templateId}`, { headers: authHeaders(tokenOwnerB, orgBId) });
      expect(res.status).toBe(404);
    });
  });

  describe("generation launch + double-generation guard + tenant/client isolation", () => {
    let generationId: string;

    it("OWNER launches a generation for the tender (202), and a truly concurrent second launch for the exact same target is refused (409)", async () => {
      // Requêtes lancées EN MÊME TEMPS (jamais séquentiellement) — sans AI_PROVIDER configuré dans
      // cet environnement de test, le traitement en arrière-plan échoue quasi instantanément
      // (AI_PROVIDER_NOT_CONFIGURED), donc un second appel séquentiel pourrait arriver APRÈS que la
      // première génération soit déjà repassée hors du statut "en vol" — ce test doit rester
      // déterministe indépendamment de ce timing.
      const launch = () =>
        fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/generations`, {
          method: "POST",
          headers: authHeaders(tokenOwnerA, orgAId),
          body: JSON.stringify({ taskType: "EXECUTIVE_SUMMARY" }),
        });
      const [resA, resB] = await Promise.all([launch(), launch()]);

      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([202, 409]);

      const accepted = resA.status === 202 ? resA : resB;
      const rejected = resA.status === 409 ? resA : resB;

      const acceptedBody = (await accepted.json()) as { id: string; status: string };
      generationId = acceptedBody.id;
      expect(acceptedBody.status).toBe("PENDING");

      const rejectedBody = (await rejected.json()) as { error: { code: string } };
      expect(rejectedBody.error.code).toBe("GENERATION_ALREADY_RUNNING");
    });

    it("never lets org B read org A's generation (404, not 403)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/generations/${generationId}`, { headers: authHeaders(tokenOwnerB, orgBId) });
      expect(res.status).toBe(404);
    });

    it("a CONTRIBUTOR not assigned to the client cannot read the generation (404)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/generations/${generationId}`, { headers: authHeaders(tokenContributorA, orgAId) });
      expect(res.status).toBe(404);
    });

    it("OWNER can read their own generation (200)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/generations/${generationId}`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string };
      expect(body.id).toBe(generationId);
    });

    it("refuses invalid body shape with 400", async () => {
      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/generations`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ taskType: "NOT_A_REAL_TASK_TYPE" }),
      });
      expect(res.status).toBe(400);
    });
  });

  /** Réaudit Codex P1 — "le rejet d'une génération est absent". Aucun `AI_PROVIDER` n'étant
   *  configuré dans cet environnement de test, une génération ne peut jamais atteindre GENERATED
   *  via le pipeline réel — chaque test fait donc passer une génération fraîchement lancée à
   *  GENERATED directement via `PrismaGenerationRepository` (même repository que la production,
   *  jamais un accès SQL brut), pour isoler le comportement HTTP du endpoint de rejet lui-même. */
  describe("reject (réaudit Codex P1)", () => {
    const generationRepository = new PrismaGenerationRepository(new PrismaService());

    async function launchAndMarkGenerated(): Promise<string> {
      const launchRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/generations`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ taskType: "EXECUTIVE_SUMMARY", targetRef: `reject-test-${randomUUID()}` }),
      });
      expect(launchRes.status).toBe(202);
      const { id } = (await launchRes.json()) as { id: string };

      // Le lancement déclenche IMMÉDIATEMENT un traitement en arrière-plan (fire-and-forget, voir
      // `InProcessGenerationDispatcher`) qui réserve (PENDING -> GENERATING) puis échoue (aucun
      // `AI_PROVIDER` configuré dans cet environnement) : on attend d'abord ce statut terminal
      // naturel pour ne jamais courir contre son propre `reserve()`, puis on rejoue explicitement
      // FAILED -> PENDING -> GENERATING -> GENERATED (chemin de transitions autorisé) pour amener
      // la ligne à GENERATED sans jamais contourner la machine à états du domaine.
      let record = await prisma.generation.findUnique({ where: { id } });
      for (let attempt = 0; attempt < 30 && (record?.status === "PENDING" || record?.status === "GENERATING"); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        record = await prisma.generation.findUnique({ where: { id } });
      }
      expect(record?.status).toBe("FAILED");

      const generation = await generationRepository.findById({ organizationId: orgAId, generationId: id });
      generation!.resetForRetry();
      generation!.reserve();
      generation!.markGenerated(
        { modelProvider: "OPENAI", modelKey: "gpt-4o-mini", fallbackLevel: 0, generatedContent: "Contenu généré de test", latencyMs: 1 },
        new Date(),
      );
      await generationRepository.save(generation!);
      return id;
    }

    it("OWNER can reject a GENERATED generation, recording author/date/reason (200)", async () => {
      const generationId = await launchAndMarkGenerated();

      const res = await fetch(`${baseUrl}/api/v1/generations/${generationId}/reject`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ reason: "Ne répond pas au besoin exprimé" }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { rejectedBy: string; rejectedAt: string; rejectionReason: string; status: string };
      expect(body.rejectedBy).toBeTruthy();
      expect(body.rejectedAt).toBeTruthy();
      expect(body.rejectionReason).toBe("Ne répond pas au besoin exprimé");
      expect(body.status).toBe("GENERATED");
    });

    it("the rejection reason is optional (200, no body)", async () => {
      const generationId = await launchAndMarkGenerated();

      const res = await fetch(`${baseUrl}/api/v1/generations/${generationId}/reject`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
    });

    it("never lets org B reject org A's generation (404, not 403 — never reveals its existence)", async () => {
      const generationId = await launchAndMarkGenerated();

      const res = await fetch(`${baseUrl}/api/v1/generations/${generationId}/reject`, {
        method: "POST",
        headers: authHeaders(tokenOwnerB, orgBId),
      });

      expect(res.status).toBe(404);
    });

    it("a CONTRIBUTOR not assigned to the client cannot reject (404, cross-client)", async () => {
      const generationId = await launchAndMarkGenerated();

      const res = await fetch(`${baseUrl}/api/v1/generations/${generationId}/reject`, {
        method: "POST",
        headers: authHeaders(tokenContributorA, orgAId),
      });

      expect(res.status).toBe(404);
    });

    it("refuses to reject an already-VALIDATED generation (409, incompatible status)", async () => {
      const generationId = await launchAndMarkGenerated();
      const validateRes = await fetch(`${baseUrl}/api/v1/generations/${generationId}/validate`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
      });
      expect(validateRes.status).toBe(200);

      const rejectRes = await fetch(`${baseUrl}/api/v1/generations/${generationId}/reject`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
      });

      expect(rejectRes.status).toBe(409);
      const body = (await rejectRes.json()) as { error: { code: string } };
      expect(body.error.code).toBe("GENERATION_ALREADY_VALIDATED");
    });

    it("refuses to reject a FAILED generation (409, incompatible status)", async () => {
      const launchRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/generations`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ taskType: "EXECUTIVE_SUMMARY", targetRef: `reject-failed-test-${randomUUID()}` }),
      });
      const { id: generationId } = (await launchRes.json()) as { id: string };

      // Le traitement en arrière-plan échoue naturellement (aucun `AI_PROVIDER` configuré) — inutile
      // de fabriquer l'échec, et le fabriquer manuellement ici courrait contre le `reserve()` du
      // dispatcher fire-and-forget (voir `launchAndMarkGenerated`).
      let record = await prisma.generation.findUnique({ where: { id: generationId } });
      for (let attempt = 0; attempt < 30 && (record?.status === "PENDING" || record?.status === "GENERATING"); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        record = await prisma.generation.findUnique({ where: { id: generationId } });
      }
      expect(record?.status).toBe("FAILED");

      const res = await fetch(`${baseUrl}/api/v1/generations/${generationId}/reject`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
      });

      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("GENERATION_NOT_REJECTABLE");
    });

    it("refuses invalid body shape with 400 (reason too long)", async () => {
      const generationId = await launchAndMarkGenerated();

      const res = await fetch(`${baseUrl}/api/v1/generations/${generationId}/reject`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ reason: "x".repeat(1001) }),
      });

      expect(res.status).toBe(400);
    });
  });

  /** Correctif Sprint 6 (audit Codex P1-1/P1-2) — preuve end-to-end HTTP + PostgreSQL que le
   *  traitement en arrière-plan consomme RÉELLEMENT une RoutingPolicy Sprint 5.2 lorsqu'elle existe,
   *  au lieu de retomber sur un modèle codé en dur. Aucun `AI_PROVIDER` n'est configuré dans cet
   *  environnement de test (voir plus haut) : l'échec final attendu est `AI_PROVIDER_NOT_CONFIGURED`
   *  (l'appel provider), jamais `NO_ACTIVE_ROUTING_POLICY` — la seule façon d'atteindre ce point est
   *  qu'une VRAIE RoutingDecision ait déjà été créée et le modèle réellement résolu. */
  describe("real routing policy consumption (audit Codex P1-1/P1-2)", () => {
    it("a generation for a taskType with an ACTIVE RoutingPolicy consumes it (real RoutingDecision created), even though the provider call itself fails in this environment", async () => {
      const now = new Date();

      const templateRes = await fetch(`${baseUrl}/api/v1/prompt-templates`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ taskType: "CRITERION_RESPONSE", name: "Réponse critère (routing test)", outputMode: "FREE_TEXT" }),
      });
      expect(templateRes.status).toBe(201);
      const template = (await templateRes.json()) as { id: string };

      const versionRes = await fetch(`${baseUrl}/api/v1/prompt-templates/${template.id}/versions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ systemPrompt: "You are helpful.", userPromptTemplate: "Answer {{tender.title}}.", requiredVariables: ["tender.title"] }),
      });
      const version = (await versionRes.json()) as { id: string };
      await fetch(`${baseUrl}/api/v1/prompt-templates/${template.id}/versions/${version.id}/activate`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
      });

      const model = await createUniqueProductionAiModel(new PrismaAiModelRepository(prisma), {
        displayNamePrefix: "HTTP Routing Test",
        occurredAt: now,
      });

      const routingPolicyRepository = new PrismaRoutingPolicyRepository(prisma);
      const policy = RoutingPolicy.create({
        id: randomUUID(),
        organizationId: orgAId,
        promptKey: "CRITERION_RESPONSE",
        version: 1,
        primaryAiModelId: model.id,
        timeoutMs: 30000,
        maxRetries: 0,
        escalationConditions: [],
        authorUserId: randomUUID(),
        occurredAt: now,
      });
      await routingPolicyRepository.create(policy);
      policy.activate(now);
      await routingPolicyRepository.activateAtomically(policy);

      const launchRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/generations`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ taskType: "CRITERION_RESPONSE" }),
      });
      expect(launchRes.status).toBe(202);
      const { id: generationId } = (await launchRes.json()) as { id: string };

      let finalStatus: string | undefined;
      for (let attempt = 0; attempt < 20 && finalStatus !== "FAILED" && finalStatus !== "GENERATED"; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const record = await prisma.generation.findUnique({ where: { id: generationId } });
        finalStatus = record?.status;
      }

      const stored = await prisma.generation.findUnique({ where: { id: generationId } });
      expect(stored!.status).toBe("FAILED");
      // La preuve du correctif : l'échec vient de l'appel provider (aucun `AI_PROVIDER` configuré
      // dans cet environnement), jamais de "aucune policy active" — la policy a bien été consommée.
      expect(stored!.errorCode).toBe("AI_PROVIDER_NOT_CONFIGURED");
      expect(stored!.routingPolicyId).toBe(policy.id);
      expect(stored!.routingDecisionId).not.toBeNull();

      const decision = await prisma.routingDecision.findUnique({ where: { id: stored!.routingDecisionId! } });
      expect(decision).not.toBeNull();
      expect(decision!.generationId).toBe(generationId);
      expect(decision!.analysisId).toBeNull();
      expect(decision!.status).toBe("FAILED");

      // Ordre imposé par la VRAIE FK composée (audit Codex P1-2) — la génération doit être
      // supprimée AVANT sa RoutingDecision, jamais l'inverse (ON DELETE RESTRICT).
      await prisma.generation.deleteMany({ where: { id: generationId } });
      await prisma.routingDecision.deleteMany({ where: { id: stored!.routingDecisionId! } });
      await prisma.routingPolicy.deleteMany({ where: { id: policy.id } });
      await prisma.aiModel.deleteMany({ where: { id: model.id } });
    });
  });
});
