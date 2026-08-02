import type { DeliverableRevision } from "../../domain/deliverable-revision.aggregate";

export interface DeliverableRevisionRepository {
  create(revision: DeliverableRevision): Promise<void>;
  findById(input: { organizationId: string; revisionId: string }): Promise<DeliverableRevision | null>;
  findLatestBySection(input: { organizationId: string; deliverableSectionId: string }): Promise<DeliverableRevision | null>;
  listBySection(input: { organizationId: string; deliverableSectionId: string }): Promise<readonly DeliverableRevision[]>;
  /** Numéro de révision suivant pour cette section (mission §10 — jamais réutilisé, toujours croissant). */
  nextRevisionNumber(input: { organizationId: string; deliverableSectionId: string }): Promise<number>;
  /** Sauvegarde optimiste : la ligne DOIT correspondre à `expectedEditVersion` déjà décrémenté par
   *  l'agrégat (l'agrégat a déjà incrémenté `editVersion` en mémoire) — l'implémentation Prisma
   *  utilise `updateMany({ where: { id, editVersion: expectedEditVersion } })` et lève
   *  `RevisionEditConflictError` si `count === 0` (mission §18, jamais un écrasement silencieux). */
  saveWithOptimisticLock(input: { revision: DeliverableRevision; expectedEditVersion: number }): Promise<void>;
  /** Sauvegarde d'une transition de statut (submit/validate/request-changes/reject/archive) — pas
   *  de verrou optimiste requis ici (mission : ces transitions ne concurrencent jamais une édition
   *  de contenu, elles sont mutuellement exclusives par construction du statut DRAFT-only pour l'édition). */
  save(revision: DeliverableRevision): Promise<void>;
}

export const DELIVERABLE_REVISION_REPOSITORY = Symbol("DELIVERABLE_REVISION_REPOSITORY");
