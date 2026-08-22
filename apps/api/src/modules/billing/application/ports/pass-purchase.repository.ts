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
   *  n'est jamais couvert par deux Pass à la fois, mission ne le prévoit pas). Reste strictement
   *  CONSUMED (jamais RESERVED) — utilisé par l'idempotence de CONSOMMATION
   *  (`ConsumeAoCreditUseCase`), qui ne doit jamais confondre "réservé" et "consommé". */
  findByTenderId(organizationId: string, tenderId: string): Promise<PassPurchase | null>;
  /** Checkpoint TENDEROS-2.1-P2.3-E1.2 — RESERVED ou CONSUMED pour CE tenderId ("affecté" au sens
   *  large). Utilisé par `EntitlementService.canOperateOnTender` (le Pass est-il déjà affecté à ce
   *  Tender, qu'il ait ou non déjà été consommé) et par `ConsumeAoCreditUseCase` pour retrouver LE
   *  Pass réservé à consommer au premier dépôt — jamais un Pass arbitraire différent. */
  findAssignedToTender(organizationId: string, tenderId: string): Promise<PassPurchase | null>;
  existsForOrganization(organizationId: string): Promise<boolean>;
  /** V2 Sprint 22B — le premier Pass AVAILABLE (non expiré) de l'organisation. `null` si aucun Pass
   *  utilisable. Checkpoint P2.3-E1.2 : n'est plus utilisé pour choisir quel Pass CONSOMMER (voir
   *  `findAssignedToTender`) — reste utilisé pour la résolution du palier effectif de l'organisation
   *  (`getEffectivePlanTier`) et par `reserveForTender` en interne. */
  findFirstAvailable(organizationId: string, now: Date): Promise<PassPurchase | null>;
  list(organizationId: string, options: { cursor?: string | undefined; limit: number }): Promise<PassPurchasePage>;
  /** Insertion pure ; l'idempotence sur `externalReference` est gérée par l'appelant (contrainte
   *  unique en base, capturée via `PassPurchaseExternalReferenceConflictError`). */
  create(purchase: PassPurchase): Promise<void>;
  /**
   * Checkpoint TENDEROS-2.1-P2.3-E1.2 — mission "1 Pass AO = 1 Tender / 1 AO" : affecte
   * ATOMIQUEMENT un Pass AVAILABLE de l'organisation à CE tenderId (AVANT toute consommation
   * commerciale). Idempotent si un Pass est déjà RESERVED ou CONSUMED pour ce MÊME tenderId
   * (`applied: true`, ce Pass est retourné tel quel, jamais une seconde réservation). `applied:
   * false` signifie "aucun Pass disponible à réserver" — jamais une exception, l'appelant décide.
   *
   * Atomicité RÉELLE sous concurrence (mission §1, "ne pas implémenter uniquement findFirstAvailable
   * puis update sans protection") : chaque tentative est un compare-and-set SQL sur UNE ligne précise
   * (`WHERE id = ... AND status = 'AVAILABLE'`, même motif que `consumeForTender`) — sous deux
   * Tenders réclamant le MÊME Pass simultanément, seul l'un des deux UPDATE peut réussir sur cette
   * ligne. Un second garde-fou protège le cas à plusieurs Pass disponibles (deux appels concurrents
   * pour le MÊME tenderId réservant chacun un Pass DIFFÉRENT) : l'index unique partiel `(organization_id,
   * reserved_tender_id) WHERE status = 'RESERVED'` fait échouer le second UPDATE, dont la ligne
   * reste alors AVAILABLE (rollback du seul statement, jamais un état orphelin).
   */
  reserveForTender(input: { organizationId: string; tenderId: string; now: Date }): Promise<{ applied: boolean; purchase: PassPurchase | null }>;
  /** Compare-and-set : n'applique la transition QUE si la ligne est encore AVAILABLE, déjà RESERVED
   *  pour CE MÊME tenderId (chemin nominal E1.2), ou déjà CONSUMED pour CE MÊME tenderId (idempotence
   *  réimport, mission §7). `applied: false` signifie "déjà affecté (réservé ou consommé) à un autre
   *  Tender" — jamais une exception, l'appelant décide. */
  consumeForTender(input: {
    organizationId: string;
    passPurchaseId: string;
    tenderId: string;
    occurredAt: Date;
  }): Promise<{ applied: boolean; purchase: PassPurchase | null }>;
  /**
   * Checkpoint TENDEROS-2.1-P2.3-E1.3, mission §4/§5 — compare-and-set symétrique de
   * `reserveForTender` : ne fait régresser RESERVED -> AVAILABLE que si la ligne est ENCORE RESERVED
   * pour CE MÊME tenderId au moment de l'appel (`WHERE status = 'RESERVED' AND reserved_tender_id =
   * tenderId`) — un Pass déjà CONSUMED pour ce Tender (course gagnée par la consommation entre-temps)
   * ne matche structurellement jamais cette clause, rendant la libération IMPOSSIBLE après
   * consommation par construction, jamais seulement par convention applicative. `applied: false`
   * signifie "rien à libérer" (déjà libéré, déjà consommé, ou jamais réservé pour ce Tender) —
   * jamais une exception, toujours idempotent.
   */
  releaseReservation(input: {
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
