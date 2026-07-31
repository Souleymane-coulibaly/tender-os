import type { AiModelPricingSnapshot as PricingSnapshotRecord } from "@prisma/client";
import { AiModelPricingSnapshot } from "../domain/pricing-snapshot.entity";

export function toDomain(record: PricingSnapshotRecord): AiModelPricingSnapshot {
  return AiModelPricingSnapshot.rehydrate({
    id: record.id,
    aiModelId: record.aiModelId,
    inputPricePerMillionTokens: record.inputPricePerMillionTokens.toString(),
    outputPricePerMillionTokens: record.outputPricePerMillionTokens.toString(),
    currency: record.currency,
    effectiveFrom: record.effectiveFrom,
    effectiveTo: record.effectiveTo ?? undefined,
    createdAt: record.createdAt,
  });
}

export function toPersistence(snapshot: AiModelPricingSnapshot) {
  return {
    id: snapshot.id,
    aiModelId: snapshot.aiModelId,
    inputPricePerMillionTokens: snapshot.inputPricePerMillionTokens,
    outputPricePerMillionTokens: snapshot.outputPricePerMillionTokens,
    currency: snapshot.currency,
    effectiveFrom: snapshot.effectiveFrom,
    effectiveTo: snapshot.effectiveTo ?? null,
    createdAt: snapshot.createdAt,
  };
}
