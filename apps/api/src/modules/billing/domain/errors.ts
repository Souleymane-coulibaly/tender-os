import { DomainError } from "../../../shared-kernel/domain-error";

export class InvalidPlanTierError extends DomainError {
  readonly code = "INVALID_PLAN_TIER";
  constructor(value: string) {
    super(`Invalid subscription plan tier: ${value}`);
  }
}

export class InvalidBillingIntervalError extends DomainError {
  readonly code = "INVALID_BILLING_INTERVAL";
  constructor(value: string) {
    super(`Invalid billing interval: ${value}`);
  }
}

export class InvalidSubscriptionStatusError extends DomainError {
  readonly code = "INVALID_SUBSCRIPTION_STATUS";
  constructor(value: string) {
    super(`Invalid subscription status: ${value}`);
  }
}

export class InvalidPlanSourceError extends DomainError {
  readonly code = "INVALID_PLAN_SOURCE";
  constructor(value: string) {
    super(`Invalid plan source: ${value}`);
  }
}

export class InvalidPassPurchaseStatusError extends DomainError {
  readonly code = "INVALID_PASS_PURCHASE_STATUS";
  constructor(value: string) {
    super(`Invalid pass purchase status: ${value}`);
  }
}

/** Mission §17 : STARTER/BUSINESS/ENTERPRISE supportent MONTHLY et YEARLY ; ENTERPRISE annuel
 *  n'est pas exclu, mais un couple palier/intervalle absent du catalogue (ex. un futur palier
 *  mensuel-only) doit échouer explicitement plutôt que silencieusement résoudre un prix erroné. */
export class UnsupportedBillingIntervalForPlanError extends DomainError {
  readonly code = "UNSUPPORTED_BILLING_INTERVAL_FOR_PLAN";
  constructor(planTier: string, billingInterval: string) {
    super(`Plan ${planTier} does not support billing interval ${billingInterval}`);
  }
}

export class SubscriptionNotFoundError extends DomainError {
  readonly code = "SUBSCRIPTION_NOT_FOUND";
  constructor(organizationId: string) {
    super(`No subscription found for organization ${organizationId}`);
  }
}

export class PassPurchaseNotFoundError extends DomainError {
  readonly code = "PASS_PURCHASE_NOT_FOUND";
  constructor(id: string) {
    super(`Pass purchase ${id} not found`);
  }
}

/** Mission §7 : "Une correction exceptionnelle doit passer par Platform Admin et être auditée" —
 *  ce module n'expose aucun chemin normal pour reconsommer/déconsommer un Pass déjà attaché. */
export class PassPurchaseAlreadyConsumedError extends DomainError {
  readonly code = "PASS_PURCHASE_ALREADY_CONSUMED";
  constructor(id: string, consumedTenderId: string) {
    super(`Pass purchase ${id} is already consumed for tender ${consumedTenderId}`);
  }
}

export class PassPurchaseNotAvailableError extends DomainError {
  readonly code = "PASS_PURCHASE_NOT_AVAILABLE";
  constructor(id: string) {
    super(`Pass purchase ${id} is not available`);
  }
}

/** Correctif audit Codex 22A (P1-01) — jetée par `assertEntitlementFeature` (application/policies)
 *  à chaque point d'entrée différenciant (API Keys, Webhooks, Automation Connectors, Approval
 *  Workflows, Advanced Collaboration) quand le plan effectif de l'organisation ne couvre pas la
 *  fonctionnalité. Jamais un simple masquage frontend (mission §13 "point bloquant"). */
export class EntitlementFeatureNotAvailableError extends DomainError {
  readonly code = "ENTITLEMENT_FEATURE_NOT_AVAILABLE";
  constructor(feature: string) {
    super(`This organization's plan does not include the "${feature}" feature.`);
  }
}

/** Correctif audit Codex 22A (P1-02). */
export class EntitlementOverrideNotFoundError extends DomainError {
  readonly code = "ENTITLEMENT_OVERRIDE_NOT_FOUND";
  constructor(id: string) {
    super(`Entitlement override ${id} not found`);
  }
}

/** Mission §31 : "il peut conceptuellement modifier : feature ; limit" — jamais les deux à la fois
 *  sur le même override (cible ambiguë, contraire à la précédence plan -> override -> effectif). */
export class InvalidEntitlementOverrideTargetError extends DomainError {
  readonly code = "INVALID_ENTITLEMENT_OVERRIDE_TARGET";
  constructor() {
    super("An entitlement override must target exactly one of: feature, quota.");
  }
}

export class EntitlementOverrideReasonRequiredError extends DomainError {
  readonly code = "ENTITLEMENT_OVERRIDE_REASON_REQUIRED";
  constructor() {
    super("A reason is required to create or revoke an entitlement override.");
  }
}

export class EntitlementOverrideAlreadyRevokedError extends DomainError {
  readonly code = "ENTITLEMENT_OVERRIDE_ALREADY_REVOKED";
  constructor(id: string) {
    super(`Entitlement override ${id} is already revoked`);
  }
}
