import type { TenderLot } from "../../domain/tender-lot.entity";

export interface TenderLotRepository {
  /** Exclut toujours les lots supprimés (conception §C, §E) — jamais utilisé par Restore. */
  findById(input: { organizationId: string; tenderId: string; lotId: string }): Promise<TenderLot | null>;
  /** Seule méthode qui inclut les lots supprimés — réservée à RestoreTenderLot. */
  findByIdIncludingDeleted(input: {
    organizationId: string;
    tenderId: string;
    lotId: string;
  }): Promise<TenderLot | null>;
  /** Lots actifs uniquement, triés par displayOrder croissant. */
  listByTender(input: { organizationId: string; tenderId: string }): Promise<TenderLot[]>;
  /** Persiste un lot déjà existant (métadonnées, suppression logique) — jamais utilisé pour la
   *  création initiale ni la restauration, qui doivent calculer displayOrder de façon atomique
   *  (AUDIT-002, voir createAppendedAtEnd/restoreAppendedAtEnd). */
  save(lot: TenderLot): Promise<void>;
  /** Calcule displayOrder = max(actif) + 1 et persiste le lot en une seule transaction verrouillée
   *  par tenderId (verrou consultatif Postgres) — empêche toute collision de position entre
   *  créations concurrentes du même Tender (AUDIT-002). `lot` est construit avec un displayOrder
   *  provisoire, écrasé par la valeur calculée avant persistance. */
  createAppendedAtEnd(lot: TenderLot): Promise<TenderLot>;
  /** Même garantie d'atomicité pour la restauration : recalcule et persiste la position de fin de
   *  liste et l'état "non supprimé" en une seule transaction verrouillée (AUDIT-002). */
  restoreAppendedAtEnd(input: { lot: TenderLot; occurredAt: Date }): Promise<TenderLot>;
  /** Transaction unique réassignant displayOrder pour plusieurs lots — seul autre point d'entrée
   *  qui modifie displayOrder (conception §E, réordonnancement en lot). */
  saveReordered(lots: readonly TenderLot[]): Promise<void>;
}

export const TENDER_LOT_REPOSITORY = Symbol("TENDER_LOT_REPOSITORY");
