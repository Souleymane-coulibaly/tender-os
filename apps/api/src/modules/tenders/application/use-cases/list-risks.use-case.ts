import { Inject, Injectable } from "@nestjs/common";
import { TenderPermission } from "../../domain/tender-permission";
import { toRiskSummary, type RiskSummary } from "../dtos";
import { RISK_REPOSITORY, type RiskRepository } from "../ports/risk.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";

export type ListRisksQuery = Readonly<{ organizationId: string; tenderId: string; actorRole: string }>;

@Injectable()
export class ListRisksUseCase {
  constructor(@Inject(RISK_REPOSITORY) private readonly riskRepository: RiskRepository) {}

  async execute(query: ListRisksQuery): Promise<RiskSummary[]> {
    assertHasTenderPermission(query.actorRole, TenderPermission.Read);

    const risks = await this.riskRepository.listByTender({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
    });

    return risks.map(toRiskSummary);
  }
}
