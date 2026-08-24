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

/** Checkpoint TENDEROS-2.1-P2.3-E1.2 — même motif que `PassPurchaseAlreadyConsumedError`, pour la
 *  réservation : un Pass déjà RESERVED pour un Tender ne peut jamais être réaffecté à un AUTRE
 *  Tender directement (mission "1 Pass AO = 1 Tender / 1 AO"). */
export class PassPurchaseAlreadyReservedError extends DomainError {
  readonly code = "PASS_PURCHASE_ALREADY_RESERVED";
  constructor(id: string, reservedTenderId: string) {
    super(`Pass purchase ${id} is already reserved for tender ${reservedTenderId}`);
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

/**
 * Checkpoint TENDEROS-2.1-P2.3-E1.1, FINDING 1 — jetée par `assertTenderOperationEntitled`
 * (application/policies) à chaque point d'entrée "cœur AO" (DCE/Analyse/Mémoire technique/
 * SubmissionPackage/Submission) quand l'organisation n'a NI abonnement/essai actif NI Pass
 * applicable à ce Tender précis (mission "Règle Pass AO" : un Pass consommé pour le Tender A
 * n'autorise jamais une opération sur le Tender B). Jamais un simple masquage frontend — le backend
 * doit refuser, quel que soit le client HTTP.
 */
export class TenderOperationNotEntitledError extends DomainError {
  readonly code = "TENDER_OPERATION_NOT_ENTITLED";
  constructor(organizationId: string, tenderId: string) {
    super(`Organization ${organizationId} has no active entitlement (subscription, trial, or applicable Pass) to operate on tender ${tenderId}`);
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

/** V2 Sprint 22 (billing, étape 22B). Jetée par `ConsumeAoCreditUseCase` — jamais un succès
 *  silencieux ni un solde négatif (mission §16 "concurrency requirement... final balance 0, never
 *  negative"). Bloque la création du Tender qui l'a déclenchée (mission — le point de
 *  consommation choisi, `CreateTenderUseCase`, doit échouer plutôt que créer un Tender non couvert). */
export class InsufficientAoCreditsError extends DomainError {
  readonly code = "INSUFFICIENT_AO_CREDITS";
  constructor(organizationId: string) {
    super(`Organization ${organizationId} has no AO credit remaining`);
  }
}

/**
 * Checkpoint TENDEROS-2.1-P2.3-E9 — correctif d'un P1 trouvé par un vrai test HTTP + PostgreSQL
 * (deux dépôts concurrents pour le MÊME Tender) : `PrismaAoCreditLedgerRepository.grant()`/
 * `grantTrial()`/`consume()` protègent leur idempotence par un index unique partiel réel, avec une
 * "relecture de secours HORS transaction" en cas de violation — un motif correct quand ces méthodes
 * ouvrent LEUR PROPRE transaction locale (`this.prisma.withTransaction`, aucune transaction ambiante),
 * mais qui rejoue une erreur Postgres BRUTE ("current transaction is aborted") quand elles REJOIGNENT
 * une transaction ambiante déjà ouverte par l'appelant (ex. `RecordTenderSubmissionUseCase`) : la
 * "relecture de secours" s'exécute alors ENCORE DANS cette même transaction ambiante désormais avortée,
 * qui refuse toute nouvelle requête. Dans ce cas précis, la transaction ambiante ENTIÈRE doit échouer
 * (le perdant de la course ne doit JAMAIS croire avoir réussi et écrire un second Tender Submission
 * dans la même transaction) — mais avec une erreur DOMAINE propre, jamais une exception Prisma interne
 * qui fuit jusqu'au client HTTP.
 */
export class ConcurrentAoCreditLedgerWriteError extends DomainError {
  readonly code = "CONCURRENT_AO_CREDIT_LEDGER_WRITE";
  constructor(organizationId: string) {
    super(`A concurrent AO credit ledger write for organization ${organizationId} was already in progress; please retry`);
  }
}

export class InvalidAoCreditLedgerEntryError extends DomainError {
  readonly code = "INVALID_AO_CREDIT_LEDGER_ENTRY";
  constructor(reason: string) {
    super(`Invalid AO credit ledger entry: ${reason}`);
  }
}

export class AoCreditAdjustmentReasonRequiredError extends DomainError {
  readonly code = "AO_CREDIT_ADJUSTMENT_REASON_REQUIRED";
  constructor() {
    super("A reason is required for a manual AO credit adjustment or reversal.");
  }
}

/** Correctif audit Codex 22B (P1-02) — un ajustement Platform Admin qui ferait passer le solde
 *  sous 0 est REFUSÉ, jamais silencieusement plafonné à 0 : la demande d'un Platform Admin
 *  (`amount`) et ce qui est réellement appliqué ne doivent jamais diverger sur un ledger d'audit. */
export class AoCreditAdjustmentWouldGoNegativeError extends DomainError {
  readonly code = "AO_CREDIT_ADJUSTMENT_WOULD_GO_NEGATIVE";
  constructor(organizationId: string, currentBalance: number, amount: number) {
    super(`Adjusting organization ${organizationId}'s AO credit balance (${currentBalance}) by ${amount} would go negative`);
  }
}

/** Le plan effectif n'utilise pas le ledger AO (Enterprise — quotas fair-use illimités, mission
 *  §14) : jamais de grant mensuel numérique pour ce palier. */
export class AoCreditGrantNotApplicableError extends DomainError {
  readonly code = "AO_CREDIT_GRANT_NOT_APPLICABLE";
  constructor(organizationId: string) {
    super(`Organization ${organizationId}'s plan does not use the AO credit ledger (unlimited)`);
  }
}

export class AoCreditLedgerEntryNotFoundError extends DomainError {
  readonly code = "AO_CREDIT_LEDGER_ENTRY_NOT_FOUND";
  constructor(id: string) {
    super(`AO credit ledger entry ${id} not found`);
  }
}

/** Mission §7 (Pass) appliqué par symétrie au ledger AO d'abonnement — une consommation déjà
 *  reversée ne peut jamais l'être une seconde fois (jamais un double crédit). */
export class AoCreditConsumptionAlreadyReversedError extends DomainError {
  readonly code = "AO_CREDIT_CONSUMPTION_ALREADY_REVERSED";
  constructor(tenderId: string) {
    super(`The AO credit consumption for tender ${tenderId} has already been reversed`);
  }
}

/** V2 Sprint 22 (billing, étape 22C) — une variable `STRIPE_PRICE_*` manquante ne fait jamais
 *  échouer le DÉMARRAGE (même discipline que `METRICS_TOKEN`, Sprint 21) ; seule une tentative
 *  réelle de checkout pour ce couple plan/intervalle échoue, explicitement. */
export class StripePriceNotConfiguredError extends DomainError {
  readonly code = "STRIPE_PRICE_NOT_CONFIGURED";
  constructor(target: string, envVar: string) {
    super(`No Stripe Price configured for ${target} (expected environment variable ${envVar})`);
  }
}

export class StripeWebhookSignatureInvalidError extends DomainError {
  readonly code = "STRIPE_WEBHOOK_SIGNATURE_INVALID";
  constructor() {
    super("Invalid Stripe webhook signature");
  }
}

/** Mission — Customer Portal réservé aux abonnements, "jamais forcé sur le Pass" : une
 *  organisation sans abonnement Stripe actif (Pass uniquement, ou aucun plan) n'a pas de
 *  `stripeCustomerId` réel à ouvrir dans le Portal. */
export class NoStripeCustomerForOrganizationError extends DomainError {
  readonly code = "NO_STRIPE_CUSTOMER_FOR_ORGANIZATION";
  constructor(organizationId: string) {
    super(`Organization ${organizationId} has no Stripe customer (no active subscription)`);
  }
}

export class BillingManagementPermissionMissingError extends DomainError {
  readonly code = "BILLING_MANAGEMENT_PERMISSION_MISSING";
  constructor() {
    super("Only the organization's Owner or Organization Admin can manage billing");
  }
}

/** Correctif audit Codex 22C (P1-02) — un événement `customer.subscription.*` référençant un
 *  Stripe Price ID que le registre ne reconnaît pas ne doit JAMAIS être un succès silencieux
 *  (Stripe recevrait 200, ne rejouerait plus jamais, et l'abonnement local resterait divergent de
 *  Stripe pour toujours). Doit échouer (non-2xx) pour que Stripe rejoue l'événement après correction
 *  du registre. */
export class StripeUnrecognizedPriceError extends DomainError {
  readonly code = "STRIPE_UNRECOGNIZED_PRICE";
  constructor(priceId: string) {
    super(`Stripe subscription event references an unrecognized Price ID: ${priceId}`);
  }
}
