export type ExtractionAuditLogEntry = Readonly<{
  organizationId: string;
  /** "SYSTEM" pour une action déclenchée par le traitement en tâche de fond (aucun acteur
   *  utilisateur, voir ProcessDocumentExtractionUseCase) — jamais un `actorId` inventé pour
   *  simuler un utilisateur : la colonne `actor_id` est un UUID réel ou rien. */
  actorType: "USER" | "SYSTEM";
  actorId?: string | undefined;
  action: string;
  resourceType: string;
  resourceId: string;
  requestId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}>;

/** Écrit dans `audit_logs` (mécanisme canonique déjà établi) — même motif que DCE/Documents/
 *  Tenders/Memberships : chaque module possède son propre port + adaptateur Prisma. */
export interface AuditLogWriter {
  record(entry: ExtractionAuditLogEntry): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol("AUDIT_LOG_WRITER");
