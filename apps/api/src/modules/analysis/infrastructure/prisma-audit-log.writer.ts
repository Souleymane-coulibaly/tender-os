import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { AnalysisAuditLogEntry, AuditLogWriter } from "../application/ports/audit-log-writer";

/** Écrit dans `audit_logs` — mécanisme canonique déjà établi, même motif que DCE/Extraction/
 *  Documents/Tenders (BR-GEN-002). */
@Injectable()
export class PrismaAuditLogWriter implements AuditLogWriter {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AnalysisAuditLogEntry): Promise<void> {
    await this.prisma.auditLog.create({
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
}
