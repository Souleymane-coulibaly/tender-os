import { Inject, Injectable } from "@nestjs/common";
import { AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";
import { AiModelNotFoundError } from "../../domain/errors";
import { assertHasAiBenchmarkPermission } from "../policies/ai-benchmark-authorization.policy";
import { toAiModelSummary, type AiModelSummary } from "../dtos";
import { AI_MODEL_REPOSITORY, type AiModelRepository } from "../ports/ai-model.repository";

export type GetAiModelQuery = Readonly<{ actorRole: string; modelId: string }>;

@Injectable()
export class GetAiModelUseCase {
  constructor(@Inject(AI_MODEL_REPOSITORY) private readonly aiModelRepository: AiModelRepository) {}

  async execute(query: GetAiModelQuery): Promise<AiModelSummary> {
    assertHasAiBenchmarkPermission(query.actorRole, AiBenchmarkPermission.ReadModels);

    const model = await this.aiModelRepository.findById({ id: query.modelId });
    if (!model) {
      throw new AiModelNotFoundError();
    }

    return toAiModelSummary(model);
  }
}
