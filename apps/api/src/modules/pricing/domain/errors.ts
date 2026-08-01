import { DomainError } from "../../../shared-kernel/domain-error";

export class InvalidMoneyAmountError extends DomainError {
  readonly code = "INVALID_MONEY_AMOUNT";
  constructor(value: string) {
    super(`"${value}" is not a valid monetary amount.`);
  }
}

/** Mission Sprint 7 §"valeurs négatives interdites sauf cas métier explicite" — jamais de montant
 *  négatif sans un cas métier explicitement modélisé (aucun n'existe dans cette tranche). */
export class NegativeAmountNotAllowedError extends DomainError {
  readonly code = "NEGATIVE_AMOUNT_NOT_ALLOWED";
  constructor() {
    super("A monetary amount cannot be negative.");
  }
}

export class AmountTooLargeError extends DomainError {
  readonly code = "AMOUNT_TOO_LARGE";
  constructor() {
    super("This monetary amount exceeds the maximum supported value.");
  }
}

export class InvalidCurrencyError extends DomainError {
  readonly code = "INVALID_CURRENCY";
  constructor(value: string) {
    super(`"${value}" is not a supported currency code (ISO 4217, 3 letters).`);
  }
}

/** Mission Sprint 7 §"Devise" — "aucune agrégation directe entre devises différentes... erreur
 *  explicite en cas de mélange de devises". Jamais une conversion silencieuse. */
export class CurrencyMismatchError extends DomainError {
  readonly code = "CURRENCY_MISMATCH";
  constructor(input: { expected: string; actual: string }) {
    super(`Cannot combine amounts in different currencies (${input.expected} vs ${input.actual}).`);
  }
}

export class InvalidPricingAssumptionError extends DomainError {
  readonly code = "INVALID_PRICING_ASSUMPTION";
  constructor(reason: string) {
    super(`Invalid pricing assumption: ${reason}.`);
  }
}

export class PricingEstimateNotFoundError extends DomainError {
  readonly code = "PRICING_ESTIMATE_NOT_FOUND";
  constructor() {
    super("Pricing estimate not found.");
  }
}

export class PricingEstimateArchivedError extends DomainError {
  readonly code = "PRICING_ESTIMATE_ARCHIVED";
  constructor() {
    super("This pricing estimate is archived; recalculate is no longer possible.");
  }
}

/** Traduit une violation de la contrainte unique `(estimateId, version)` — deux recalculs
 *  concurrents sur la même estimation, jamais une exception Prisma brute remontée à l'appelant
 *  (mission §"Concurrence et idempotence" : "deux versions créées simultanément"). */
export class PricingEstimateConcurrentRecalculationError extends DomainError {
  readonly code = "PRICING_ESTIMATE_CONCURRENT_RECALCULATION";
  constructor() {
    super("Another recalculation for this estimate is already in progress; reload and retry.");
  }
}

export class PricingEstimateVersionNotFoundError extends DomainError {
  readonly code = "PRICING_ESTIMATE_VERSION_NOT_FOUND";
  constructor() {
    super("Pricing estimate version not found.");
  }
}

/** Mission Sprint 7 §"Ne mélange pas coût réel / estimation / prix prévisionnel" — un scope
 *  d'estimation doit référencer un Tender/client de la MÊME organisation, jamais une ressource
 *  d'un autre tenant/client (audit-007, jamais une simple vérification applicative seule). */
export class InvalidPricingScopeError extends DomainError {
  readonly code = "INVALID_PRICING_SCOPE";
  constructor(reason: string) {
    super(`Invalid pricing scope: ${reason}.`);
  }
}

export class PricingPermissionMissingError extends DomainError {
  readonly code = "PRICING_PERMISSION_MISSING";
  constructor(input: { permission: string }) {
    super(`Missing permission: ${input.permission}.`);
  }
}
