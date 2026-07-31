import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { AiModel } from "../../domain/ai-model.aggregate";
import type { AiModelCapabilities } from "../../domain/ai-model-capability";
import { AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";
import { DuplicateAiModelError } from "../../domain/errors";
import { assertHasAiBenchmarkPermission } from "../policies/ai-benchmark-authorization.policy";
import { toAiModelSummary, type AiModelSummary } from "../dtos";
import { AI_MODEL_REPOSITORY, type AiModelRepository } from "../ports/ai-model.repository";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";

export type CreateAiModelCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  provider: string;
  modelKey: string;
  displayName: string;
  capabilities?: AiModelCapabilities | undefined;
  maxContextTokens?: number | undefined;
  enabledForBenchmark?: boolean | undefined;
  enabledForProduction?: boolean | undefined;
  requestId?: string | undefined;
}>;

/** Enregistrement d'un modèle dans le registre (Sprint 5.2 §"Registre des modèles") — global,
 *  jamais scopé à une organisation, mais réservé à OWNER/ORGANIZATION_ADMIN de l'organisation
 *  acteur (mission §"Ne laisse pas un utilisateur choisir librement n'importe quel modèle"). Le
 *  couple (provider, modelKey) doit appartenir à `ALLOWED_MODEL_CATALOG` (vérifié par
 *  `AiModel.create`) ET ne pas être déjà enregistré. */
@Injectable()
export class CreateAiModelUseCase {
  constructor(
    @Inject(AI_MODEL_REPOSITORY) private readonly aiModelRepository: AiModelRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateAiModelCommand): Promise<AiModelSummary> {
    assertHasAiBenchmarkPermission(command.actorRole, AiBenchmarkPermission.ManageModels);

    const existing = await this.aiModelRepository.findByProviderAndModelKey({
      provider: command.provider,
      modelKey: command.modelKey,
    });
    if (existing) {
      throw new DuplicateAiModelError();
    }

    const model = AiModel.create({
      id: this.idGenerator.generate(),
      provider: command.provider,
      modelKey: command.modelKey,
      displayName: command.displayName,
      capabilities: command.capabilities,
      maxContextTokens: command.maxContextTokens,
      enabledForBenchmark: command.enabledForBenchmark,
      enabledForProduction: command.enabledForProduction,
      occurredAt: this.clock.now(),
    });

    await this.aiModelRepository.create(model);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "ai_model.created",
      resourceType: "ai_model",
      resourceId: model.id,
      requestId: command.requestId,
      metadata: { provider: model.provider, modelKey: model.modelKey },
    });

    return toAiModelSummary(model);
  }
}
