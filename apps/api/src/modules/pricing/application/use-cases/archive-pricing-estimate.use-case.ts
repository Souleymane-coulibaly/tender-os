import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { InvalidPricingScopeError, PricingEstimateNotFoundError } from "../../domain/errors";
import { toPricingEstimateSummary, type PricingEstimateSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { PRICING_ESTIMATE_REPOSITORY, type PricingEstimateRepository } from "../ports/pricing-estimate.repository";

export type ArchivePricingEstimateCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  estimateId: string;
}>;

/** Mission Sprint 7 §"Archivage" — ne touche jamais au montant/breakdown d'aucune version, marque
 *  uniquement l'en-tête `ARCHIVED` (voir `PricingEstimate.archive()`). */
@Injectable()
export class ArchivePricingEstimateUseCase {
  constructor(
    @Inject(PRICING_ESTIMATE_REPOSITORY) private readonly pricingEstimateRepository: PricingEstimateRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ArchivePricingEstimateCommand): Promise<PricingEstimateSummary> {
    const found = await this.pricingEstimateRepository.findById({
      organizationId: command.organizationId,
      estimateId: command.estimateId,
    });
    if (!found) {
      throw new PricingEstimateNotFoundError();
    }
    const { estimate, version } = found;

    if (!estimate.clientAccountId) {
      throw new InvalidPricingScopeError("only client/tender-scoped estimates can be archived");
    }

    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: estimate.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManagePricing,
    });

    estimate.archive(this.clock.now());
    await this.pricingEstimateRepository.save(estimate);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "pricing.estimate_archived",
      resourceType: "pricing_estimate",
      resourceId: estimate.id,
    });

    return toPricingEstimateSummary(estimate, version);
  }
}
