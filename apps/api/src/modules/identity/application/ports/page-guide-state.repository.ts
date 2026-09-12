import type { PageGuideState, PageGuideStateChanges } from "../../domain/page-guide-state.entity";

export type ApplyPageGuideStateChangesInput = Readonly<{
  /** Utilisé UNIQUEMENT si la ligne (userId, guideKey) n'existe pas encore. */
  id: string;
  userId: string;
  guideKey: string;
  changes: PageGuideStateChanges;
  occurredAt: Date;
}>;

/**
 * TENDEROS-2.1 (guides de page) — toujours filtré par `userId` (celui de l'acteur authentifié,
 * jamais une valeur issue de la requête) : aucune méthode ne permet de lire ou d'écrire l'état
 * d'un autre utilisateur.
 */
export interface PageGuideStateRepository {
  listByUser(userId: string): Promise<PageGuideState[]>;
  /** Upsert atomique sur (userId, guideKey) : crée la ligne ou n'écrit QUE les colonnes de
   *  `changes`, puis renvoie l'état résultant. */
  apply(input: ApplyPageGuideStateChangesInput): Promise<PageGuideState>;
}

export const PAGE_GUIDE_STATE_REPOSITORY = Symbol("PAGE_GUIDE_STATE_REPOSITORY");
