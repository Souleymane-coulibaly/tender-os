import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { GetClientAccountUseCase } from "../../../client-portfolio";
import { InvalidPricingScopeError, PricingPermissionMissingError } from "../../domain/errors";
import { PricingPermission, roleHasPricingPermission } from "../../domain/pricing-permission";
import { toPricingEstimateSummary, type PricingEstimateSummary } from "../dtos";
import { PRICING_ESTIMATE_REPOSITORY, type PricingEstimateRepository } from "../ports/pricing-estimate.repository";

export type ListPricingEstimatesQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId?: string | undefined;
  clientAccountId?: string | undefined;
  includeArchived?: boolean | undefined;
  limit: number;
  offset: number;
}>;

export type ListPricingEstimatesResult = Readonly<{ items: readonly PricingEstimateSummary[]; total: number }>;

/**
 * Mission Sprint 7 §"Historique" — liste paginée, TOUJOURS scopée (jamais un `tenderId`/
 * `clientAccountId` ni fourni ni résolu librement : chaque id est vérifié réel et appartenant à
 * l'organisation via `GetTenderUseCase`/`GetClientAccountUseCase`, jamais une simple confiance dans
 * l'UUID fourni). Sans aucun scope, réservé à `PricingPermission.ReadOrganizationSummary`.
 */
@Injectable()
export class ListPricingEstimatesUseCase {
  constructor(
    @Inject(PRICING_ESTIMATE_REPOSITORY) private readonly pricingEstimateRepository: PricingEstimateRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly getClientAccountUseCase: GetClientAccountUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: ListPricingEstimatesQuery): Promise<ListPricingEstimatesResult> {
    let clientAccountId = query.clientAccountId;

    if (query.tenderId) {
      const tender = await this.getTenderUseCase.execute({
        organizationId: query.organizationId,
        tenderId: query.tenderId,
        actorId: query.actorId,
        actorRole: query.actorRole,
      });
      clientAccountId = tender.clientAccountId;
    }

    if (clientAccountId) {
      await this.getClientAccountUseCase.execute({
        organizationId: query.organizationId,
        clientAccountId,
        actorId: query.actorId,
        actorRole: query.actorRole,
      });
      await this.assertClientAccessUseCase.execute({
        organizationId: query.organizationId,
        clientAccountId,
        actorId: query.actorId,
        actorRole: query.actorRole,
        permission: ClientPermission.ReadPricing,
      });
    } else if (!query.tenderId) {
      if (!roleHasPricingPermission(query.actorRole, PricingPermission.ReadOrganizationSummary)) {
        throw new PricingPermissionMissingError({ permission: PricingPermission.ReadOrganizationSummary });
      }
    } else {
      throw new InvalidPricingScopeError("could not resolve a client scope for the given tender");
    }

    const result = await this.pricingEstimateRepository.list({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      clientAccountId,
      includeArchived: query.includeArchived,
      limit: query.limit,
      offset: query.offset,
    });

    return {
      items: result.items.map(({ estimate, version }) => toPricingEstimateSummary(estimate, version)),
      total: result.total,
    };
  }
}
