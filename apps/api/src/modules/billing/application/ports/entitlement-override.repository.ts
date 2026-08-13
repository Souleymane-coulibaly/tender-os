import type { EntitlementFeature } from "../../domain/entitlement-feature";
import type { EntitlementOverride } from "../../domain/entitlement-override.aggregate";
import type { QuotaType } from "../../domain/quota-type";

export type EntitlementOverridePage = Readonly<{ items: readonly EntitlementOverride[]; nextCursor: string | null }>;

export interface EntitlementOverrideRepository {
  findById(organizationId: string, id: string): Promise<EntitlementOverride | null>;
  /** Au plus un override ACTIF par (organizationId, feature) à un instant donné — voir
   *  `CreateEntitlementOverrideUseCase` (mission §53 : "éviter deux overrides contradictoires
   *  actifs"). */
  findActiveFeatureOverride(organizationId: string, feature: EntitlementFeature, now: Date): Promise<EntitlementOverride | null>;
  findActiveQuotaOverride(organizationId: string, quota: QuotaType, now: Date): Promise<EntitlementOverride | null>;
  list(organizationId: string, options: { cursor?: string | undefined; limit: number }): Promise<EntitlementOverridePage>;
  save(override: EntitlementOverride): Promise<void>;
}

export const ENTITLEMENT_OVERRIDE_REPOSITORY = Symbol("ENTITLEMENT_OVERRIDE_REPOSITORY");
