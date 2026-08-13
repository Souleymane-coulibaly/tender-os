import { PassPurchaseAlreadyConsumedError, PassPurchaseNotAvailableError } from "./errors";
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
      consumedTenderId: undefined,
      consumedAt: undefined,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static reconstitute(props: PassPurchaseProps): PassPurchase {
    return new PassPurchase(props);
  }

  /** Idempotent pour le MÊME Tender (mission §7 "réimports/ré-analyses ne consomment jamais un
   *  nouveau Pass") ; refuse explicitement un second Tender différent. */
  consumeForTender(tenderId: string, occurredAt: Date): void {
    if (this.props.status === PassPurchaseStatus.Consumed) {
      if (this.props.consumedTenderId === tenderId) {
        return;
      }
      throw new PassPurchaseAlreadyConsumedError(this.props.id, this.props.consumedTenderId ?? "unknown");
    }
    this.props = {
      ...this.props,
      status: PassPurchaseStatus.Consumed,
      consumedTenderId: tenderId,
      consumedAt: occurredAt,
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

  get expiresAt(): Date | undefined {
    return this.props.expiresAt;
  }

  /** Usable = consommable OU déjà consommé pour CE tender (mission §7 : réimports ne recréent
   *  jamais un besoin de Pass). Un Pass expiré ne peut plus être consommé pour un NOUVEAU tender,
   *  mais reste indéfiniment usable pour celui auquel il est déjà attaché (mission §9 : jamais une
   *  suppression de données à l'expiration). */
  isUsableForTender(tenderId: string, now: Date): boolean {
    if (this.props.status === PassPurchaseStatus.Consumed) {
      return this.props.consumedTenderId === tenderId;
    }
    const expired = this.props.expiresAt !== undefined && this.props.expiresAt.getTime() <= now.getTime();
    return !expired;
  }

  toProps(): PassPurchaseProps {
    return { ...this.props };
  }
}
