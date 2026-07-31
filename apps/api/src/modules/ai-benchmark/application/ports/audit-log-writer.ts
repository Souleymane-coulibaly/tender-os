export type AiBenchmarkAuditLogEntry = Readonly<{
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
 *  propre à ce module). Le registre de modèles est global mais toute mutation est déclenchée par un
 *  acteur au sein d'une organisation précise : c'est CETTE organisation qui est journalisée. */
export interface AuditLogWriter {
  record(entry: AiBenchmarkAuditLogEntry): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol("AI_BENCHMARK_AUDIT_LOG_WRITER");
