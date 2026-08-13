import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { getPlanQuotaLimit, planHasFeature } from "../../domain/plan-catalog";
import type { EntitlementFeature } from "../../domain/entitlement-feature";
import { PlanTier } from "../../domain/plan-tier";
import type { QuotaLimit, QuotaType } from "../../domain/quota-type";
import { ENTITLEMENT_OVERRIDE_REPOSITORY, type EntitlementOverrideRepository } from "../ports/entitlement-override.repository";
import { ORGANIZATION_SUBSCRIPTION_REPOSITORY, type OrganizationSubscriptionRepository } from "../ports/organization-subscription.repository";
import { PASS_PURCHASE_REPOSITORY, type PassPurchaseRepository } from "../ports/pass-purchase.repository";

export type EntitlementContext = Readonly<{ tenderId?: string | undefined }>;

/**
 * V2 Sprint 22 (billing, étape 22A) — mission §21. Toujours composé AVEC RBAC et ClientAccess par
 * l'appelant, JAMAIS seul (ce service ne sait rien des rôles ni de la portée client — uniquement
 * "qu'est-ce que le plan de cette organisation autorise"). Deux notions de portée distinctes,
 * volontairement séparées :
 *   - `getEffectivePlanTier`/`getEffectiveLimit` : baseline ORGANISATION-WIDE (abonnement actif,
 *     sinon "l'organisation possède au moins un Pass" -> PASS, sinon aucun plan) — sert les quotas
 *     globaux (USERS_MAX/CHAT_AI_DAILY_MAX/STORAGE_GB_MAX).
 *   - `canOperateOnTender` : la porte de sécurité Pass-scope (mission §22) — un Pass n'autorise
 *     JAMAIS une opération sur un Tender autre que celui auquel il est consommé, même dans la même
 *     organisation. Les fonctionnalités "cœur métier" (DCE/analyse/chiffrage/mémoire/package) ne
 *     sont volontairement PAS modélisées en `EntitlementFeature` (mission §13 : disponibles sur
 *     tous les paliers payants) — leurs use cases appelants doivent composer `canOperateOnTender`
 *     directement, jamais `canUseFeature` (réservé aux fonctionnalités différenciantes).
 *
 * Correctif audit Codex 22A (P1-02) — précédence explicite "plan de base -> override Platform Admin
 * -> entitlement effectif" (mission §37) : un override ACTIF sur (organizationId, feature/quota)
 * remplace TOUJOURS la valeur catalogue, y compris pour l'AUGMENTER (mission §38, ex. Business +
 * override PUBLIC_API=true) — jamais un bypass RBAC/ClientAccess pour autant (`canOperateOnTender`,
 * qui gouverne le scope Pass, ne consulte jamais les overrides : mission §39 "un override ne doit
 * jamais... bypass tenant").
 */
export interface EntitlementService {
  getEffectivePlanTier(organizationId: string): Promise<PlanTier | null>;
  canOperateOnTender(organizationId: string, tenderId: string): Promise<boolean>;
  canUseFeature(organizationId: string, feature: EntitlementFeature, context?: EntitlementContext): Promise<boolean>;
  getEffectiveLimit(organizationId: string, quota: QuotaType, context?: EntitlementContext): Promise<QuotaLimit>;
}

export const ENTITLEMENT_SERVICE = Symbol("ENTITLEMENT_SERVICE");

@Injectable()
export class DefaultEntitlementService implements EntitlementService {
  constructor(
    @Inject(ORGANIZATION_SUBSCRIPTION_REPOSITORY) private readonly subscriptionRepository: OrganizationSubscriptionRepository,
    @Inject(PASS_PURCHASE_REPOSITORY) private readonly passPurchaseRepository: PassPurchaseRepository,
    @Inject(ENTITLEMENT_OVERRIDE_REPOSITORY) private readonly overrideRepository: EntitlementOverrideRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async getEffectivePlanTier(organizationId: string): Promise<PlanTier | null> {
    const subscription = await this.subscriptionRepository.findByOrganizationId(organizationId);
    if (subscription && subscription.isActive) {
      return subscription.planTier;
    }
    const hasAnyPass = await this.passPurchaseRepository.existsForOrganization(organizationId);
    return hasAnyPass ? PlanTier.Pass : null;
  }

  async canOperateOnTender(organizationId: string, tenderId: string): Promise<boolean> {
    const subscription = await this.subscriptionRepository.findByOrganizationId(organizationId);
    if (subscription && subscription.isActive) {
      return true;
    }
    const pass = await this.passPurchaseRepository.findByTenderId(organizationId, tenderId);
    return pass !== null && pass.consumedTenderId === tenderId;
  }

  async canUseFeature(organizationId: string, feature: EntitlementFeature, context?: EntitlementContext): Promise<boolean> {
    if (context?.tenderId !== undefined) {
      const allowedOnThisTender = await this.canOperateOnTender(organizationId, context.tenderId);
      if (!allowedOnThisTender) {
        return false;
      }
    }

    const override = await this.overrideRepository.findActiveFeatureOverride(organizationId, feature, this.clock.now());
    if (override) {
      return override.featureEnabled ?? false;
    }

    const tier = await this.getEffectivePlanTier(organizationId);
    return tier !== null && planHasFeature(tier, feature);
  }

  async getEffectiveLimit(organizationId: string, quota: QuotaType, _context?: EntitlementContext): Promise<QuotaLimit> {
    const override = await this.overrideRepository.findActiveQuotaOverride(organizationId, quota, this.clock.now());
    if (override && override.quotaLimit !== undefined) {
      return override.quotaLimit;
    }

    const tier = await this.getEffectivePlanTier(organizationId);
    return tier === null ? 0 : getPlanQuotaLimit(tier, quota);
  }
}
