import type { AoCreditLedgerEntry } from "../../domain/ao-credit-ledger-entry";

export type AoCreditLedgerPage = Readonly<{ items: readonly AoCreditLedgerEntry[]; nextCursor: string | null }>;

/**
 * V2 Sprint 22 (billing, étape 22B) — mission §16 : jamais un solde mutable seul, toujours une
 * entrée de ledger PAR mouvement. `balance`/le compteur mutable existe (nécessaire pour un
 * compare-and-set atomique sous concurrence réelle, même motif que
 * `PassPurchaseRepository.consumeForTender`, Sprint 21/22A), mais reste TOUJOURS écrit dans la
 * MÊME transaction que l'entrée de ledger correspondante — jamais l'un sans l'autre, jamais une
 * autorité indépendante du ledger.
 */
export interface AoCreditLedgerRepository {
  getBalance(organizationId: string): Promise<number>;

  /** Idempotent par (organizationId, period) — un second appel pour le MÊME mois ne grant jamais
   *  deux fois (contrainte unique partielle en base), `alreadyApplied: true` le signale à
   *  l'appelant (pour éviter un second AuditLog sur un simple rejeu). Plafonne `nominalAmount` par
   *  `rolloverCap` AU MOMENT du grant (mission §17) — le montant réellement appliqué
   *  (potentiellement 0) est celui enregistré dans l'entrée retournée, jamais le montant nominal
   *  demandé. */
  grant(input: { organizationId: string; period: string; nominalAmount: number; rolloverCap: number; occurredAt: Date }): Promise<{ entry: AoCreditLedgerEntry; alreadyApplied: boolean }>;

  /** Compare-and-set : `applied: false` signifie solde insuffisant, jamais une exception — c'est à
   *  l'appelant (`ConsumeAoCreditUseCase`) de traduire ça en refus métier. Jamais de solde négatif
   *  possible (mission §16, test de concurrence obligatoire). */
  consume(input: { organizationId: string; tenderId: string; amount: number; occurredAt: Date }): Promise<{ applied: boolean; entry: AoCreditLedgerEntry | null }>;

  adjust(input: { organizationId: string; amount: number; reason: string; actorPlatformAdministratorId: string; occurredAt: Date }): Promise<AoCreditLedgerEntry>;

  /** Annule la CONSUMPTION associée à ce `tenderId` (mission §7, symétrie Pass — "correction
   *  exceptionnelle... Platform Admin... auditée"). Refuse si aucune consommation trouvée pour ce
   *  Tender, ou si déjà reversée. */
  reverseConsumption(input: { organizationId: string; tenderId: string; reason: string; actorPlatformAdministratorId: string; occurredAt: Date }): Promise<AoCreditLedgerEntry>;

  findConsumptionByTenderId(organizationId: string, tenderId: string): Promise<AoCreditLedgerEntry | null>;
  findGrantByPeriod(organizationId: string, period: string): Promise<AoCreditLedgerEntry | null>;

  list(organizationId: string, options: { cursor?: string | undefined; limit: number }): Promise<AoCreditLedgerPage>;
}

export const AO_CREDIT_LEDGER_REPOSITORY = Symbol("AO_CREDIT_LEDGER_REPOSITORY");
