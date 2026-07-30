import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { AuditLogWriter, ClientAuditLogEntry } from "../application/ports/audit-log-writer";
import { writeClientPortfolioAuditLogTx } from "./client-portfolio-audit.tx-helpers";

/** Écrit dans `audit_logs` (mécanisme canonique déjà établi) — jamais le contenu des notes/adresses
 *  d'un client (mission §"Observabilité" — jamais de donnée confidentielle dans les logs), voir les
 *  use cases : seuls des identifiants et des rôles sont passés en `metadata`. */
@Injectable()
export class PrismaAuditLogWriter implements AuditLogWriter {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: ClientAuditLogEntry): Promise<void> {
    await writeClientPortfolioAuditLogTx(this.prisma, entry);
  }
}
