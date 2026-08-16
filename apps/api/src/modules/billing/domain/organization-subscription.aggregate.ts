import { PlanSource } from "./plan-source";
import type { SubscriptionPlanTier } from "./plan-tier";
import { BillingInterval } from "./billing-interval";
import { SubscriptionStatus } from "./subscription-status";

export type OrganizationSubscriptionProps = {
  id: string;
  organizationId: string;
  planTier: SubscriptionPlanTier;
  billingInterval: BillingInterval;
  status: SubscriptionStatus;
  source: PlanSource;
  stripeCustomerId?: string | undefined;
  stripeSubscriptionId?: string | undefined;
  currentPeriodStart?: Date | undefined;
  currentPeriodEnd?: Date | undefined;
  canceledAt?: Date | undefined;
  /** V2 Sprint 25 (Trial Starter) — fin de la période d'essai Stripe (`subscription.trial_end`),
   *  autoritaire côté serveur/Stripe (mission §14/§10 : jamais un retour Checkout comme preuve).
   *  Toujours `undefined` hors TRIALING (effacé par `updateFromStripeStatus` à la sortie du Trial). */
  trialEndsAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * V2 Sprint 22 (billing, étape 22A) — état COURANT de l'abonnement récurrent d'une organisation.
 * Jamais PASS (voir `PassPurchase`), jamais CONSEIL (hors catalogue SaaS). Une seule instance par
 * organisation (contrainte `@unique` sur `organizationId`, `prisma-organization-subscription.repository.ts`)
 * — changer de palier MUTE cette même ligne, ne crée jamais une seconde ligne (l'historique vit
 * dans AuditLog : `PlanAssigned`/`PlanChanged`/`SubscriptionChanged`/`SubscriptionCanceled`,
 * mission §68, écrits par les use cases appelants — jamais par cet agrégat lui-même).
 */
export class OrganizationSubscription {
  private constructor(private props: OrganizationSubscriptionProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    planTier: SubscriptionPlanTier;
    billingInterval: BillingInterval;
    source: PlanSource;
    stripeCustomerId?: string | undefined;
    stripeSubscriptionId?: string | undefined;
    currentPeriodStart?: Date | undefined;
    currentPeriodEnd?: Date | undefined;
    /** V2 Sprint 25 — absent = ACTIVE (comportement historique 100% inchangé pour tous les
     *  appelants existants, MANUAL/GRANTED compris) ; STRIPE fournit désormais le statut réel lu
     *  du webhook (mission §7/§23 : jamais recalculé/deviné ici). */
    status?: SubscriptionStatus | undefined;
    trialEndsAt?: Date | undefined;
    occurredAt: Date;
  }): OrganizationSubscription {
    return new OrganizationSubscription({
      id: input.id,
      organizationId: input.organizationId,
      planTier: input.planTier,
      billingInterval: input.billingInterval,
      status: input.status ?? SubscriptionStatus.Active,
      source: input.source,
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      currentPeriodStart: input.currentPeriodStart,
      currentPeriodEnd: input.currentPeriodEnd,
      canceledAt: undefined,
      trialEndsAt: input.trialEndsAt,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static reconstitute(props: OrganizationSubscriptionProps): OrganizationSubscription {
    return new OrganizationSubscription(props);
  }

  /** Changement de palier et/ou d'intervalle (mission §32-§34 : Pass→Starter/Business,
   *  Starter↔Business). Ne touche jamais au statut : un abonnement CANCELED ne redevient ACTIVE
   *  qu'explicitement via `reactivate()`. */
  changePlan(input: { planTier: SubscriptionPlanTier; billingInterval: BillingInterval; occurredAt: Date }): void {
    this.props = { ...this.props, planTier: input.planTier, billingInterval: input.billingInterval, updatedAt: input.occurredAt };
  }

  /** Correctif audit Codex 22D (P1-01) — `AssignSubscriptionUseCase` appelait `changePlan()` sur une
   *  ligne EXISTANTE, qui ne touche ni `source` ni les métadonnées Stripe : un webhook
   *  `customer.subscription.updated` réel ne mettait alors JAMAIS à jour `currentPeriodStart/End`
   *  sur un renouvellement, et une réassignation Platform Admin MANUAL/GRANTED sur une organisation
   *  déjà STRIPE laissait `source` divergent (affichée STRIPE alors que réellement GRANTED/MANUAL).
   *  `reassign` remplace TOUJOURS l'intégralité de ces champs — jamais un merge partiel — pour que
   *  la ligne reflète exactement la dernière assignation reçue, quelle que soit sa provenance.
   *  `stripeCustomerId`/`stripeSubscriptionId`/`currentPeriodStart`/`currentPeriodEnd` absents du
   *  nouvel input (cas MANUAL/GRANTED) sont donc explicitement EFFACÉS, jamais conservés d'une
   *  précédente période Stripe qui ne s'applique plus. */
  reassign(input: {
    planTier: SubscriptionPlanTier;
    billingInterval: BillingInterval;
    source: PlanSource;
    stripeCustomerId?: string | undefined;
    stripeSubscriptionId?: string | undefined;
    currentPeriodStart?: Date | undefined;
    currentPeriodEnd?: Date | undefined;
    occurredAt: Date;
  }): void {
    this.props = {
      ...this.props,
      planTier: input.planTier,
      billingInterval: input.billingInterval,
      source: input.source,
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      currentPeriodStart: input.currentPeriodStart,
      currentPeriodEnd: input.currentPeriodEnd,
      updatedAt: input.occurredAt,
    };
  }

  /** V2 Sprint 25 (Trial Starter) — TRANSITION DE STATUT explicite pilotée par le statut RÉEL lu
   *  d'un webhook Stripe (`customer.subscription.created`/`updated`), volontairement DISTINCTE de
   *  `reassign()` : `reassign()` reste inchangée et NE TOUCHE JAMAIS au statut (invariant
   *  documenté ci-dessus, essentiel pour les réassignations MANUAL/GRANTED de Platform Admin, qui
   *  ne doivent jamais démarrer/arrêter un Trial). Seul l'appelant qui possède un statut Stripe
   *  fraîchement lu (jamais deviné/recalculé) invoque cette méthode, en plus de `reassign()`. */
  updateFromStripeStatus(input: { status: SubscriptionStatus; trialEndsAt?: Date | undefined; occurredAt: Date }): void {
    this.props = {
      ...this.props,
      status: input.status,
      // Hors TRIALING, aucune fin d'essai à conserver (mission — jamais une date d'essai qui
      // survivrait à la sortie du Trial et fausserait un affichage ultérieur).
      trialEndsAt: input.status === SubscriptionStatus.Trialing ? input.trialEndsAt : undefined,
      updatedAt: input.occurredAt,
    };
  }

  markPastDue(occurredAt: Date): void {
    this.props = { ...this.props, status: SubscriptionStatus.PastDue, updatedAt: occurredAt };
  }

  reactivate(occurredAt: Date): void {
    this.props = { ...this.props, status: SubscriptionStatus.Active, canceledAt: undefined, updatedAt: occurredAt };
  }

  cancel(occurredAt: Date): void {
    this.props = { ...this.props, status: SubscriptionStatus.Canceled, canceledAt: occurredAt, updatedAt: occurredAt };
  }

  get id(): string {
    return this.props.id;
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get planTier(): SubscriptionPlanTier {
    return this.props.planTier;
  }

  get billingInterval(): BillingInterval {
    return this.props.billingInterval;
  }

  get status(): SubscriptionStatus {
    return this.props.status;
  }

  get source(): PlanSource {
    return this.props.source;
  }

  get isActive(): boolean {
    return this.props.status === SubscriptionStatus.Active;
  }

  /** V2 Sprint 25 (Trial Starter) — "donne droit aux entitlements du plan", DISTINCT de `isActive`
   *  (strictement ACTIVE) : un abonnement TRIALING doit bénéficier des entitlements/quotas Starter
   *  (mission §20) exactement comme s'il était ACTIVE, jamais `isActive` lui-même élargi (qui
   *  garderait son sens strict pour un futur besoin qui voudrait vraiment "payant et à jour"). */
  get isEntitled(): boolean {
    return this.props.status === SubscriptionStatus.Active || this.props.status === SubscriptionStatus.Trialing;
  }

  get trialEndsAt(): Date | undefined {
    return this.props.trialEndsAt;
  }

  toProps(): OrganizationSubscriptionProps {
    return { ...this.props };
  }
}
