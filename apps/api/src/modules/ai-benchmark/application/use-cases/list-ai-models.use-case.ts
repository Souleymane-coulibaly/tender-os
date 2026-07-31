import { Inject, Injectable } from "@nestjs/common";
import { AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";
import { assertHasAiBenchmarkPermission } from "../policies/ai-benchmark-authorization.policy";
import { toAiModelSummary, type AiModelSummary } from "../dtos";
import { AI_MODEL_REPOSITORY, type AiModelRepository, type ListAiModelsFilter } from "../ports/ai-model.repository";

export type ListAiModelsQuery = Readonly<{
  actorRole: string;
  enabledForBenchmark?: boolean | undefined;
  enabledForProduction?: boolean | undefined;
}>;

@Injectable()
export class ListAiModelsUseCase {
  constructor(@Inject(AI_MODEL_REPOSITORY) private readonly aiModelRepository: AiModelRepository) {}

  async execute(query: ListAiModelsQuery): Promise<readonly AiModelSummary[]> {
    assertHasAiBenchmarkPermission(query.actorRole, AiBenchmarkPermission.ReadModels);

    const filter: ListAiModelsFilter = {
      enabledForBenchmark: query.enabledForBenchmark,
      enabledForProduction: query.enabledForProduction,
    };
    const models = await this.aiModelRepository.list(filter);
    return models.map(toAiModelSummary);
  }
}
