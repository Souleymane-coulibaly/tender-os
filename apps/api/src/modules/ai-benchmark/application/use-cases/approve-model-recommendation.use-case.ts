import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";
import { ModelRecommendationNotFoundError } from "../../domain/errors";
import { assertHasAiBenchmarkPermission } from "../policies/ai-benchmark-authorization.policy";
import { toModelRecommendationSummary, type ModelRecommendationSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { MODEL_RECOMMENDATION_REPOSITORY, type ModelRecommendationRepository } from "../ports/model-recommendation.repository";

export type ApproveModelRecommendationCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  recommendationId: string;
  requestId?: string | undefined;
}>;

/** Approbation explicite (Sprint 5.2 §"Prévoir une action explicite d'approbation par un rôle
 *  autorisé") — réservée à OWNER/ORGANIZATION_ADMIN (`ApproveRecommendation`), jamais automatique. */
@Injectable()
export class ApproveModelRecommendationUseCase {
  constructor(
    @Inject(MODEL_RECOMMENDATION_REPOSITORY) private readonly modelRecommendationRepository: ModelRecommendationRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ApproveModelRecommendationCommand): Promise<ModelRecommendationSummary> {
    assertHasAiBenchmarkPermission(command.actorRole, AiBenchmarkPermission.ApproveRecommendation);

    const recommendation = await this.modelRecommendationRepository.findById({
      organizationId: command.organizationId,
      recommendationId: command.recommendationId,
    });
    if (!recommendation) {
      throw new ModelRecommendationNotFoundError();
    }

    recommendation.approve(command.actorId, this.clock.now());
    await this.modelRecommendationRepository.save(recommendation);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "model_recommendation.approved",
      resourceType: "model_recommendation",
      resourceId: recommendation.id,
      requestId: command.requestId,
    });

    return toModelRecommendationSummary(recommendation);
  }
}
