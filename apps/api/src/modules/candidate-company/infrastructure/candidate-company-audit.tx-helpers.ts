import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { CandidateAuditLogEntry } from "../application/ports/audit-log-writer";

export type CandidateCompanyAuditTxClient = Prisma.TransactionClient;

/** Écrit une entrée d'audit — même motif que `client-portfolio-audit.tx-helpers.ts` : une seule
 *  implémentation, appelable aussi bien hors transaction (chemin standard) que dans une transaction
 *  déjà ouverte si un futur use case en a besoin. */
export async function writeCandidateCompanyAuditLogTx(tx: CandidateCompanyAuditTxClient, entry: CandidateAuditLogEntry): Promise<void> {
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
