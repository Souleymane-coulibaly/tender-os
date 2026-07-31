import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";
import { AiModelNotFoundError } from "../../domain/errors";
import { assertHasAiBenchmarkPermission } from "../policies/ai-benchmark-authorization.policy";
import { toAiModelSummary, type AiModelSummary } from "../dtos";
import { AI_MODEL_REPOSITORY, type AiModelRepository } from "../ports/ai-model.repository";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";

export type DisableAiModelCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  modelId: string;
  requestId?: string | undefined;
}>;

@Injectable()
export class DisableAiModelUseCase {
  constructor(
    @Inject(AI_MODEL_REPOSITORY) private readonly aiModelRepository: AiModelRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: DisableAiModelCommand): Promise<AiModelSummary> {
    assertHasAiBenchmarkPermission(command.actorRole, AiBenchmarkPermission.ManageModels);

    const model = await this.aiModelRepository.findById({ id: command.modelId });
    if (!model) {
      throw new AiModelNotFoundError();
    }

    model.disable(this.clock.now());
    await this.aiModelRepository.save(model);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "ai_model.disabled",
      resourceType: "ai_model",
      resourceId: model.id,
      requestId: command.requestId,
    });

    return toAiModelSummary(model);
  }
}
