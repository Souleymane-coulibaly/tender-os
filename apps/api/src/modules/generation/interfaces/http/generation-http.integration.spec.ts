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
      body: JSON.stringify({ email, password, displayName: "Generation HTTP Test", termsAccepted: true }),
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
    // Mission Sprint 8A.2 — une fois qu'une RoutingPolicy ACTIVE existe pour EXECUTIVE_SUMMARY
    // (bloc "generation capabilities"), les générations lancées plus loin dans ce fichier
    // produisent une vraie RoutingDecision durable (audit Codex P1-2), référencée par
    // `Generation.routingDecisionId` : `generation` doit donc être supprimée AVANT
    // `routingDecision` (sens inverse de la FK), qui doit elle-même précéder `routingPolicy`
    // (contrainte FK réelle) — jamais nettoyées par les suppressions "métier" ci-dessous.
    await prisma.generation.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.routingDecision.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.routingPolicy.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
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

  /** Mission Sprint 8A.2 (bugs #1/#4 — "aucune vérification en amont", "No active routing policy"
   *  affiché sans que le frontend sache jamais lesquels des 17 types sont réellement utilisables).
   *  Réutilise EXECUTIVE_SUMMARY (template + version ACTIVE déjà créés par le bloc précédent).
   *  Checkpoint TENDEROS-2.1-P2.3-E4.1 — `AiModelRouter` résout TOUJOURS un modèle (AUTOMATIC,
   *  aucune configuration requise) : template + version ACTIVE suffisent désormais à `ready: true`,
   *  une `RoutingPolicy` (active ou non) n'a plus aucune influence sur ce résultat. */
  describe("generation capabilities (mission Sprint 8A.2)", () => {
    async function activateRoutingPolicyFor(taskType: string): Promise<void> {
      const aiModelRepository = new PrismaAiModelRepository(prisma);
      const routingPolicyRepository = new PrismaRoutingPolicyRepository(prisma);
      const model = await createUniqueProductionAiModel(aiModelRepository, {
        displayNamePrefix: `Capabilities test model (${taskType})`,
        occurredAt: new Date(),
      });
      const policy = RoutingPolicy.create({
        id: randomUUID(),
        organizationId: orgAId,
        promptKey: taskType,
        version: 1,
        primaryAiModelId: model.id,
        timeoutMs: 30000,
        maxRetries: 1,
        escalationConditions: [],
        authorUserId: userIds[0]!,
        occurredAt: new Date(),
      });
      await routingPolicyRepository.create(policy);
      policy.activate(new Date());
      await routingPolicyRepository.activateAtomically(policy);
    }

    it("a task type with no prompt template at all is not ready (PROMPT_TEMPLATE_NOT_FOUND)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/generation-capabilities`, {
        headers: authHeaders(tokenOwnerA, orgAId),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: { taskType: string; ready: boolean; reasonCode?: string }[] };
      expect(body.items).toHaveLength(17);

      const quality = body.items.find((item) => item.taskType === "QUALITY");
      expect(quality).toEqual({ taskType: "QUALITY", ready: false, reasonCode: "PROMPT_TEMPLATE_NOT_FOUND" });
    });

    it("BLOQUANT — Checkpoint TENDEROS-2.1-P2.3-E4.1: a task type with an active prompt template + version is ready WITHOUT any RoutingPolicy (AiModelRouter resolves AUTOMATIC, no configuration required)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/generation-capabilities`, {
        headers: authHeaders(tokenOwnerA, orgAId),
      });
      const body = (await res.json()) as { items: { taskType: string; ready: boolean; reasonCode?: string }[] };
      const executiveSummary = body.items.find((item) => item.taskType === "EXECUTIVE_SUMMARY");
      expect(executiveSummary).toEqual({ taskType: "EXECUTIVE_SUMMARY", ready: true });
    });

    it("BLOQUANT — an active RoutingPolicy for that task type changes NOTHING (readiness was already true, RoutingPolicy no longer participates in model selection at all)", async () => {
      await activateRoutingPolicyFor("EXECUTIVE_SUMMARY");

      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/generation-capabilities`, {
        headers: authHeaders(tokenOwnerA, orgAId),
      });
      const body = (await res.json()) as { items: { taskType: string; ready: boolean; reasonCode?: string }[] };
      const executiveSummary = body.items.find((item) => item.taskType === "EXECUTIVE_SUMMARY");
      expect(executiveSummary).toEqual({ taskType: "EXECUTIVE_SUMMARY", ready: true });
    });

    it("never leaks org A's readiness into org B's capabilities (tenant isolation)", async () => {
      const tenderBId = randomUUID();
      const clientBId = randomUUID();
      await prisma.clientAccount.create({
        data: { id: clientBId, organizationId: orgBId, name: "Client B", nameNormalized: "client b", status: "ACTIVE", createdBy: userIds[2]! },
      });
      await prisma.tender.create({
        data: { id: tenderBId, organizationId: orgBId, clientAccountId: clientBId, title: "Marché B HTTP", status: "DRAFT", tags: [], createdBy: userIds[2]! },
      });

      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderBId}/generation-capabilities`, {
        headers: authHeaders(tokenOwnerB, orgBId),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: { taskType: string; ready: boolean; reasonCode?: string }[] };
      const executiveSummary = body.items.find((item) => item.taskType === "EXECUTIVE_SUMMARY");
      expect(executiveSummary).toEqual({ taskType: "EXECUTIVE_SUMMARY", ready: false, reasonCode: "PROMPT_TEMPLATE_NOT_FOUND" });
    });

    it("refuses a CONTRIBUTOR not assigned to the client (404, never a leak via 403)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/generation-capabilities`, {
        headers: authHeaders(tokenContributorA, orgAId),
      });
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
      // `InProcessGenerationDispatcher`) qui réserve (PENDING -> GENERATING) puis appelle le
      // provider réellement (Checkpoint TENDEROS-2.1-P2.3-E4 : `AiModelRouter` résout désormais un
      // modèle même SANS RoutingPolicy active — le pipeline ne s'arrête plus instantanément sur
      // `NO_ACTIVE_ROUTING_POLICY`, un vrai aller-retour réseau OpenAI a lieu, avec `gpt-5.4-mini`
      // qui n'est pas encore un modèle réel côté OpenAI à ce jour ⇒ l'issue naturelle (FAILED ou
      // GENERATED selon la réponse réelle de l'API) n'est plus déterministe en quelques dizaines de
      // ms comme avant ce checkpoint). On attend un état terminal (fenêtre élargie), puis on amène
      // la ligne à GENERATED — directement si elle y est déjà, sinon via le chemin de transitions
      // autorisé FAILED -> PENDING -> GENERATING -> GENERATED — sans jamais contourner la machine à
      // états du domaine.
      let record = await prisma.generation.findUnique({ where: { id } });
      for (let attempt = 0; attempt < 100 && (record?.status === "PENDING" || record?.status === "GENERATING"); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        record = await prisma.generation.findUnique({ where: { id } });
      }
      expect(["FAILED", "GENERATED"]).toContain(record?.status);

      if (record?.status === "GENERATED") {
        return id;
      }

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
    }, 20000);

    it("the rejection reason is optional (200, no body)", async () => {
      const generationId = await launchAndMarkGenerated();

      const res = await fetch(`${baseUrl}/api/v1/generations/${generationId}/reject`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
    }, 20000);

    it("never lets org B reject org A's generation (404, not 403 — never reveals its existence)", async () => {
      const generationId = await launchAndMarkGenerated();

      const res = await fetch(`${baseUrl}/api/v1/generations/${generationId}/reject`, {
        method: "POST",
        headers: authHeaders(tokenOwnerB, orgBId),
      });

      expect(res.status).toBe(404);
    }, 20000);

    it("a CONTRIBUTOR not assigned to the client cannot reject (404, cross-client)", async () => {
      const generationId = await launchAndMarkGenerated();

      const res = await fetch(`${baseUrl}/api/v1/generations/${generationId}/reject`, {
        method: "POST",
        headers: authHeaders(tokenContributorA, orgAId),
      });

      expect(res.status).toBe(404);
    }, 20000);

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
    }, 20000);

    it("refuses to reject a FAILED generation (409, incompatible status)", async () => {
      const launchRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/generations`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ taskType: "EXECUTIVE_SUMMARY", targetRef: `reject-failed-test-${randomUUID()}` }),
      });
      const { id: generationId } = (await launchRes.json()) as { id: string };

      // Checkpoint TENDEROS-2.1-P2.3-E4 — un `OPENAI_API_KEY` réel est présent dans cet
      // environnement et `AiModelRouter` résout désormais un modèle même sans RoutingPolicy active :
      // le traitement en arrière-plan n'échoue plus de façon déterministe en quelques dizaines de ms
      // (un vrai aller-retour réseau OpenAI a lieu, avec une issue non prédictible pour un modèle
      // qui n'existe pas encore côté OpenAI). Ce test a besoin SPÉCIFIQUEMENT d'un statut FAILED
      // (pour prouver que le rejet est refusé sur ce statut) — attendre l'issue naturelle du pipeline
      // rendrait ce test flaky. On force donc directement l'échec via le repository, dès que le
      // dispatcher fire-and-forget a réservé la ligne (PENDING -> GENERATING, une transition locale
      // synchrone, gagnée ici avant que le vrai appel réseau — plusieurs secondes, mesuré ci-dessus —
      // n'ait pu aboutir) — jamais un accès SQL brut, toujours le même repository que la production.
      let record = await prisma.generation.findUnique({ where: { id: generationId } });
      for (let attempt = 0; attempt < 20 && record?.status === "PENDING"; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        record = await prisma.generation.findUnique({ where: { id: generationId } });
      }
      expect(record?.status).toBe("GENERATING");

      const generation = await generationRepository.findById({ organizationId: orgAId, generationId });
      generation!.markFailed({ errorCode: "AI_TIMEOUT", errorMessage: "Forced failure (test-only, race-safe against the real in-flight provider call)." }, new Date());
      await generationRepository.save(generation!);
      record = await prisma.generation.findUnique({ where: { id: generationId } });
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
    }, 20000);
  });

  /** Correctif Sprint 6 (audit Codex P1-1/P1-2), RENVERSÉ au Checkpoint TENDEROS-2.1-P2.3-E4.1 —
   *  preuve end-to-end HTTP + PostgreSQL qu'une `RoutingPolicy` Sprint 5.2 active, même existante et
   *  activée pour ce taskType, N'EST PLUS jamais consommée par le traitement en arrière-plan :
   *  `AiModelRouter` reste la SEULE autorité de sélection du modèle, la RoutingPolicy ne peut plus
   *  le court-circuiter (mission "aucun use case métier live ne doit décider lui-même quel modèle
   *  utiliser" / §"RoutingPolicy ne court-circuite plus le Router"). Un `OPENAI_API_KEY` réel est
   *  présent dans cet environnement : l'appel provider peut donc réellement aboutir OU échouer selon
   *  la réponse réelle d'OpenAI pour `gpt-5.4-mini` — ce test ne prétend pas prédire lequel (jamais
   *  un test flaky sur un détail réseau non maîtrisé), il prouve uniquement ce qui compte réellement
   *  ici : une VRAIE `RoutingDecision` est créée (traçabilité Sprint 5.2 préservée) mais SANS lien
   *  vers la RoutingPolicy active (`routingPolicyId`/`routingPolicyVersion` restent `null`), preuve
   *  indépendante de l'issue finale de l'appel provider. */
  describe("RoutingPolicy no longer consumed by generation (Checkpoint TENDEROS-2.1-P2.3-E4.1)", () => {
    it("BLOQUANT — a generation for a taskType with an ACTIVE RoutingPolicy never consumes it (real RoutingDecision still created via AiModelRouter, routingPolicyId/routingPolicyVersion stay null), regardless of the real provider call's own outcome", async () => {
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
      for (let attempt = 0; attempt < 100 && finalStatus !== "FAILED" && finalStatus !== "GENERATED"; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const record = await prisma.generation.findUnique({ where: { id: generationId } });
        finalStatus = record?.status;
      }

      const stored = await prisma.generation.findUnique({ where: { id: generationId } });
      expect(["FAILED", "GENERATED"]).toContain(stored!.status);
      // La preuve du Checkpoint E4.1 : une VRAIE RoutingDecision existe (traçabilité préservée),
      // mais la RoutingPolicy active N'A JAMAIS été consultée pour le choix du modèle —
      // `routingPolicyId`/`routingPolicyVersion` restent `null` même si `policy` est active pour ce
      // taskType. L'issue de l'appel provider lui-même (succès ou échec réseau réel) n'est pas une
      // hypothèse que ce test cherche à prédire.
      expect(stored!.routingPolicyId).toBeNull();
      expect(stored!.routingPolicyVersion).toBeNull();
      expect(stored!.routingDecisionId).not.toBeNull();

      const decision = await prisma.routingDecision.findUnique({ where: { id: stored!.routingDecisionId! } });
      expect(decision).not.toBeNull();
      expect(decision!.generationId).toBe(generationId);
      expect(decision!.analysisId).toBeNull();
      expect(decision!.status).toBe(stored!.status === "GENERATED" ? "SUCCEEDED" : "FAILED");

      // Ordre imposé par la VRAIE FK composée (audit Codex P1-2) — la génération doit être
      // supprimée AVANT sa RoutingDecision, jamais l'inverse (ON DELETE RESTRICT).
      await prisma.generation.deleteMany({ where: { id: generationId } });
      await prisma.routingDecision.deleteMany({ where: { id: stored!.routingDecisionId! } });
      await prisma.routingPolicy.deleteMany({ where: { id: policy.id } });
      await prisma.aiModel.deleteMany({ where: { id: model.id } });
    }, 20000);
  });
});
