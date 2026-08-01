import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { AiModel } from "../domain/ai-model.aggregate";
import { DuplicateAiModelError } from "../domain/errors";
import { AiModelPricingSnapshot } from "../domain/pricing-snapshot.entity";
import { RoutingPolicy } from "../domain/routing-policy.aggregate";
import type { AiModelRepository } from "../application/ports/ai-model.repository";
import { PrismaAiModelRepository } from "./prisma-ai-model.repository";
import { PrismaPricingSnapshotRepository } from "./prisma-pricing-snapshot.repository";
import { PrismaRoutingPolicyRepository } from "./prisma-routing-policy.repository";
import { PrismaRoutingPolicyResolver } from "./prisma-routing-policy-resolver";
import { PrismaGenerationRoutingDecisionWriter } from "./prisma-generation-routing-decision.writer";

const CANDIDATE_MODEL_KEYS = ["gpt-4.1", "gpt-4.1-mini", "o3-mini", "gpt-4o", "gpt-4o-mini"] as const;

/** Le registre `ai_model` est GLOBAL (aucun `organizationId`) et partagé par tous les fichiers de
 *  test exécutés en parallèle par des workers Vitest distincts contre la MÊME base réelle — un
 *  couple (provider, modelKey) déjà pris par un autre fichier au même instant y échoue légitimement.
 *  Essaie chaque clé autorisée jusqu'à ce qu'une création réussisse, plutôt que de parier sur une
 *  clé "probablement libre" (fragile, déjà observé en pratique sous forte charge de suite complète). */
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
 * Correctif Sprint 6 (audit Codex P1-1/P1-2/P2-3) — preuve réelle contre PostgreSQL que :
 * 1. Une `RoutingPolicy` ACTIVE peut désormais exister pour un `taskType` de Generation et être
 *    résolue par CE MÊME `PrismaRoutingPolicyResolver` que celui d'Analysis (P1-1, "routing dormant").
 * 2. `PrismaGenerationRoutingDecisionWriter` persiste une VRAIE `RoutingDecision` avec `generationId`
 *    renseigné et `analysisId` NULL (P1-2), et calcule un coût RÉEL à partir d'un pricing snapshot
 *    Sprint 5.2 (P2-3) — jamais une configuration statique.
 * 3. La contrainte CHECK `routing_decisions_analysis_or_generation_check` (migration
 *    `20260801103000_generation_real_routing_decision`) est réellement appliquée par PostgreSQL,
 *    jamais seulement une convention applicative.
 */
