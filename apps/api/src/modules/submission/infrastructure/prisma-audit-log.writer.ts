import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { AuditLogWriter, SubmissionAuditLogEntry } from "../application/ports/audit-log-writer";

@Injectable()
export class PrismaAuditLogWriter implements AuditLogWriter {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: SubmissionAuditLogEntry): Promise<void> {
    // Checkpoint P2.3-E1.1, FINDING 4 — `currentClient()` (jamais `this.prisma` brut) : rejoint la
    // transaction ambiante ouverte par `RecordTenderSubmissionUseCase` (consommation AO + Submission
    // + audit désormais atomiques ensemble), même motif que `tenders/infrastructure/prisma-audit-log.writer.ts`.
    await this.prisma.currentClient().auditLog.create({
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
