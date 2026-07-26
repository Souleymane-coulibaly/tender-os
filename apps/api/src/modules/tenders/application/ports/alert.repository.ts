import type { Alert } from "../../domain/alert.entity";

export interface AlertRepository {
  findById(input: { organizationId: string; tenderId: string; alertId: string }): Promise<Alert | null>;
  listByTender(input: { organizationId: string; tenderId: string }): Promise<Alert[]>;
  listByTenderIds(input: { organizationId: string; tenderIds: readonly string[] }): Promise<Alert[]>;
  save(alert: Alert): Promise<void>;
}

export const ALERT_REPOSITORY = Symbol("ALERT_REPOSITORY");
