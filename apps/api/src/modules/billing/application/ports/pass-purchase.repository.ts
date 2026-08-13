import type { PassPurchase } from "../../domain/pass-purchase.aggregate";

export type PassPurchasePage = Readonly<{ items: readonly PassPurchase[]; nextCursor: string | null }>;

/**
 * V2 Sprint 22 (billing, étape 22A) — une ligne par achat (jamais un solde mutable), voir
 * `PassPurchase`. `consumeForTender` est un compare-and-set ATOMIQUE côté SQL, jamais une
 * lecture-puis-écriture inconditionnelle (même motif que le correctif P1 `reclaimStaleGenerating`,
 * Sprint 21 — deux consommations concurrentes du même Pass pour deux Tenders différents ne doivent
 * jamais toutes les deux "réussir").
 */
export interface PassPurchaseRepository {
  findById(organizationId: string, id: string): Promise<PassPurchase | null>;
  findByExternalReference(externalReference: string): Promise<PassPurchase | null>;
  /** Un seul Pass peut être CONSUMED pour un tenderId donné (contrainte applicative — un Tender
   *  n'est jamais couvert par deux Pass à la fois, mission ne le prévoit pas). */
  findByTenderId(organizationId: string, tenderId: string): Promise<PassPurchase | null>;
  existsForOrganization(organizationId: string): Promise<boolean>;
  list(organizationId: string, options: { cursor?: string | undefined; limit: number }): Promise<PassPurchasePage>;
  /** Insertion pure ; l'idempotence sur `externalReference` est gérée par l'appelant (contrainte
   *  unique en base, capturée via `PassPurchaseExternalReferenceConflictError`). */
  create(purchase: PassPurchase): Promise<void>;
  /** Compare-and-set : n'applique la transition QUE si la ligne est encore AVAILABLE, ou déjà
   *  CONSUMED pour CE MÊME tenderId (idempotence réimport, mission §7). `applied: false` signifie
   *  "déjà consommé pour un autre Tender" — jamais une exception, l'appelant décide. */
  consumeForTender(input: {
    organizationId: string;
    passPurchaseId: string;
    tenderId: string;
    occurredAt: Date;
  }): Promise<{ applied: boolean; purchase: PassPurchase | null }>;
}

export const PASS_PURCHASE_REPOSITORY = Symbol("PASS_PURCHASE_REPOSITORY");

export class PassPurchaseExternalReferenceConflictError extends Error {
  constructor(externalReference: string) {
    super(`A pass purchase with external reference ${externalReference} already exists`);
    this.name = "PassPurchaseExternalReferenceConflictError";
  }
}
