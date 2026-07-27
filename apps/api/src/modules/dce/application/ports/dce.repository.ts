import type { Dce } from "../../domain/dce.aggregate";

/**
 * Un Tender ne porte jamais plus d'un DCE (conception §4) : `findByTenderId` est donc la voie
 * d'accès principale (create-or-get), `findById` ne sert qu'aux opérations déjà scopées par
 * dceId (import, liste des fichiers, etc.).
 */
export interface DceRepository {
  findById(input: { organizationId: string; dceId: string }): Promise<Dce | null>;
  findByTenderId(input: { organizationId: string; tenderId: string }): Promise<Dce | null>;
  create(dce: Dce): Promise<Dce>;
  /** Persiste une transition de statut déjà validée par l'agrégat (markImported). */
  save(dce: Dce): Promise<void>;
}

export const DCE_REPOSITORY = Symbol("DCE_REPOSITORY");
