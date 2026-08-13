import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { AuditLogWriter, BillingAuditLogEntry } from "../application/ports/audit-log-writer";

/** Écrit dans `audit_logs` avec `actorType: "USER"` — mécanisme canonique déjà établi (BR-GEN-002),
 *  même motif que `opportunity/infrastructure/prisma-audit-log.writer.ts`. */
@Injectable()
export class PrismaAuditLogWriter implements AuditLogWriter {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: BillingAuditLogEntry): Promise<void> {
    await this.prisma.currentClient().auditLog.create({
      data: {
        id: randomUUID(),
        organizationId: entry.organizationId,
        actorType: "USER",
        actorId: entry.actorId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        result: "SUCCESS",
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}
