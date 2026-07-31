import { Inject, Injectable } from "@nestjs/common";
import { AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";
import { AiModelNotFoundError } from "../../domain/errors";
import { assertHasAiBenchmarkPermission } from "../policies/ai-benchmark-authorization.policy";
import { toPricingSnapshotSummary, type PricingSnapshotSummary } from "../dtos";
import { AI_MODEL_REPOSITORY, type AiModelRepository } from "../ports/ai-model.repository";
import { PRICING_SNAPSHOT_REPOSITORY, type PricingSnapshotRepository } from "../ports/pricing-snapshot.repository";

export type ListPricingSnapshotsQuery = Readonly<{ actorRole: string; modelId: string }>;

@Injectable()
export class ListPricingSnapshotsUseCase {
  constructor(
    @Inject(AI_MODEL_REPOSITORY) private readonly aiModelRepository: AiModelRepository,
    @Inject(PRICING_SNAPSHOT_REPOSITORY) private readonly pricingSnapshotRepository: PricingSnapshotRepository,
  ) {}

  async execute(query: ListPricingSnapshotsQuery): Promise<readonly PricingSnapshotSummary[]> {
    assertHasAiBenchmarkPermission(query.actorRole, AiBenchmarkPermission.ReadModels);

    const model = await this.aiModelRepository.findById({ id: query.modelId });
    if (!model) {
      throw new AiModelNotFoundError();
    }

    const snapshots = await this.pricingSnapshotRepository.listByModel({ aiModelId: query.modelId });
    return snapshots.map(toPricingSnapshotSummary);
  }
}
