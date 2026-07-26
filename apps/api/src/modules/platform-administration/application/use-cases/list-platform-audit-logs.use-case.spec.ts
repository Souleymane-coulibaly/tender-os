import { describe, expect, it } from "vitest";
import { PlatformRole } from "../../domain/platform-role";
import { InMemoryPlatformAuditLog } from "../../test-support/in-memory-platform-audit-log";
import { ListPlatformAuditLogsUseCase } from "./list-platform-audit-logs.use-case";

describe("ListPlatformAuditLogsUseCase", () => {
  it("lists recorded audit entries for a reader role", async () => {
    const auditLog = new InMemoryPlatformAuditLog();
    await auditLog.record({
      organizationId: "org-1",
      actorId: "admin-1",
      action: "platform.organization.suspended",
      resourceId: "org-1",
    });
    const useCase = new ListPlatformAuditLogsUseCase(auditLog);

    const result = await useCase.execute({ actorRole: PlatformRole.Support, limit: 25 });

    expect(result.items).toHaveLength(1);
  });
});
