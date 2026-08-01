import { Inject, Injectable } from "@nestjs/common";
import type { CurrentModelPricing, PricingSnapshotReader } from "../../pricing/application/ports/pricing-snapshot-reader";
import { AI_MODEL_REPOSITORY, type AiModelRepository } from "../application/ports/ai-model.repository";
import { PRICING_SNAPSHOT_REPOSITORY, type PricingSnapshotRepository } from "../application/ports/pricing-snapshot.repository";

/**
 * Implémentation du port `PricingSnapshotReader` DÉFINI PAR `pricing` (Sprint 7) — même bridge que
 * `PrismaRoutingPolicyResolver`/`PrismaGenerationRoutingDecisionWriter` : vit ici, aux côtés du
 * reste du pont ai-benchmark → consommateur, jamais l'inverse.
 */
@Injectable()
export class PrismaPricingSnapshotReader implements PricingSnapshotReader {
  constructor(
    @Inject(PRICING_SNAPSHOT_REPOSITORY) private readonly pricingSnapshotRepository: PricingSnapshotRepository,
    @Inject(AI_MODEL_REPOSITORY) private readonly aiModelRepository: AiModelRepository,
  ) {}

  async findCurrentForModel(input: { aiModelId: string }): Promise<CurrentModelPricing | null> {
    const [snapshot, model] = await Promise.all([
      this.pricingSnapshotRepository.findCurrent({ aiModelId: input.aiModelId }),
      this.aiModelRepository.findById({ id: input.aiModelId }),
    ]);
    if (!snapshot || !model) return null;

    return {
      aiModelId: snapshot.aiModelId,
      provider: model.provider,
      modelKey: model.modelKey,
      inputPricePerMillionTokens: snapshot.inputPricePerMillionTokens,
      outputPricePerMillionTokens: snapshot.outputPricePerMillionTokens,
      currency: snapshot.currency,
      effectiveFrom: snapshot.effectiveFrom,
    };
  }
}
