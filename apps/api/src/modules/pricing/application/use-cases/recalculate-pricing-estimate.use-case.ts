import { Inject, Injectable, Optional } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { ESTIMATE_DISCLAIMER_VERSION } from "../../domain/disclaimer";
import { PricingEstimateNotFoundError, PricingEstimateArchivedError, InvalidPricingScopeError } from "../../domain/errors";
import { PricingAssumptions, type PricingAssumptionsProps } from "../../domain/pricing-assumptions";
import { PricingEstimateVersion } from "../../domain/pricing-estimate-version.entity";
import { toPricingEstimateSummary, type PricingEstimateSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { PRICING_ESTIMATE_REPOSITORY, type PricingEstimateRepository } from "../ports/pricing-estimate.repository";
import { PRICING_SNAPSHOT_READER, type PricingSnapshotReader } from "../ports/pricing-snapshot-reader";
import { ROUTING_MODEL_READER, type RoutingModelReader } from "../ports/routing-model-reader";
import { calculateEstimateBreakdown } from "../services/estimate-calculation.service";

export type RecalculatePricingEstimateCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  estimateId: string;
  taskType?: string | undefined;
  assumptions: PricingAssumptionsProps;
  reason: string;
}>;

/**
 * Mission Sprint 7 §"Versionnement des estimations" — crée la version N+1, marque la version N
 * `SUPERSEDED`, mais NE LA MODIFIE JAMAIS (son montant/breakdown/assumptions restent figés pour
 * toujours — voir `PricingEstimateVersion.supersede()`, qui ne touche que le statut). Refuse tout
 * recalcul sur une estimation déjà archivée.
 */
@Injectable()
export class RecalculatePricingEstimateUseCase {
  constructor(
    @Inject(PRICING_ESTIMATE_REPOSITORY) private readonly pricingEstimateRepository: PricingEstimateRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Optional() @Inject(ROUTING_MODEL_READER) private readonly routingModelReader?: RoutingModelReader,
    @Optional() @Inject(PRICING_SNAPSHOT_READER) private readonly pricingSnapshotReader?: PricingSnapshotReader,
  ) {}

  async execute(command: RecalculatePricingEstimateCommand): Promise<PricingEstimateSummary> {
    const found = await this.pricingEstimateRepository.findById({
      organizationId: command.organizationId,
      estimateId: command.estimateId,
    });
    if (!found) {
      throw new PricingEstimateNotFoundError();
    }
    const { estimate, version: previousVersion } = found;

    if (!estimate.clientAccountId) {
      throw new InvalidPricingScopeError("only client/tender-scoped estimates can be recalculated");
    }

    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: estimate.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManagePricing,
    });

    if (!command.reason.trim()) {
      throw new InvalidPricingScopeError("a recalculation reason is required");
    }

    const assumptions = PricingAssumptions.create(command.assumptions);

    let modelPricing;
    if (command.taskType && this.routingModelReader && this.pricingSnapshotReader) {
      const routedModel = await this.routingModelReader.resolveActiveModel({
        organizationId: command.organizationId,
        taskType: command.taskType,
      });
      modelPricing = routedModel
        ? ((await this.pricingSnapshotReader.findCurrentForModel({ aiModelId: routedModel.aiModelId })) ?? undefined)
        : undefined;
    }

    const calculation = calculateEstimateBreakdown({ assumptions, modelPricing });
    const occurredAt = this.clock.now();
    const nextVersionNumber = previousVersion.version + 1;

    const newVersion = PricingEstimateVersion.create({
      id: this.idGenerator.generate(),
      estimateId: estimate.id,
      organizationId: command.organizationId,
      version: nextVersionNumber,
      amount: calculation.amount,
      breakdown: calculation.breakdown,
      assumptions,
      status: calculation.status,
      disclaimerVersion: ESTIMATE_DISCLAIMER_VERSION,
      source: "MANUAL",
      createdBy: command.actorId,
      createdAt: occurredAt,
      recalculationReason: command.reason,
    });

    previousVersion.supersede(occurredAt);
    try {
      estimate.attachVersion({ versionId: newVersion.id, versionNumber: nextVersionNumber, status: calculation.status });
    } catch {
      throw new PricingEstimateArchivedError();
    }

    await this.pricingEstimateRepository.addVersion({ estimate, previousVersion, newVersion });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "pricing.estimate_recalculated",
      resourceType: "pricing_estimate",
      resourceId: estimate.id,
      metadata: { version: nextVersionNumber, amount: calculation.amount.toFixed(), currency: calculation.amount.currency },
    });

    return toPricingEstimateSummary(estimate, newVersion);
  }
}
