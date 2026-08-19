import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { AuditLogWriter, CandidateAuditLogEntry } from "../application/ports/audit-log-writer";
import { writeCandidateCompanyAuditLogTx } from "./candidate-company-audit.tx-helpers";

@Injectable()
export class PrismaAuditLogWriter implements AuditLogWriter {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: CandidateAuditLogEntry): Promise<void> {
    await writeCandidateCompanyAuditLogTx(this.prisma, entry);
  }
}
