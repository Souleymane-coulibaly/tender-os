import type { Risk } from "../../domain/risk.entity";

export interface RiskRepository {
  findById(input: { organizationId: string; tenderId: string; riskId: string }): Promise<Risk | null>;
  listByTender(input: { organizationId: string; tenderId: string }): Promise<Risk[]>;
  /** Chargement groupé pour plusieurs tenders en une requête — évite le N+1 lors du
   *  calcul du score de préparation / des compteurs pour le Kanban, la Liste et les stats. */
  listByTenderIds(input: { organizationId: string; tenderIds: readonly string[] }): Promise<Risk[]>;
  save(risk: Risk): Promise<void>;
}

export const RISK_REPOSITORY = Symbol("RISK_REPOSITORY");
