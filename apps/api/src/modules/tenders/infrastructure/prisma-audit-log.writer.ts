import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { AuditLogWriter, TenderAuditLogEntry } from "../application/ports/audit-log-writer";

/** Écrit dans `audit_logs` avec `actorType: "USER"` — mécanisme canonique déjà établi (BR-GEN-002). */
@Injectable()
export class PrismaAuditLogWriter implements AuditLogWriter {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: TenderAuditLogEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        id: randomUUID(),
        organizationId: entry.organizationId,
        actorType: "USER",
        actorId: entry.actorId,
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
