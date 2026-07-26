import { randomUUID } from "node:crypto";
import type {
  PlatformAuditLogEntry,
  PlatformAuditLogPage,
  PlatformAuditLogReader,
  PlatformAuditLogWriter,
} from "../application/ports/platform-audit-log.port";

export class InMemoryPlatformAuditLog implements PlatformAuditLogWriter, PlatformAuditLogReader {
  readonly entries: PlatformAuditLogEntry[] = [];

  async record(entry: PlatformAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }

  async list(input: { cursor?: string | undefined; limit: number }): Promise<PlatformAuditLogPage> {
    void input;
    return {
      items: this.entries.map((entry) => ({
        id: randomUUID(),
        organizationId: entry.organizationId,
        actorId: entry.actorId,
        action: entry.action,
        resourceType: "organization",
        resourceId: entry.resourceId,
        result: "SUCCESS",
        createdAt: new Date().toISOString(),
      })),
      nextCursor: null,
    };
  }
}
