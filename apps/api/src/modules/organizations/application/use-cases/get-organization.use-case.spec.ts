import { beforeEach, describe, expect, it } from "vitest";
import { OrganizationNotFoundError } from "../../domain/errors";
import { Organization } from "../../domain/organization.aggregate";
import { OrganizationId } from "../../domain/organization-id.value-object";
import { OrganizationSlug } from "../../domain/organization-slug.value-object";
import { InMemoryOrganizationRepository } from "../../test-support/in-memory-organization.repository";
import { GetOrganizationUseCase } from "./get-organization.use-case";

describe("GetOrganizationUseCase", () => {
  let repository: InMemoryOrganizationRepository;
  let useCase: GetOrganizationUseCase;

  beforeEach(() => {
    repository = new InMemoryOrganizationRepository();
    useCase = new GetOrganizationUseCase(repository);
  });

  it("returns the organization's profile", async () => {
    const organization = Organization.create({
      id: OrganizationId.from("org-1"),
      name: "Acme Corp",
      slug: OrganizationSlug.create("acme-corp"),
      defaultCurrency: "EUR",
      defaultTimezone: "Europe/Paris",
      occurredAt: new Date("2026-01-01T00:00:00Z"),
    });
    await repository.seed(organization);

    const result = await useCase.execute({ id: "org-1" });

    expect(result.name).toBe("Acme Corp");
    expect(result.slug).toBe("acme-corp");
  });

  it("throws when the organization cannot be found", async () => {
    await expect(useCase.execute({ id: "missing-org" })).rejects.toThrow(OrganizationNotFoundError);
  });

  it("throws when the organization has been soft-deleted", async () => {
    const organization = Organization.create({
      id: OrganizationId.from("org-1"),
      name: "Acme Corp",
      slug: OrganizationSlug.create("acme-corp"),
      defaultCurrency: "EUR",
      defaultTimezone: "Europe/Paris",
      occurredAt: new Date("2026-01-01T00:00:00Z"),
    });
    organization.markDeleted(new Date("2026-02-01T00:00:00Z"));
    await repository.seed(organization);

    await expect(useCase.execute({ id: "org-1" })).rejects.toThrow(OrganizationNotFoundError);
  });
});
