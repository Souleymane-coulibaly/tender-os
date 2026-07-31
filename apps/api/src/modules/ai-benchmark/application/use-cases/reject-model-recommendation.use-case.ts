import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";
import { ModelRecommendationNotFoundError } from "../../domain/errors";
import { assertHasAiBenchmarkPermission } from "../policies/ai-benchmark-authorization.policy";
import { toModelRecommendationSummary, type ModelRecommendationSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { MODEL_RECOMMENDATION_REPOSITORY, type ModelRecommendationRepository } from "../ports/model-recommendation.repository";

export type RejectModelRecommendationCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  recommendationId: string;
  requestId?: string | undefined;
}>;

@Injectable()
export class RejectModelRecommendationUseCase {
  constructor(
    @Inject(MODEL_RECOMMENDATION_REPOSITORY) private readonly modelRecommendationRepository: ModelRecommendationRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: RejectModelRecommendationCommand): Promise<ModelRecommendationSummary> {
    assertHasAiBenchmarkPermission(command.actorRole, AiBenchmarkPermission.ApproveRecommendation);

    const recommendation = await this.modelRecommendationRepository.findById({
      organizationId: command.organizationId,
      recommendationId: command.recommendationId,
    });
    if (!recommendation) {
      throw new ModelRecommendationNotFoundError();
    }

    recommendation.reject(command.actorId, this.clock.now());
    await this.modelRecommendationRepository.save(recommendation);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "model_recommendation.rejected",
      resourceType: "model_recommendation",
      resourceId: recommendation.id,
      requestId: command.requestId,
    });

    return toModelRecommendationSummary(recommendation);
  }
}
