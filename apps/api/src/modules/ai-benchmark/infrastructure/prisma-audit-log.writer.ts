import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { AuditLogWriter, AiBenchmarkAuditLogEntry } from "../application/ports/audit-log-writer";

/** Écrit dans `audit_logs` — jamais le contenu d'un prompt/document/clé API en `metadata` (mission
 *  §"Ne pas loguer... clé API, document complet, prompt complet"), seuls des identifiants et rôles. */
@Injectable()
export class PrismaAuditLogWriter implements AuditLogWriter {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AiBenchmarkAuditLogEntry): Promise<void> {
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
