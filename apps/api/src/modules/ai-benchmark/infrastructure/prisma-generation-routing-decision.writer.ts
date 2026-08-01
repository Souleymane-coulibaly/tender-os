import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type {
  CompleteRoutingDecisionInput,
  CompleteRoutingDecisionResult,
  CreateRoutingDecisionInput,
  RoutingDecisionWriter,
} from "../../generation/application/ports/routing-decision-writer";
import { AI_MODEL_REPOSITORY, type AiModelRepository } from "../application/ports/ai-model.repository";
import { PRICING_SNAPSHOT_REPOSITORY, type PricingSnapshotRepository } from "../application/ports/pricing-snapshot.repository";

/**
 * Implémentation du port `RoutingDecisionWriter` DÉFINI PAR `generation` (correctif Sprint 6, audit
 * Codex P1-2/P2-3) — écrit dans `routing_decisions` (table partagée avec Analysis : `generationId`
 * renseigné, `analysisId` laissé `null`, voir migration `20260801103000_generation_real_routing_
 * decision` et sa contrainte CHECK XOR). Vit ici, aux côtés de `PrismaRoutingDecisionWriter`
 * (Analysis) et `PrismaRoutingPolicyResolver` — même bridge ai-benchmark → consommateur.
 *
 * Correctif P2-3 ("coût Generation calculé depuis une configuration statique") : `complete()`
 * calcule le coût RÉEL à partir du tarif COURANT (Sprint 5.2 `PricingSnapshotRepository`, interne à
 * ai-benchmark — jamais exporté ni ponté davantage que par cette classe) du modèle EFFECTIVEMENT
 * utilisé, jamais d'une configuration statique possédée par Generation. Best-effort : l'absence de
 * modèle connu ou de tarif courant renvoie `undefined`, jamais une exception qui ferait échouer une
 * génération déjà acquise avec succès.
 */
@Injectable()
export class PrismaGenerationRoutingDecisionWriter implements RoutingDecisionWriter {
  private readonly logger = new Logger(PrismaGenerationRoutingDecisionWriter.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_MODEL_REPOSITORY) private readonly aiModelRepository: AiModelRepository,
    @Inject(PRICING_SNAPSHOT_REPOSITORY) private readonly pricingSnapshotRepository: PricingSnapshotRepository,
  ) {}

  async create(input: CreateRoutingDecisionInput): Promise<void> {
    await this.prisma.routingDecision.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        clientAccountId: input.clientAccountId,
        tenderId: input.tenderId,
        generationId: input.generationId,
        promptKey: input.taskType,
        routingPolicyId: input.routingPolicyId,
        routingPolicyVersion: input.routingPolicyVersion,
        primaryProvider: input.primaryProvider,
        primaryModel: input.primaryModel,
        status: "IN_PROGRESS",
        createdAt: input.occurredAt,
      },
    });
  }

  async complete(input: CompleteRoutingDecisionInput): Promise<CompleteRoutingDecisionResult> {
    const cost = await this.computeActualCost(input);

    await this.prisma.routingDecision.update({
      where: { id: input.id },
      data: {
        selectedProvider: input.selectedProvider ?? null,
        selectedModel: input.selectedModel ?? null,
        fallbackLevel: input.fallbackLevel,
        fallbackAttempts: input.fallbackAttempts,
        inputTokenCount: input.inputTokenCount ?? null,
        outputTokenCount: input.outputTokenCount ?? null,
        actualCostAmount: cost?.actualCostAmount ?? null,
        currency: cost?.currency ?? null,
        latencyMs: input.latencyMs ?? null,
        status: input.status,
        failureReason: input.failureReason ?? null,
        completedAt: input.occurredAt,
      },
    });

    return cost ?? {};
  }

  /** Best-effort — voir docstring de classe. Ne calcule un coût que si le modèle utilisé ET un tarif
   *  courant sont tous deux résolvables ; jamais un coût partiel ou approximatif silencieux. */
  private async computeActualCost(input: CompleteRoutingDecisionInput): Promise<CompleteRoutingDecisionResult | undefined> {
    if (input.status !== "SUCCEEDED" || !input.selectedProvider || !input.selectedModel) return undefined;
    try {
      const model = await this.aiModelRepository.findByProviderAndModelKey({
        provider: input.selectedProvider,
        modelKey: input.selectedModel,
      });
      if (!model) return undefined;

      const snapshot = await this.pricingSnapshotRepository.findCurrent({ aiModelId: model.id });
      if (!snapshot) return undefined;

      return {
        actualCostAmount: snapshot.estimateCost({ inputTokens: input.inputTokenCount ?? 0, outputTokens: input.outputTokenCount ?? 0 }),
        currency: snapshot.currency,
      };
    } catch (error) {
      this.logger.warn(
        `Could not compute actual cost for routing decision ${input.id} (generation result unaffected): ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }
}
