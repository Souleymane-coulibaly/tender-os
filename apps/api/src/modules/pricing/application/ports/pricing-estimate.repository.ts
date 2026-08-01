import type { PricingEstimate } from "../../domain/pricing-estimate.aggregate";
import type { PricingEstimateVersion } from "../../domain/pricing-estimate-version.entity";
import type { PricingType } from "../../domain/pricing-type";

export type PricingEstimateWithVersion = Readonly<{ estimate: PricingEstimate; version: PricingEstimateVersion }>;

export type ListPricingEstimatesQuery = Readonly<{
  organizationId: string;
  tenderId?: string | undefined;
  clientAccountId?: string | undefined;
  type?: PricingType | undefined;
  includeArchived?: boolean | undefined;
  limit: number;
  offset: number;
}>;

export type ListPricingEstimatesResult = Readonly<{ items: readonly PricingEstimateWithVersion[]; total: number }>;

export interface PricingEstimateRepository {
  findById(input: { organizationId: string; estimateId: string }): Promise<PricingEstimateWithVersion | null>;
  findVersion(input: { organizationId: string; estimateId: string; version: number }): Promise<PricingEstimateVersion | null>;
  listVersions(input: { organizationId: string; estimateId: string }): Promise<readonly PricingEstimateVersion[]>;
  list(query: ListPricingEstimatesQuery): Promise<ListPricingEstimatesResult>;

  /** Crée l'en-tête ET sa première version, atomiquement (transaction courte, mission
   *  §"Atomicité" — jamais un en-tête sans version, jamais une version orpheline). */
  createWithFirstVersion(input: { estimate: PricingEstimate; version: PricingEstimateVersion }): Promise<void>;

  /** Crée une nouvelle version, marque l'ancienne SUPERSEDED, et met à jour le pointeur de
   *  l'en-tête vers la nouvelle version — atomiquement. Ne modifie JAMAIS `previousVersion.amount`/
   *  `breakdown`/`assumptions` (mission §"ne jamais modifier rétroactivement une version
   *  historique"). */
  addVersion(input: { estimate: PricingEstimate; previousVersion: PricingEstimateVersion; newVersion: PricingEstimateVersion }): Promise<void>;

  /** Persistance de l'en-tête seul (ex. archivage) — ne touche jamais aux versions. */
  save(estimate: PricingEstimate): Promise<void>;
}

export const PRICING_ESTIMATE_REPOSITORY = Symbol("PRICING_ESTIMATE_REPOSITORY");
