import type { TenderActivityType } from "../../domain/tender-activity-type";

export type TenderActivityRecord = {
  id: string;
  organizationId: string;
  tenderId: string;
  actorId: string;
  type: TenderActivityType;
  summary: string;
  metadata?: Record<string, unknown> | undefined;
  createdAt: Date;
};

export type CreateTenderActivityInput = Omit<TenderActivityRecord, "id" | "createdAt"> & { id: string; createdAt: Date };

export interface TenderActivityRepository {
  /** V2 Sprint 7 §51 — pagination stable `createdAt DESC, id DESC`, jamais de doublon entre pages. */
  listByTender(input: { organizationId: string; tenderId: string; cursor?: string | undefined; limit: number }): Promise<{ items: TenderActivityRecord[]; nextCursor: string | null }>;
  /** V2 Sprint 15 (Dashboard) — une seule requête groupée `WHERE tenderId IN (...)` plutôt qu'un
   *  `listByTender` par Tender (mission §54 "pas de N+1") : le flux d'activité portfolio du
   *  Dashboard agrège plusieurs Tenders déjà scopés ClientAccess par l'appelant (`tenderIds` reçu
   *  en entrée, jamais recalculé ici — même motif que `ChecklistItemRepository.listByTenderIds`). */
  listByTenderIds(input: { organizationId: string; tenderIds: readonly string[]; limit: number }): Promise<TenderActivityRecord[]>;
  create(activity: CreateTenderActivityInput): Promise<void>;
}

export const TENDER_ACTIVITY_REPOSITORY = Symbol("TENDER_ACTIVITY_REPOSITORY");
