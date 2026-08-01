import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { PricingEstimateNotFoundError, PricingEstimateVersionNotFoundError, PricingPermissionMissingError } from "../../domain/errors";
import { PricingPermission, roleHasPricingPermission } from "../../domain/pricing-permission";
import { toPricingEstimateSummary, type PricingEstimateSummary } from "../dtos";
import { PRICING_ESTIMATE_REPOSITORY, type PricingEstimateRepository } from "../ports/pricing-estimate.repository";

export type GetPricingEstimateQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  estimateId: string;
  /** Consulter une version spécifique de l'historique — sinon la version courante (mission
   *  §"Historique" / "sélection d'une version de référence"). */
  version?: number | undefined;
}>;

/** Mission Sprint 7 — même motif d'accès que `GetTenderUseCase`/`GetGenerationUseCase` : un scope
 *  client passe par `AssertClientAccessUseCase` (`ReadPricing`), un scope purement organisation
 *  (résumé global) exige `PricingPermission.ReadOrganizationSummary` (OWNER/ADMIN uniquement). */
@Injectable()
export class GetPricingEstimateUseCase {
  constructor(
    @Inject(PRICING_ESTIMATE_REPOSITORY) private readonly pricingEstimateRepository: PricingEstimateRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: GetPricingEstimateQuery): Promise<PricingEstimateSummary> {
    const found = await this.pricingEstimateRepository.findById({ organizationId: query.organizationId, estimateId: query.estimateId });
    if (!found) {
      throw new PricingEstimateNotFoundError();
    }
    const { estimate } = found;

    if (estimate.clientAccountId) {
      await this.assertClientAccessUseCase.execute({
        organizationId: query.organizationId,
        clientAccountId: estimate.clientAccountId,
        actorId: query.actorId,
        actorRole: query.actorRole,
        permission: ClientPermission.ReadPricing,
      });
    } else if (!roleHasPricingPermission(query.actorRole, PricingPermission.ReadOrganizationSummary)) {
      throw new PricingPermissionMissingError({ permission: PricingPermission.ReadOrganizationSummary });
    }

    let version = found.version;
    if (query.version !== undefined && query.version !== version.version) {
      const requested = await this.pricingEstimateRepository.findVersion({
        organizationId: query.organizationId,
        estimateId: query.estimateId,
        version: query.version,
      });
      if (!requested) {
        throw new PricingEstimateVersionNotFoundError();
      }
      version = requested;
    }

    return toPricingEstimateSummary(estimate, version);
  }
}
