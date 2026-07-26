import { beforeEach, describe, expect, it } from "vitest";
import { OrganizationNotFoundError } from "../../domain/errors";
import { Organization } from "../../domain/organization.aggregate";
import { OrganizationId } from "../../domain/organization-id.value-object";
import { OrganizationSlug } from "../../domain/organization-slug.value-object";
import { InMemoryOrganizationRepository } from "../../test-support/in-memory-organization.repository";
import { FixedClock } from "../../test-support/fakes";
import { DeleteOrganizationUseCase } from "./delete-organization.use-case";

describe("DeleteOrganizationUseCase", () => {
  let repository: InMemoryOrganizationRepository;
  let useCase: DeleteOrganizationUseCase;

  beforeEach(() => {
    repository = new InMemoryOrganizationRepository();
    useCase = new DeleteOrganizationUseCase(repository, new FixedClock());
  });

  it("soft-deletes an existing organization", async () => {
    const organization = Organization.create({
      id: OrganizationId.from("org-1"),
      name: "Acme Corp",
      slug: OrganizationSlug.create("acme-corp"),
      defaultCurrency: "EUR",
      defaultTimezone: "Europe/Paris",
      occurredAt: new Date("2026-01-01T00:00:00Z"),
    });
    await repository.seed(organization);

    await useCase.execute({ id: "org-1" });

    const found = await repository.findById(OrganizationId.from("org-1"));
    expect(found).toBeNull();
  });

  it("throws when the organization cannot be found", async () => {
    await expect(useCase.execute({ id: "missing-org" })).rejects.toThrow(OrganizationNotFoundError);
  });

  it("throws when called twice on the same organization (already soft-deleted)", async () => {
    const organization = Organization.create({
      id: OrganizationId.from("org-1"),
      name: "Acme Corp",
      slug: OrganizationSlug.create("acme-corp"),
      defaultCurrency: "EUR",
      defaultTimezone: "Europe/Paris",
      occurredAt: new Date("2026-01-01T00:00:00Z"),
    });
    await repository.seed(organization);

    await useCase.execute({ id: "org-1" });

    await expect(useCase.execute({ id: "org-1" })).rejects.toThrow(OrganizationNotFoundError);
  });
});
