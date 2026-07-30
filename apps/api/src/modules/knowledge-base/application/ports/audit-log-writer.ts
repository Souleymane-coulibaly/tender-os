export type KnowledgeAuditLogEntry = Readonly<{
  organizationId: string;
  actorType: "USER" | "SYSTEM";
  actorId?: string | undefined;
  action: string;
  resourceType: string;
  resourceId: string;
  requestId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}>;

/** Écrit dans `audit_logs` (mécanisme canonique déjà établi) — même motif que DCE/Extraction/
 *  Documents/Tenders/Analysis : chaque module possède son propre port + adaptateur Prisma. */
export interface AuditLogWriter {
  record(entry: KnowledgeAuditLogEntry): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol("KNOWLEDGE_AUDIT_LOG_WRITER");
