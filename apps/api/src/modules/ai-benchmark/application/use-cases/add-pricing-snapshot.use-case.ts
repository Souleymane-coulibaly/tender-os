import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";
import { AiModelPricingSnapshot } from "../../domain/pricing-snapshot.entity";
import { AiModelNotFoundError } from "../../domain/errors";
import { assertHasAiBenchmarkPermission } from "../policies/ai-benchmark-authorization.policy";
import { toPricingSnapshotSummary, type PricingSnapshotSummary } from "../dtos";
import { AI_MODEL_REPOSITORY, type AiModelRepository } from "../ports/ai-model.repository";
import { PRICING_SNAPSHOT_REPOSITORY, type PricingSnapshotRepository } from "../ports/pricing-snapshot.repository";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";

export type AddPricingSnapshotCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  modelId: string;
  inputPricePerMillionTokens: string;
  outputPricePerMillionTokens: string;
  currency: string;
  requestId?: string | undefined;
}>;

/** Nouveau tarif pour un modèle (Sprint 5.2 §"une mise à jour de tarif ne doit pas modifier
 *  rétroactivement les coûts historiques") — clôt l'ancien snapshot courant (s'il existe) et
 *  insère le nouveau de façon atomique (`PricingSnapshotRepository.addSnapshot`), jamais une
 *  réécriture des montants historiques déjà persistés sur un `BenchmarkCaseResult`/`AnalysisJob`. */
@Injectable()
export class AddPricingSnapshotUseCase {
  constructor(
    @Inject(AI_MODEL_REPOSITORY) private readonly aiModelRepository: AiModelRepository,
    @Inject(PRICING_SNAPSHOT_REPOSITORY) private readonly pricingSnapshotRepository: PricingSnapshotRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: AddPricingSnapshotCommand): Promise<PricingSnapshotSummary> {
    assertHasAiBenchmarkPermission(command.actorRole, AiBenchmarkPermission.ManageModels);

    const model = await this.aiModelRepository.findById({ id: command.modelId });
    if (!model) {
      throw new AiModelNotFoundError();
    }

    const snapshot = AiModelPricingSnapshot.create({
      id: this.idGenerator.generate(),
      aiModelId: command.modelId,
      inputPricePerMillionTokens: command.inputPricePerMillionTokens,
      outputPricePerMillionTokens: command.outputPricePerMillionTokens,
      currency: command.currency,
      occurredAt: this.clock.now(),
    });

    await this.pricingSnapshotRepository.addSnapshot(snapshot);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "ai_model_pricing_snapshot.added",
      resourceType: "ai_model_pricing_snapshot",
      resourceId: snapshot.id,
      requestId: command.requestId,
      metadata: { aiModelId: command.modelId, currency: command.currency },
    });

    return toPricingSnapshotSummary(snapshot);
  }
}
