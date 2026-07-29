import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { AuditLogWriter, ExtractionAuditLogEntry } from "../application/ports/audit-log-writer";

/** Écrit dans `audit_logs` — mécanisme canonique déjà établi, même motif que DCE/Documents/
 *  Tenders (BR-GEN-002). `actorType` distingue une action utilisateur ("USER", `actorId` requis)
 *  d'une action système en tâche de fond ("SYSTEM", `actorId` absent) — la colonne `actor_id` est
 *  un UUID Postgres strict : jamais une valeur inventée comme "system". */
@Injectable()
export class PrismaAuditLogWriter implements AuditLogWriter {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: ExtractionAuditLogEntry): Promise<void> {
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
