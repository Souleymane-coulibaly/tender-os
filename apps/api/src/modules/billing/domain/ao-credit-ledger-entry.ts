import { AoCreditMovementType } from "./ao-credit-movement-type";
import { AoCreditAdjustmentReasonRequiredError, InvalidAoCreditLedgerEntryError } from "./errors";

export type AoCreditLedgerEntry = Readonly<{
  id: string;
  organizationId: string;
  type: AoCreditMovementType;
  /** Delta RÉELLEMENT appliqué (jamais le montant nominal demandé) — un GRANT plafonné par le
   *  rollover cap enregistre le montant après plafonnement, jamais 0 silencieusement confondu avec
   *  le montant demandé (mission §17 "Business consumption example... next grant +10→60" implique
   *  un plafonnement au moment du GRANT, pas après). */
  amount: number;
  /** Solde APRÈS application de ce mouvement — lecture d'audit directe, jamais un recalcul. */
  balanceAfter: number;
  /** GRANT uniquement — "YYYY-MM", garantit l'idempotence par mois (contrainte unique partielle en
   *  base, voir migration). Toujours undefined pour les autres types. */
  period?: string | undefined;
  /** CONSUMPTION/REVERSAL — référence scalaire vers Tender.id, jamais une relation Prisma (même
   *  motif que `OrganizationPassPurchase.consumedTenderId`). */
  tenderId?: string | undefined;
  /** MANUAL_ADJUSTMENT/REVERSAL — obligatoire (mission §7/§35). */
  reason?: string | undefined;
  actorPlatformAdministratorId?: string | undefined;
  createdAt: Date;
}>;

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Construit une entrée valide — jamais d'instance créée hors de cette factory (garantit les
 *  invariants par type avant toute persistance). */
export function createAoCreditLedgerEntry(input: {
  id: string;
  organizationId: string;
  type: AoCreditMovementType;
  amount: number;
  balanceAfter: number;
  period?: string | undefined;
  tenderId?: string | undefined;
  reason?: string | undefined;
  actorPlatformAdministratorId?: string | undefined;
  occurredAt: Date;
}): AoCreditLedgerEntry {
  if (input.type === AoCreditMovementType.Grant) {
    if (input.period === undefined || !PERIOD_PATTERN.test(input.period)) {
      throw new InvalidAoCreditLedgerEntryError("GRANT requires a valid period (YYYY-MM)");
    }
    if (input.amount < 0) {
      throw new InvalidAoCreditLedgerEntryError("GRANT amount must never be negative");
    }
  }

  if (input.type === AoCreditMovementType.Consumption) {
    if (input.tenderId === undefined) {
      throw new InvalidAoCreditLedgerEntryError("CONSUMPTION requires a tenderId");
    }
    if (input.amount >= 0) {
      throw new InvalidAoCreditLedgerEntryError("CONSUMPTION amount must be negative");
    }
  }

  if (input.type === AoCreditMovementType.ManualAdjustment || input.type === AoCreditMovementType.Reversal) {
    if (!input.reason || input.reason.trim().length === 0) {
      throw new AoCreditAdjustmentReasonRequiredError();
    }
    if (input.actorPlatformAdministratorId === undefined) {
      throw new InvalidAoCreditLedgerEntryError(`${input.type} requires actorPlatformAdministratorId`);
    }
  }

  if (input.type === AoCreditMovementType.Reversal && input.tenderId === undefined) {
    throw new InvalidAoCreditLedgerEntryError("REVERSAL requires the original tenderId being reversed");
  }

  return {
    id: input.id,
    organizationId: input.organizationId,
    type: input.type,
    amount: input.amount,
    balanceAfter: input.balanceAfter,
    period: input.period,
    tenderId: input.tenderId,
    reason: input.reason,
    actorPlatformAdministratorId: input.actorPlatformAdministratorId,
    createdAt: input.occurredAt,
  };
}
