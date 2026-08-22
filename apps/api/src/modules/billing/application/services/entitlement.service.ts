import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { getPlanQuotaLimit, planHasFeature } from "../../domain/plan-catalog";
import type { EntitlementFeature } from "../../domain/entitlement-feature";
import { TenderOperationNotEntitledError } from "../../domain/errors";
import { PlanTier } from "../../domain/plan-tier";
import type { QuotaLimit, QuotaType } from "../../domain/quota-type";
import { ENTITLEMENT_OVERRIDE_REPOSITORY, type EntitlementOverrideRepository } from "../ports/entitlement-override.repository";
import { ORGANIZATION_SUBSCRIPTION_REPOSITORY, type OrganizationSubscriptionRepository } from "../ports/organization-subscription.repository";
import { PASS_PURCHASE_REPOSITORY, type PassPurchaseRepository } from "../ports/pass-purchase.repository";
import { ReleasePassForTenderUseCase } from "../use-cases/release-pass-for-tender.use-case";
import { ReservePassForTenderUseCase } from "../use-cases/reserve-pass-for-tender.use-case";

export type TenderOperationEntitlementInput = Readonly<{ organizationId: string; tenderId: string; actorId: string; occurredAt: Date }>;

export type EntitlementContext = Readonly<{ tenderId?: string | undefined }>;

/**
 * V2 Sprint 22 (billing, étape 22A) — mission §21. Toujours composé AVEC RBAC et ClientAccess par
 * l'appelant, JAMAIS seul (ce service ne sait rien des rôles ni de la portée client — uniquement
 * "qu'est-ce que le plan de cette organisation autorise"). Deux notions de portée distinctes,
 * volontairement séparées :
 *   - `getEffectivePlanTier`/`getEffectiveLimit` : baseline ORGANISATION-WIDE (abonnement actif,
 *     sinon "l'organisation possède au moins un Pass" -> PASS, sinon aucun plan) — sert les quotas
 *     globaux (USERS_MAX/CHAT_AI_DAILY_MAX/STORAGE_GB_MAX).
 *   - `canOperateOnTender` : la porte de sécurité Pass-scope (mission §22, resserrée P2.3-E1.2 —
 *     "1 Pass AO = 1 Tender / 1 AO") — un Pass n'autorise JAMAIS une opération sur un Tender autre
 *     que celui auquel il est RÉSERVÉ ou CONSOMMÉ, même dans la même organisation. Les
 *     fonctionnalités "cœur métier" (DCE/analyse/chiffrage/mémoire/package) ne
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
 *
 * Checkpoint TENDEROS-2.1-P2.3-E1.3, correctif du finding Codex P1-A — `canOperateOnTender` est
 * désormais STRICTEMENT PURE (lecture seule, zéro écriture, voir son commentaire de méthode) ;
 * l'ALLOCATION du Pass (réservation) est un acte séparé, explicite, exposé par
 * `runTenderOperationEntitled` — mission §2 "séparer autorisation et allocation", jamais deux moteurs
 * différents : les deux méthodes partagent la même lecture d'entitlement, `runTenderOperationEntitled`
 * ajoute uniquement l'allocation + la compensation en cas d'échec métier (mission §4).
 */
