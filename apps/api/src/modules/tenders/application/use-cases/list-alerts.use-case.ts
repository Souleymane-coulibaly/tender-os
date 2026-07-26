import { Inject, Injectable } from "@nestjs/common";
import { TenderPermission } from "../../domain/tender-permission";
import { toAlertSummary, type AlertSummary } from "../dtos";
import { ALERT_REPOSITORY, type AlertRepository } from "../ports/alert.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";

export type ListAlertsQuery = Readonly<{ organizationId: string; tenderId: string; actorRole: string }>;

@Injectable()
export class ListAlertsUseCase {
  constructor(@Inject(ALERT_REPOSITORY) private readonly alertRepository: AlertRepository) {}

  async execute(query: ListAlertsQuery): Promise<AlertSummary[]> {
    assertHasTenderPermission(query.actorRole, TenderPermission.Read);

    const alerts = await this.alertRepository.listByTender({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
    });

    return alerts.map(toAlertSummary);
  }
}
