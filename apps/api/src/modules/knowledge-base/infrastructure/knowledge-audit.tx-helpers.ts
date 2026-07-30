import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { KnowledgeAuditLogEntry } from "../application/ports/audit-log-writer";

/** Client Prisma générique (transaction OU client top-level) — même motif que
 *  `knowledge-tag.tx-helpers.ts`. */
export type KnowledgeAuditTxClient = Prisma.TransactionClient;

/**
 * Écrit une entrée d'audit (mission "Corrections Sprint 5" — atomicité audit/mutation) — extrait
 * de `PrismaAuditLogWriter` pour être appelable DANS une transaction déjà ouverte. Une seule
 * implémentation, jamais deux logiques divergentes entre le chemin non-transactionnel
 * (`PrismaAuditLogWriter`, encore utilisé par les opérations qui ne l'exigent pas : archive,
 * restore, tags, reprocess, update) et le chemin atomique (`CreateKnowledgeEntryUseCase`,
 * `AddKnowledgeDocumentUseCase`, `DeleteKnowledgeEntryUseCase`, dont l'audit doit désormais
 * réussir OU échouer ENSEMBLE avec la mutation métier qu'il journalise — jamais une entrée créée
 * sans trace d'audit correspondante, jamais une trace d'audit sans la mutation qu'elle prétend
 * documenter).
 */
export async function writeKnowledgeAuditLogTx(tx: KnowledgeAuditTxClient, entry: KnowledgeAuditLogEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      id: randomUUID(),
      organizationId: entry.organizationId,
      actorType: entry.actorType,
      actorId: entry.actorId ?? null,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      result: "SUCCESS",
      requestId: entry.requestId ?? null,
      metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}