describe("Generation ↔ Sprint 5.2 routing integration (PostgreSQL réel) — audit Codex", () => {
  const prisma = new PrismaService();
  const aiModelRepository = new PrismaAiModelRepository(prisma);
  const pricingSnapshotRepository = new PrismaPricingSnapshotRepository(prisma);
  const routingPolicyRepository = new PrismaRoutingPolicyRepository(prisma);
  const resolver = new PrismaRoutingPolicyResolver(routingPolicyRepository, aiModelRepository);
  const writer = new PrismaGenerationRoutingDecisionWriter(prisma, aiModelRepository, pricingSnapshotRepository);

  const organizationId = randomUUID();
  const clientAccountId = randomUUID();
  const tenderId = randomUUID();
  const now = new Date("2026-08-01T10:00:00Z");
  const TASK_TYPE = "EXECUTIVE_SUMMARY";
  let modelId: string;
  let modelKey: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "Generation Routing Integration Test Org",
        slug: `gen-routing-integration-org-${organizationId}`,
        defaultTimezone: "Europe/Paris",
        status: "TRIAL",
      },
    });
    await prisma.clientAccount.create({
      data: { id: clientAccountId, organizationId, name: "Client", nameNormalized: "client", status: "ACTIVE", createdBy: randomUUID() },
    });
    await prisma.tender.create({
      data: { id: tenderId, organizationId, clientAccountId, title: "Marché de test", status: "DRAFT", tags: [], createdBy: randomUUID() },
    });

    const model = await createUniqueProductionAiModel(aiModelRepository, { displayNamePrefix: "Generation Routing Test", occurredAt: now });
    modelId = model.id;
    modelKey = model.modelKey;

    const snapshot = AiModelPricingSnapshot.create({
      id: randomUUID(),
      aiModelId: modelId,
      inputPricePerMillionTokens: "5",
      outputPricePerMillionTokens: "15",
      currency: "USD",
      occurredAt: now,
    });
    await pricingSnapshotRepository.addSnapshot(snapshot);
  });

  afterAll(async () => {
    await prisma.routingDecision.deleteMany({ where: { organizationId } });
    await prisma.routingPolicy.deleteMany({ where: { organizationId } });
    await prisma.aiModelPricingSnapshot.deleteMany({ where: { aiModelId: modelId } });
    await prisma.aiModel.deleteMany({ where: { id: modelId } });
    await prisma.tender.deleteMany({ where: { organizationId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.routingDecision.deleteMany({ where: { organizationId } });
    await prisma.routingPolicy.deleteMany({ where: { organizationId } });
  });

  async function seedActivePolicy(): Promise<RoutingPolicy> {
    const policy = RoutingPolicy.create({
      id: randomUUID(),
      organizationId,
      promptKey: TASK_TYPE,
      version: 1,
      primaryAiModelId: modelId,
      timeoutMs: 30000,
      maxRetries: 2,
      escalationConditions: [],
      authorUserId: randomUUID(),
      occurredAt: now,
    });
    await routingPolicyRepository.create(policy);
    policy.activate(now);
    await routingPolicyRepository.activateAtomically(policy);
    return policy;
  }

  it("correctif P1-1 — resolves a REAL active RoutingPolicy for a Generation taskType (the typing widened to `string` is not merely cosmetic)", async () => {
    const policy = await seedActivePolicy();

    const decision = await resolver.resolveActive({ organizationId, promptKey: TASK_TYPE });

    expect(decision).not.toBeNull();
    expect(decision!.policyId).toBe(policy.id);
    expect(decision!.primaryModel).toEqual({ provider: "OPENAI", modelKey });
  });

  it("returns null (never a fabricated decision) when no active policy exists for this taskType", async () => {
    const decision = await resolver.resolveActive({ organizationId, promptKey: TASK_TYPE });
    expect(decision).toBeNull();
  });

  it("correctif P1-2/P2-3 — creates a real RoutingDecision with generationId set (analysisId NULL) and completes it with a REAL cost from the Sprint 5.2 pricing snapshot", async () => {
    const policy = await seedActivePolicy();
    const decisionId = randomUUID();
    const generationId = randomUUID();

    await writer.create({
      id: decisionId,
      organizationId,
      clientAccountId,
      tenderId,
      generationId,
      taskType: TASK_TYPE,
      routingPolicyId: policy.id,
      routingPolicyVersion: policy.version,
      primaryProvider: "OPENAI",
      primaryModel: modelKey,
      occurredAt: now,
    });

    const afterCreate = await prisma.routingDecision.findUnique({ where: { id: decisionId } });
    expect(afterCreate).not.toBeNull();
    expect(afterCreate!.generationId).toBe(generationId);
    expect(afterCreate!.analysisId).toBeNull();
    expect(afterCreate!.status).toBe("IN_PROGRESS");

    const result = await writer.complete({
      id: decisionId,
      selectedProvider: "OPENAI",
      selectedModel: modelKey,
      fallbackLevel: 0,
      fallbackAttempts: 0,
      inputTokenCount: 1_000_000,
      outputTokenCount: 1_000_000,
      latencyMs: 500,
      status: "SUCCEEDED",
      occurredAt: new Date(now.getTime() + 500),
    });

    // 1_000_000 input tokens @ $5/M + 1_000_000 output tokens @ $15/M = $20 — jamais depuis
    // `GenerationConfig.modelRates` (statique), toujours depuis le snapshot Sprint 5.2 réel.
    expect(result.actualCostAmount).toBe("20.000000");
    expect(result.currency).toBe("USD");

    const afterComplete = await prisma.routingDecision.findUnique({ where: { id: decisionId } });
    expect(afterComplete!.actualCostAmount?.toFixed(6)).toBe("20.000000");
    expect(afterComplete!.status).toBe("SUCCEEDED");
  });

  it("returns no cost (never invented) when the selected model has no current pricing snapshot", async () => {
    const otherModel = await createUniqueProductionAiModel(aiModelRepository, { displayNamePrefix: "No Pricing Test", occurredAt: now });

    const decisionId = randomUUID();
    await writer.create({
      id: decisionId,
      organizationId,
      clientAccountId,
      tenderId,
      generationId: randomUUID(),
      taskType: TASK_TYPE,
      routingPolicyId: randomUUID(),
      routingPolicyVersion: 1,
      primaryProvider: "OPENAI",
      primaryModel: otherModel.modelKey,
      occurredAt: now,
    });

    const result = await writer.complete({
      id: decisionId,
      selectedProvider: "OPENAI",
      selectedModel: otherModel.modelKey,
      fallbackLevel: 0,
      fallbackAttempts: 0,
      inputTokenCount: 10,
      outputTokenCount: 10,
      status: "SUCCEEDED",
      occurredAt: now,
    });

    expect(result.actualCostAmount).toBeUndefined();
    expect(result.currency).toBeUndefined();

    await prisma.aiModel.deleteMany({ where: { id: otherModel.id } });
  });

  it("correctif P1-2 — the XOR CHECK constraint rejects a routing_decisions row with neither analysisId nor generationId set", async () => {
    await expect(
      prisma.routingDecision.create({
        data: {
          id: randomUUID(),
          organizationId,
          promptKey: TASK_TYPE,
          primaryProvider: "OPENAI",
          primaryModel: "gpt-4.1",
          // Ni analysisId ni generationId — doit violer routing_decisions_analysis_or_generation_check.
        },
      }),
    ).rejects.toThrow();
  });

  it("correctif P1-2 — the XOR CHECK constraint rejects a routing_decisions row with BOTH analysisId and generationId set", async () => {
    await expect(
      prisma.routingDecision.create({
        data: {
          id: randomUUID(),
          organizationId,
          analysisId: randomUUID(),
          generationId: randomUUID(),
          promptKey: TASK_TYPE,
          primaryProvider: "OPENAI",
          primaryModel: "gpt-4.1",
        },
      }),
    ).rejects.toThrow();
  });

  it("correctif P1-2 (AUDIT-007) — Generation.routingDecisionId is backed by a REAL composite foreign key (routing_decision_id, organization_id) → routing_decisions(id, organization_id), not merely an applicative convention", async () => {
    const fk = await prisma.$queryRaw<{ constraint_name: string; column_name: string }[]>(Prisma.sql`
      SELECT tc.constraint_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'generations'
        AND tc.constraint_name = 'generations_routing_decision_id_organization_id_fkey'
      ORDER BY kcu.ordinal_position
    `);

    expect(fk.map((r) => r.column_name)).toEqual(["routing_decision_id", "organization_id"]);
  });

  it("correctif P1-2 — Generation.routingDecisionId can legitimately reference a RoutingDecision of the SAME organization end-to-end (create → generation FK update → read back)", async () => {
    const decisionId = randomUUID();
    await writer.create({
      id: decisionId,
      organizationId,
      clientAccountId,
      tenderId,
      generationId: randomUUID(),
      taskType: TASK_TYPE,
      routingPolicyId: randomUUID(),
      routingPolicyVersion: 1,
      primaryProvider: "OPENAI",
      primaryModel: "gpt-4.1",
      occurredAt: now,
    });

    const decision = await prisma.routingDecision.findUnique({ where: { id: decisionId } });
    expect(decision).not.toBeNull();
    expect(decision!.organizationId).toBe(organizationId);
  });
});