export interface EntitlementService {
  getEffectivePlanTier(organizationId: string): Promise<PlanTier | null>;
  /** PURE — voir le commentaire de méthode sur `DefaultEntitlementService.canOperateOnTender`. Pour
   *  déclencher réellement l'opération (avec allocation de Pass si nécessaire), utiliser
   *  `runTenderOperationEntitled`. */
  canOperateOnTender(organizationId: string, tenderId: string): Promise<boolean>;
  /** Checkpoint TENDEROS-2.1-P2.3-E1.3 — SEUL point d'entrée qui alloue réellement un Pass (mission
   *  §3 "la première MUTATION métier payante réussie du Tender doit pouvoir affecter le Pass").
   *  Voir le commentaire de méthode sur `DefaultEntitlementService.runTenderOperationEntitled`. */
  runTenderOperationEntitled<T>(input: TenderOperationEntitlementInput, operation: () => Promise<T>): Promise<T>;
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
    private readonly reservePassForTenderUseCase: ReservePassForTenderUseCase,
    private readonly releasePassForTenderUseCase: ReleasePassForTenderUseCase,
  ) {}

  async getEffectivePlanTier(organizationId: string): Promise<PlanTier | null> {
    const subscription = await this.subscriptionRepository.findByOrganizationId(organizationId);
    // V2 Sprint 25 (Trial Starter) — `isEntitled` (ACTIVE ou TRIALING), jamais `isActive` seul :
    // un Trial Starter doit obtenir les entitlements Starter (mission §20), pas aucun plan.
    if (subscription && subscription.isEntitled) {
      return subscription.planTier;
    }
    const hasAnyPass = await this.passPurchaseRepository.existsForOrganization(organizationId);
    return hasAnyPass ? PlanTier.Pass : null;
  }

  /**
   * Checkpoint TENDEROS-2.1-P2.3-E1.1, FINDING 1/FINDING 4 (Pass AO) — depuis que la consommation
   * (crédit ET Pass) n'a plus lieu à `CreateTender` mais au premier `TenderSubmission` réussi, un
   * Pass doit pouvoir couvrir la PRÉPARATION d'un Tender (DCE/analyse/mémoire/package), sinon aucune
   * organisation Pass-only ne pourrait jamais atteindre son premier dépôt.
   *
   * Checkpoint TENDEROS-2.1-P2.3-E1.3, correctif du finding Codex P1-A (audit E1.2) — cette méthode
   * est désormais STRICTEMENT PURE : elle ne réserve, ne consomme, ni ne modifie plus JAMAIS un Pass
   * ou un crédit (mission §1 "une méthode de vérification d'entitlement doit être PURE du point de
   * vue allocation commerciale"). Elle répond uniquement "cette organisation PEUT-ELLE opérer sur ce
   * Tender à l'instant présent" en lisant trois sources, sans écrire : abonnement actif/essai, Pass
   * déjà affecté (RESERVED ou CONSUMED) à CE Tender, ou au moins un Pass AVAILABLE réservable EN
   * PRINCIPE (jamais réservé ici — `findFirstAvailable`, déjà une lecture pure utilisée par ailleurs
   * pour `getEffectivePlanTier`). Un `true` renvoyé ici n'engage donc rien : un appelant qui veut
   * RÉELLEMENT déclencher l'opération (avec allocation effective si nécessaire) doit utiliser
   * `runTenderOperationEntitled`, jamais cette méthode seule pour un point d'entrée mutant. C'est
   * précisément ce qui rend cette méthode sûre pour un futur GET/preflight/readiness (mission §13) :
   * appelée 10 fois de suite, elle ne modifie jamais `reservedTenderId`/`reservedAt`/`status`/le
   * ledger (voir le test dédié "CHECK PURE").
   */
  async canOperateOnTender(organizationId: string, tenderId: string): Promise<boolean> {
    const subscription = await this.subscriptionRepository.findByOrganizationId(organizationId);
    if (subscription && subscription.isEntitled) {
      return true;
    }
    const alreadyAssigned = await this.passPurchaseRepository.findAssignedToTender(organizationId, tenderId);
    if (alreadyAssigned) {
      return true;
    }
    const availablePass = await this.passPurchaseRepository.findFirstAvailable(organizationId, this.clock.now());
    return availablePass !== null;
  }

  /**
   * Checkpoint TENDEROS-2.1-P2.3-E1.3 — mission §2/§3 : SEUL point d'entrée qui alloue réellement un
   * Pass, appelé par les 12 use cases "cœur AO" (DCE/Analyse/Mémoire technique/SubmissionPackage/
   * Submission) au moment de leur PREMIÈRE mutation métier payante réelle — jamais lors d'un simple
   * `canOperateOnTender` (devenu pur, voir ci-dessus).
   *
   * Design retenu (mission §3 "STOP si refonte transactionnelle importante, proposer le design
   * minimal sûr" — audité : sur les 12 use cases gatés, seuls 3 enveloppent déjà leur mutation dans
   * `AtomicTransactionRunner`, les 9 autres non — imposer une transaction DB partagée réservation+
   * mutation à TOUS aurait exigé d'ajouter cette infrastructure à 9 use cases à travers 4 modules,
   * une refonte disproportionnée pour ce Checkpoint) : **Option B, compensation idempotente**
   * (mission §4). La réservation (si nécessaire) précède l'opération ; si l'opération échoue, SEULE
   * une réservation FRAÎCHEMENT créée par CET appel (`NEWLY_RESERVED`, jamais un Pass déjà affecté
   * par un appel antérieur légitime) est libérée avant de re-propager l'erreur originale — jamais un
   * try/catch silencieux (mission §4). Le Pass redevient AVAILABLE, immédiatement réutilisable par un
   * autre Tender (mission §11 TEST ÉCHEC MÉTIER).
   */
  async runTenderOperationEntitled<T>(input: TenderOperationEntitlementInput, operation: () => Promise<T>): Promise<T> {
    const allowed = await this.canOperateOnTender(input.organizationId, input.tenderId);
    if (!allowed) {
      throw new TenderOperationNotEntitledError(input.organizationId, input.tenderId);
    }

    const reservation = await this.reservePassForTenderUseCase.execute({
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      actorId: input.actorId,
      occurredAt: input.occurredAt,
    });
    if (reservation.outcome === "DENIED") {
      // Course perdue entre le check ci-dessus et la tentative de réservation (ex. un autre Tender a
      // pris le dernier Pass AVAILABLE entre-temps) — jamais deviné, refus explicite et cohérent avec
      // le message de `canOperateOnTender`.
      throw new TenderOperationNotEntitledError(input.organizationId, input.tenderId);
    }

    try {
      return await operation();
    } catch (error) {
      if (reservation.outcome === "NEWLY_RESERVED") {
        await this.releasePassForTenderUseCase.execute({
          organizationId: input.organizationId,
          tenderId: input.tenderId,
          passPurchaseId: reservation.passPurchaseId,
          actorId: input.actorId,
          occurredAt: input.occurredAt,
          reason: "OPERATION_FAILED",
        });
      }
      throw error;
    }
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
