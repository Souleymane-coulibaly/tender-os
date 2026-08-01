import { Decimal } from "@prisma/client/runtime/library";
import { AmountTooLargeError, CurrencyMismatchError, InvalidCurrencyError, InvalidMoneyAmountError, NegativeAmountNotAllowedError } from "./errors";
import { isSupportedCurrency } from "./supported-currency";

/** Plafond défensif (mission §"limites maximum, overflow") — aucun montant réel de ce périmètre
 *  n'approche cette valeur ; sert uniquement à rejeter une entrée aberrante avant persistance. */
const MAX_AMOUNT = new Decimal("999999999999.999999");

/** Mission Sprint 7 §"Money et Decimal" — même discipline que `AiModelPricingSnapshot` (ai-benchmark,
 *  Sprint 5.2) : `Decimal` de `@prisma/client/runtime/library` est un utilitaire de calcul (decimal.js),
 *  pas du code ORM — précédent déjà établi dans ce dépôt pour garder le domaine sans dépendance
 *  Prisma réelle (pas de client, pas de requête, pas de schéma). Jamais `Number(...)` pour un
 *  montant financier (imprécision en virgule flottante). Précision interne haute ; l'arrondi
 *  d'affichage est une responsabilité de présentation, jamais du domaine (mission §"Persistence :
 *  précision suffisante pour éviter les pertes").
 */
export class Money {
  private constructor(
    private readonly decimalAmount: Decimal,
    private readonly currencyCode: string,
  ) {}

  static create(input: { amount: string | number; currency: string }): Money {
    const currency = normalizeCurrency(input.currency);

    let decimalAmount: Decimal;
    try {
      decimalAmount = new Decimal(input.amount);
    } catch {
      throw new InvalidMoneyAmountError(String(input.amount));
    }
    if (!decimalAmount.isFinite()) {
      throw new InvalidMoneyAmountError(String(input.amount));
    }
    if (decimalAmount.isNegative()) {
      throw new NegativeAmountNotAllowedError();
    }
    if (decimalAmount.greaterThan(MAX_AMOUNT)) {
      throw new AmountTooLargeError();
    }

    return new Money(decimalAmount, currency);
  }

  static zero(currency: string): Money {
    return new Money(new Decimal(0), normalizeCurrency(currency));
  }

  /** Jamais une conversion — additionne deux montants de la MÊME devise uniquement (mission
   *  §"aucune agrégation directe entre devises différentes... erreur explicite"). */
  add(other: Money): Money {
    if (other.currencyCode !== this.currencyCode) {
      throw new CurrencyMismatchError({ expected: this.currencyCode, actual: other.currencyCode });
    }
    return Money.create({ amount: this.decimalAmount.plus(other.decimalAmount).toFixed(6), currency: this.currencyCode });
  }

  multiply(factor: string | number): Money {
    return Money.create({ amount: this.decimalAmount.times(factor).toFixed(6), currency: this.currencyCode });
  }

  /** Réaudit Codex Sprint 7 — "Decimal compromis par Number(...)" : écart SIGNÉ (`this - other`),
   *  calculé exclusivement en `Decimal`, jamais un `Number` intermédiaire (imprécision en virgule
   *  flottante sur de très petits ou très grands montants, ou des décimales longues). Retourne une
   *  chaîne Decimal signée, jamais un nouveau `Money` : un écart peut être négatif (cas métier
   *  explicite, mission §"valeurs négatives interdites SAUF cas métier explicite" — comparer un
   *  coût estimé à un coût réel en est un), ce que `Money` interdit structurellement ailleurs. */
  differenceFrom(other: Money): string {
    if (other.currencyCode !== this.currencyCode) {
      throw new CurrencyMismatchError({ expected: this.currencyCode, actual: other.currencyCode });
    }
    return this.decimalAmount.minus(other.decimalAmount).toFixed(6);
  }

  /** Écart signé (`this - other`) exprimé en pourcentage de `other`, exclusivement en `Decimal`.
   *  `undefined` si `other` vaut zéro (mission §"ne pas diviser par zéro") — jamais une exception,
   *  jamais une valeur inventée. */
  percentageDifferenceFrom(other: Money): string | undefined {
    if (other.currencyCode !== this.currencyCode) {
      throw new CurrencyMismatchError({ expected: this.currencyCode, actual: other.currencyCode });
    }
    if (other.decimalAmount.isZero()) return undefined;
    return this.decimalAmount.minus(other.decimalAmount).dividedBy(other.decimalAmount).times(100).toFixed(2);
  }

  get isZero(): boolean {
    return this.decimalAmount.isZero();
  }

  get currency(): string {
    return this.currencyCode;
  }

  /** Précision de persistance (mission §"Decimal(14,6)" déjà en usage dans ce dépôt pour un coût IA
   *  — voir `Generation.estimatedCostAmount`/`RoutingDecision.actualCostAmount`). */
  toFixed(): string {
    return this.decimalAmount.toFixed(6);
  }

  /** Arrondi d'affichage monétaire (2 décimales) — jamais utilisé pour un calcul ou une persistance,
   *  uniquement pour une présentation lisible (mission §"Affichage : arrondi monétaire adapté"). */
  toDisplayString(): string {
    return this.decimalAmount.toFixed(2);
  }
}

/** Réaudit Codex Sprint 7 — "devise non validée ISO/supportée" : le format 3-lettres seul acceptait
 *  n'importe quelle chaîne syntaxiquement plausible (`"XYZ"`, `"ZZZ"`...), jamais une devise réelle
 *  ni gérée par TenderOS. Rejette désormais explicitement toute devise absente de
 *  `SUPPORTED_CURRENCIES` — une chaîne vide échoue déjà au test de format (aucun cas particulier
 *  nécessaire), jamais un repli silencieux sur EUR. */
function normalizeCurrency(currency: string): string {
  const normalized = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new InvalidCurrencyError(currency);
  }
  if (!isSupportedCurrency(normalized)) {
    throw new InvalidCurrencyError(currency);
  }
  return normalized;
}
