import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeleteOrganizationUseCase } from "../../../organizations";
import { PermissionMissingError } from "../../domain/errors";
import { OrganizationRole } from "../../domain/organization-role";
import { InMemoryAuditLogWriter } from "../../test-support/fakes";
import { DeleteOrganizationAsOwnerUseCase } from "./delete-organization-as-owner.use-case";

describe("DeleteOrganizationAsOwnerUseCase", () => {
  let auditLogWriter: InMemoryAuditLogWriter;
  let deleteOrganizationUseCase: DeleteOrganizationUseCase;
  let useCase: DeleteOrganizationAsOwnerUseCase;

  beforeEach(() => {
    auditLogWriter = new InMemoryAuditLogWriter();
    deleteOrganizationUseCase = {
      execute: vi.fn().mockResolvedValue(undefined),
    } as unknown as DeleteOrganizationUseCase;
    useCase = new DeleteOrganizationAsOwnerUseCase(deleteOrganizationUseCase, auditLogWriter);
  });

  it("deletes the organization when the actor is its OWNER", async () => {
    await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: OrganizationRole.Owner,
      requestId: "request-1",
    });

    expect(deleteOrganizationUseCase.execute).toHaveBeenCalledWith({ id: "org-1" });
    expect(auditLogWriter.entries[0]?.action).toBe("organization.deleted");
  });

  it("refuses when the actor is only an Organization Admin (deletion is reserved to OWNER)", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-2",
        actorRole: OrganizationRole.OrganizationAdmin,
      }),
    ).rejects.toThrow(PermissionMissingError);

    expect(deleteOrganizationUseCase.execute).not.toHaveBeenCalled();
  });
});
