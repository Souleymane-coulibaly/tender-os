import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrganizationSummary, UpdateOrganizationUseCase } from "../../../organizations";
import { PermissionMissingError } from "../../domain/errors";
import { OrganizationRole } from "../../domain/organization-role";
import { InMemoryAuditLogWriter } from "../../test-support/fakes";
import { UpdateOrganizationProfileUseCase } from "./update-organization-profile.use-case";

const ORGANIZATION_SUMMARY: OrganizationSummary = {
  id: "org-1",
  name: "Acme Corp",
  slug: "acme-corp",
  defaultCurrency: "EUR",
  defaultTimezone: "Europe/Paris",
  status: "TRIAL",
  settings: {},
  createdAt: "2026-07-26T14:00:00.000Z",
  updatedAt: "2026-07-26T14:00:00.000Z",
};

describe("UpdateOrganizationProfileUseCase", () => {
  let auditLogWriter: InMemoryAuditLogWriter;
  let updateOrganizationUseCase: UpdateOrganizationUseCase;
  let useCase: UpdateOrganizationProfileUseCase;

  beforeEach(() => {
    auditLogWriter = new InMemoryAuditLogWriter();
    updateOrganizationUseCase = {
      execute: vi.fn().mockResolvedValue(ORGANIZATION_SUMMARY),
    } as unknown as UpdateOrganizationUseCase;
    useCase = new UpdateOrganizationProfileUseCase(updateOrganizationUseCase, auditLogWriter);
  });

  it("updates the organization profile when the actor is OWNER", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: OrganizationRole.Owner,
      legalName: "Acme Corp SAS",
      requestId: "request-1",
    });

    expect(updateOrganizationUseCase.execute).toHaveBeenCalledWith({
      id: "org-1",
      name: undefined,
      legalName: "Acme Corp SAS",
      registrationNumber: undefined,
      countryCode: undefined,
      defaultCurrency: undefined,
      defaultTimezone: undefined,
      settings: undefined,
    });
    expect(auditLogWriter.entries[0]?.action).toBe("organization.profile.updated");
    expect(result).toEqual(ORGANIZATION_SUMMARY);
  });

  it("updates the organization profile when the actor is ORGANIZATION_ADMIN", async () => {
    await useCase.execute({
      organizationId: "org-1",
      actorId: "user-2",
      actorRole: OrganizationRole.OrganizationAdmin,
      name: "Acme",
    });

    expect(updateOrganizationUseCase.execute).toHaveBeenCalled();
  });

  it("refuses when the actor role does not carry organization:profile:update (e.g. Contributor)", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-3",
        actorRole: OrganizationRole.Contributor,
        name: "Acme",
      }),
    ).rejects.toThrow(PermissionMissingError);

    expect(updateOrganizationUseCase.execute).not.toHaveBeenCalled();
    expect(auditLogWriter.entries).toHaveLength(0);
  });
});
