import { Inject, Injectable, Optional } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { ESTIMATE_DISCLAIMER_VERSION } from "../../domain/disclaimer";
import { PricingAssumptions, type PricingAssumptionsProps } from "../../domain/pricing-assumptions";
import { PricingEstimate } from "../../domain/pricing-estimate.aggregate";
import { PricingEstimateVersion } from "../../domain/pricing-estimate-version.entity";
import { PricingType } from "../../domain/pricing-type";
import { toPricingEstimateSummary, type PricingEstimateSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { PRICING_ESTIMATE_REPOSITORY, type PricingEstimateRepository } from "../ports/pricing-estimate.repository";
import { PRICING_SNAPSHOT_READER, type PricingSnapshotReader } from "../ports/pricing-snapshot-reader";
import { ROUTING_MODEL_READER, type RoutingModelReader } from "../ports/routing-model-reader";
import { calculateEstimateBreakdown } from "../services/estimate-calculation.service";

export type CreatePricingEstimateCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId: string;
  taskType?: string | undefined;
  assumptions: PricingAssumptionsProps;
}>;

/**
 * Mission Sprint 7 §"Estimations" — crée l'en-tête ET sa première version ATOMIQUEMENT (jamais
 * l'un sans l'autre). Le modèle routé (s'il existe) et son tarif COURANT alimentent la ligne de
 * coût IA du breakdown ; le reste (temps de préparation, frais) vient directement des hypothèses
 * saisies. Jamais un montant final envoyé par le frontend — toujours recalculé ici.
 */
@Injectable()
export class CreatePricingEstimateUseCase {
  constructor(
    @Inject(PRICING_ESTIMATE_REPOSITORY) private readonly pricingEstimateRepository: PricingEstimateRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Optional() @Inject(ROUTING_MODEL_READER) private readonly routingModelReader?: RoutingModelReader,
    @Optional() @Inject(PRICING_SNAPSHOT_READER) private readonly pricingSnapshotReader?: PricingSnapshotReader,
  ) {}

  async execute(command: CreatePricingEstimateCommand): Promise<PricingEstimateSummary> {
    const tender = await this.getTenderUseCase.execute({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
    });

    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManagePricing,
    });

    const assumptions = PricingAssumptions.create(command.assumptions);

    let modelPricing;
    if (command.taskType && this.routingModelReader && this.pricingSnapshotReader) {
      const routedModel = await this.routingModelReader.resolveModel({
        organizationId: command.organizationId,
        taskType: command.taskType,
        userId: command.actorId,
      });
      modelPricing = routedModel?.aiModelId
        ? ((await this.pricingSnapshotReader.findCurrentForModel({ aiModelId: routedModel.aiModelId })) ?? undefined)
        : undefined;
    }

    const calculation = calculateEstimateBreakdown({ assumptions, modelPricing });

    const occurredAt = this.clock.now();
    const estimateId = this.idGenerator.generate();
    const estimate = PricingEstimate.create({
      id: estimateId,
      organizationId: command.organizationId,
      clientAccountId: tender.clientAccountId,
      tenderId: command.tenderId,
      type: PricingType.TenderEstimate,
      createdBy: command.actorId,
      occurredAt,
    });

    const version = PricingEstimateVersion.create({
      id: this.idGenerator.generate(),
      estimateId,
      organizationId: command.organizationId,
      version: 1,
      amount: calculation.amount,
      breakdown: calculation.breakdown,
      assumptions,
      status: calculation.status,
      disclaimerVersion: ESTIMATE_DISCLAIMER_VERSION,
      source: "MANUAL",
      createdBy: command.actorId,
      createdAt: occurredAt,
    });

    estimate.attachVersion({ versionId: version.id, versionNumber: 1, status: calculation.status });

    await this.pricingEstimateRepository.createWithFirstVersion({ estimate, version });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "pricing.estimate_created",
      resourceType: "pricing_estimate",
      resourceId: estimateId,
      metadata: { tenderId: command.tenderId, amount: calculation.amount.toFixed(), currency: calculation.amount.currency },
    });

    return toPricingEstimateSummary(estimate, version);
  }
}
