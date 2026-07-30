export type AnalysisAuditLogEntry = Readonly<{
  organizationId: string;
  /** "SYSTEM" pour une action déclenchée par le traitement en tâche de fond (aucun acteur
   *  utilisateur, voir ProcessAnalysisJobUseCase) — même motif que ExtractionAuditLogEntry. */
  actorType: "USER" | "SYSTEM";
  actorId?: string | undefined;
  action: string;
  resourceType: string;
  resourceId: string;
  requestId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}>;

/** Écrit dans `audit_logs` (mécanisme canonique déjà établi) — même motif que DCE/Extraction/
 *  Documents/Tenders/Memberships : chaque module possède son propre port + adaptateur Prisma. */
export interface AuditLogWriter {
  record(entry: AnalysisAuditLogEntry): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol("AUDIT_LOG_WRITER");
