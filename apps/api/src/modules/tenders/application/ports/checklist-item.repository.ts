import type { ChecklistItem } from "../../domain/checklist-item.entity";

export interface ChecklistItemRepository {
  findById(input: { organizationId: string; tenderId: string; itemId: string }): Promise<ChecklistItem | null>;
  listByTender(input: { organizationId: string; tenderId: string }): Promise<ChecklistItem[]>;
  listByTenderIds(input: { organizationId: string; tenderIds: readonly string[] }): Promise<ChecklistItem[]>;
  save(item: ChecklistItem): Promise<void>;
  /** V2 Sprint 6 (correctif audit Codex P1 — dédoublonnage IA non protégé contre la concurrence) —
   *  verrou transactionnel Postgres (`pg_advisory_xact_lock`, libéré automatiquement au commit/
   *  rollback de la transaction ambiante) scopé `(organizationId, tenderId)`. `findChecklistDedupMatch`
   *  fait un `listByTender` puis compare en mémoire : sans ce verrou, deux acceptations concurrentes
   *  de suggestions distinctes décrivant la même exigence (RC + CCAP) peuvent toutes deux lire "aucune
   *  correspondance" avant que l'une des deux n'ait committé, et créer deux `ChecklistItem` au lieu
   *  d'ajouter une seconde source à un item unique. Le verrou sérialise ces séquences lire-puis-écrire
   *  par Tender ; en isolation READ COMMITTED (défaut Postgres/Prisma, jamais changé dans ce dépôt),
   *  la transaction qui attend voit bien la ligne fraîchement committée dès qu'elle obtient le
   *  verrou, car la visibilité est réévaluée à chaque instruction. N'est appelé que pour les
   *  créations d'origine IA (seul chemin qui exécute `findChecklistDedupMatch`). */
  lockTenderForDedup(input: { organizationId: string; tenderId: string }): Promise<void>;
}

export const CHECKLIST_ITEM_REPOSITORY = Symbol("CHECKLIST_ITEM_REPOSITORY");
