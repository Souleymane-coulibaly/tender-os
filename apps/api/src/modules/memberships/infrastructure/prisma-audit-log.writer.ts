import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { AuditLogEntry, AuditLogWriter } from "../application/ports/audit-log-writer";

/**
 * Écrit dans `audit_logs` (docs/04-architecture/DATABASE_DESIGN.md §21.1). Sous-ensemble
 * des colonnes documentées : ipAddress/userAgent/traceId ne sont pas encore alimentés
 * (aucune source fiable disponible dans le contexte actuel des use cases).
 */
@Injectable()
export class PrismaAuditLogWriter implements AuditLogWriter {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditLogEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        id: randomUUID(),
        organizationId: entry.organizationId,
        actorType: "USER",
        actorId: entry.actorId,
        action: entry.action,
        resourceType: "organization_membership",
        resourceId: entry.resourceId,
        result: "SUCCESS",
        requestId: entry.requestId ?? null,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}
