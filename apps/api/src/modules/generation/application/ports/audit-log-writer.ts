export type GenerationAuditLogEntry = Readonly<{
  organizationId: string;
  actorType: "USER" | "SYSTEM";
  actorId?: string | undefined;
  action: string;
  resourceType: string;
  resourceId: string;
  requestId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}>;

/** Écrit dans `audit_logs` — même motif que chaque autre module (un port + un adaptateur Prisma
 *  propre à ce module). Jamais un prompt complet ni un contenu client dans `metadata` (mission
 *  §"Ne journalise jamais les prompts complets ou contenus clients sensibles"). */
export interface AuditLogWriter {
  record(entry: GenerationAuditLogEntry): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol("GENERATION_AUDIT_LOG_WRITER");
