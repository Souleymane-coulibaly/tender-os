import { PassPurchaseAlreadyConsumedError, PassPurchaseAlreadyReservedError, PassPurchaseNotAvailableError } from "./errors";
import { PassPurchaseStatus } from "./pass-purchase-status";

export type PassPurchaseProps = {
  id: string;
  organizationId: string;
  status: PassPurchaseStatus;
  externalReference: string;
  priceCents: number;
  currency: string;
  purchasedAt: Date;
  expiresAt?: Date | undefined;
  /** Checkpoint TENDEROS-2.1-P2.3-E1.2 — affectation au premier usage métier payant du Tender,
   *  DISTINCTE de la consommation commerciale finale (`consumedTenderId`/`consumedAt`). Voir
   *  `reserveForTender`. */
  reservedTenderId?: string | undefined;
  reservedAt?: Date | undefined;
  consumedTenderId?: string | undefined;
  consumedAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * V2 Sprint 22 (billing, étape 22A) — une unité de Pass individuellement traçable (mission
 * §6/§7/§36). Consommation IRRÉVERSIBLE dans le cours normal (`consumeForTender`) : aucune méthode
 * de déconsommation n'existe sur cet agrégat — "une correction exceptionnelle doit passer par
 * Platform Admin et être auditée" (mission §7) est délibérément hors du chemin normal, jamais un
 * simple appel supplémentaire ici.
 */
export class PassPurchase {
  private constructor(private props: PassPurchaseProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    externalReference: string;
    priceCents: number;
    currency: string;
    expiresAt?: Date | undefined;
    occurredAt: Date;
  }): PassPurchase {
    return new PassPurchase({
      id: input.id,
      organizationId: input.organizationId,
      status: PassPurchaseStatus.Available,
      externalReference: input.externalReference,
      priceCents: input.priceCents,
      currency: input.currency,
      purchasedAt: input.occurredAt,
      expiresAt: input.expiresAt,
      reservedTenderId: undefined,
      reservedAt: undefined,
      consumedTenderId: undefined,
      consumedAt: undefined,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static reconstitute(props: PassPurchaseProps): PassPurchase {
    return new PassPurchase(props);
  }

  /**
   * Checkpoint TENDEROS-2.1-P2.3-E1.2 — mission "1 Pass AO = 1 Tender / 1 AO" : affecte ce Pass au
   * premier usage métier payant d'un Tender, AVANT toute consommation commerciale (qui reste au
   * premier dépôt réussi, voir `consumeForTender`). Idempotent pour le MÊME Tender (rejoue sans
   * effet — mission "aucune reconsommation") ; refuse explicitement un second Tender différent,
   * qu'il soit déjà RESERVED ou déjà CONSUMED (mission — un Pass ne couvre jamais deux Tenders).
   * L'atomicité RÉELLE sous concurrence (deux Tenders réclamant le même Pass simultanément) est
   * garantie côté repository (compare-and-set SQL + index unique partiel), jamais par cet agrégat
   * seul — cette méthode encode l'invariant métier, pas la garantie de concurrence.
   */
  reserveForTender(tenderId: string, occurredAt: Date): void {
    if (this.props.status === PassPurchaseStatus.Consumed) {
      if (this.props.consumedTenderId === tenderId) {
        return;
      }
      throw new PassPurchaseAlreadyConsumedError(this.props.id, this.props.consumedTenderId ?? "unknown");
    }
    if (this.props.status === PassPurchaseStatus.Reserved) {
      if (this.props.reservedTenderId === tenderId) {
        return;
      }
      throw new PassPurchaseAlreadyReservedError(this.props.id, this.props.reservedTenderId ?? "unknown");
    }
    this.props = {
      ...this.props,
      status: PassPurchaseStatus.Reserved,
      reservedTenderId: tenderId,
      reservedAt: occurredAt,
      updatedAt: occurredAt,
    };
  }

  /** Idempotent pour le MÊME Tender (mission §7 "réimports/ré-analyses ne consomment jamais un
   *  nouveau Pass") ; refuse explicitement un second Tender différent. Transition valide depuis
   *  AVAILABLE (legacy — Pass jamais passé par `reserveForTender`) OU RESERVED pour ce même Tender
   *  (chemin nominal E1.2) — jamais depuis RESERVED pour un AUTRE Tender. */
  consumeForTender(tenderId: string, occurredAt: Date): void {
    if (this.props.status === PassPurchaseStatus.Consumed) {
      if (this.props.consumedTenderId === tenderId) {
        return;
      }
      throw new PassPurchaseAlreadyConsumedError(this.props.id, this.props.consumedTenderId ?? "unknown");
    }
    if (this.props.status === PassPurchaseStatus.Reserved && this.props.reservedTenderId !== tenderId) {
      throw new PassPurchaseAlreadyReservedError(this.props.id, this.props.reservedTenderId ?? "unknown");
    }
    this.props = {
      ...this.props,
      status: PassPurchaseStatus.Consumed,
      consumedTenderId: tenderId,
      consumedAt: occurredAt,
      updatedAt: occurredAt,
    };
  }

  /**
   * Checkpoint TENDEROS-2.1-P2.3-E1.3 — mission §5 (RELEASE PASS) : libère un Pass RESERVED (jamais
   * CONSUMED) pour repasser AVAILABLE. Idempotent et tenant-safe : no-op silencieux si déjà libéré,
   * jamais réservé, ou réservé pour un AUTRE Tender que celui passé en argument (jamais une
   * exception — l'appelant ne relâche TOUJOURS que SA PROPRE réservation ; un mismatch signale un
   * bug appelant, pas un état à corriger ici). Structurellement IMPOSSIBLE depuis CONSUMED (mission
   * "libération impossible après CONSUMED") : le statut CONSUMED ne satisfait jamais la condition
   * `status === Reserved`, donc cette méthode ne fait jamais régresser un Pass déjà consommé — même
   * garantie renforcée côté repository par le compare-and-set SQL (`WHERE status = 'RESERVED'`, un
   * Pass CONSUMED ne peut structurellement jamais matcher cette clause).
   */
  releaseReservation(tenderId: string, occurredAt: Date): void {
    if (this.props.status !== PassPurchaseStatus.Reserved || this.props.reservedTenderId !== tenderId) {
      return;
    }
    this.props = {
      ...this.props,
      status: PassPurchaseStatus.Available,
      reservedTenderId: undefined,
      reservedAt: undefined,
      updatedAt: occurredAt,
    };
  }

  assertAvailable(): void {
    if (this.props.status !== PassPurchaseStatus.Available) {
      throw new PassPurchaseNotAvailableError(this.props.id);
    }
  }

  get id(): string {
    return this.props.id;
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get status(): PassPurchaseStatus {
    return this.props.status;
  }

  get consumedTenderId(): string | undefined {
    return this.props.consumedTenderId;
  }

  get reservedTenderId(): string | undefined {
    return this.props.reservedTenderId;
  }

  get expiresAt(): Date | undefined {
    return this.props.expiresAt;
  }

  /** Usable = consommable OU déjà RESERVED/CONSUMED pour CE tender (mission §7 : réimports ne
   *  recréent jamais un besoin de Pass). Un Pass expiré ne peut plus être consommé pour un NOUVEAU
   *  tender, mais reste indéfiniment usable pour celui auquel il est déjà attaché (mission §9 :
   *  jamais une suppression de données à l'expiration). */
  isUsableForTender(tenderId: string, now: Date): boolean {
    if (this.props.status === PassPurchaseStatus.Consumed) {
      return this.props.consumedTenderId === tenderId;
    }
    if (this.props.status === PassPurchaseStatus.Reserved) {
      return this.props.reservedTenderId === tenderId;
    }
    const expired = this.props.expiresAt !== undefined && this.props.expiresAt.getTime() <= now.getTime();
    return !expired;
  }

  toProps(): PassPurchaseProps {
    return { ...this.props };
  }
}
