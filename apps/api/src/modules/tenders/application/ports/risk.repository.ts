import type { Risk } from "../../domain/risk.entity";

export interface RiskRepository {
  findById(input: { organizationId: string; tenderId: string; riskId: string }): Promise<Risk | null>;
  listByTender(input: { organizationId: string; tenderId: string }): Promise<Risk[]>;
  save(risk: Risk): Promise<void>;
}

export const RISK_REPOSITORY = Symbol("RISK_REPOSITORY");
