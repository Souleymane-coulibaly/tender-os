export type TenderActivityEntry = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  type: string;
  summary: string;
  metadata?: Record<string, unknown> | undefined;
}>;

/** V2 Sprint 18 (mission §22 "package validé doit alimenter TenderActivity") — écrit directement
 *  dans `tender_activities` (table déjà créée par `workspace`, Sprint 7), même motif volontairement
 *  répété que `AuditLogWriter` local à ce module (voir ce fichier) : jamais un import du module
 *  `workspace` complet pour une seule écriture (éviterait un couplage fort entre deux modules déjà
 *  reliés dans l'autre sens — `workspace` importe `response-package` au Sprint 18 pour la
 *  validation de cible ApprovalRequest, un import inverse créerait un cycle). `type` doit rester
 *  dans le catalogue gouverné de `tender_activities_type_check` (`workspace/domain/tender-activity-
 *  type.ts`), sans dépendance TypeScript directe sur ce fichier pour éviter le cycle de module. */
export interface TenderActivityWriter {
  record(entry: TenderActivityEntry): Promise<void>;
}

export const TENDER_ACTIVITY_WRITER = Symbol("RESPONSE_PACKAGE_TENDER_ACTIVITY_WRITER");
