import { Inject, Injectable } from "@nestjs/common";
import { PlatformCapability } from "../../domain/platform-capability";
import type { PlatformRole } from "../../domain/platform-role";
import {
  PLATFORM_AUDIT_LOG_READER,
  type PlatformAuditLogPage,
  type PlatformAuditLogReader,
} from "../ports/platform-audit-log.port";
import { assertHasCapability } from "../policies/platform-authorization.policy";

export type ListPlatformAuditLogsQuery = Readonly<{
  actorRole: PlatformRole;
  cursor?: string | undefined;
  limit: number;
}>;

export type ListPlatformAuditLogsResult = PlatformAuditLogPage;

@Injectable()
export class ListPlatformAuditLogsUseCase {
  constructor(
    @Inject(PLATFORM_AUDIT_LOG_READER) private readonly auditLogReader: PlatformAuditLogReader,
  ) {}

  async execute(query: ListPlatformAuditLogsQuery): Promise<ListPlatformAuditLogsResult> {
    assertHasCapability(query.actorRole, PlatformCapability.AuditLogsRead);

    return this.auditLogReader.list({ cursor: query.cursor, limit: query.limit });
  }
}
