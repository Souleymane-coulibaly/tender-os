import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { AuditLogWriter, DocumentAuditLogEntry } from "../application/ports/audit-log-writer";

/** Écrit dans `audit_logs` avec `actorType: "USER"` — mécanisme canonique déjà établi (BR-GEN-002).
 *  Aucun bus d'événements réel dans ce dépôt (voir conception §J) : ces entrées d'audit sont
 *  la seule trace applicative du cycle de vie des Documents. */
@Injectable()
export class PrismaAuditLogWriter implements AuditLogWriter {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: DocumentAuditLogEntry): Promise<void> {
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
