import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type {
  PlatformAuditLogEntry,
  PlatformAuditLogPage,
  PlatformAuditLogReader,
  PlatformAuditLogWriter,
} from "../application/ports/platform-audit-log.port";

/**
 * Écrit/lit `audit_logs` (docs/04-architecture/DATABASE_DESIGN.md §21.1) avec
 * `actorType: "PLATFORM_ADMIN"` — distingue les actions administratives plateforme
 * des actions tenant écrites par Memberships (`actorType: "USER"`).
 */
@Injectable()
export class PrismaPlatformAuditLog implements PlatformAuditLogWriter, PlatformAuditLogReader {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: PlatformAuditLogEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        id: randomUUID(),
        organizationId: entry.organizationId,
        actorType: "PLATFORM_ADMIN",
        actorId: entry.actorId,
        action: entry.action,
        resourceType: "organization",
        resourceId: entry.resourceId,
        result: "SUCCESS",
        requestId: entry.requestId ?? null,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async list(input: { cursor?: string | undefined; limit: number }): Promise<PlatformAuditLogPage> {
    const records = await this.prisma.auditLog.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    const hasNextPage = records.length > input.limit;
    const page = hasNextPage ? records.slice(0, input.limit) : records;

    return {
      items: page.map((record) => ({
        id: record.id,
        organizationId: record.organizationId,
        actorId: record.actorId,
        action: record.action,
        resourceType: record.resourceType,
        resourceId: record.resourceId,
        result: record.result,
        createdAt: record.createdAt.toISOString(),
      })),
      nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null,
    };
  }
}
