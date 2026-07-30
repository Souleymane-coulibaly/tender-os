import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { AuditLogWriter, KnowledgeAuditLogEntry } from "../application/ports/audit-log-writer";
import { writeKnowledgeAuditLogTx } from "./knowledge-audit.tx-helpers";

/** Écrit dans `audit_logs` — mécanisme canonique déjà établi, même motif que DCE/Extraction/
 *  Documents/Tenders/Analysis (BR-GEN-002). Ne journalise jamais le contenu complet d'un document
 *  ou d'un chunk (mission §"Observabilité" — jamais de contenu confidentiel dans les logs).
 *  Réservé aux opérations pour lesquelles l'audit N'A PAS besoin d'être atomique avec la mutation
 *  métier (archive, restore, tags, reprocess, update) — voir `knowledge-audit.tx-helpers.ts` pour
 *  le chemin transactionnel utilisé par create/add-document/delete. */
@Injectable()
export class PrismaAuditLogWriter implements AuditLogWriter {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: KnowledgeAuditLogEntry): Promise<void> {
    await writeKnowledgeAuditLogTx(this.prisma, entry);
  }
}
