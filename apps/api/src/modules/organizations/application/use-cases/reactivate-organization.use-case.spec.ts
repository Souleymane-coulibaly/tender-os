import { beforeEach, describe, expect, it } from "vitest";
import { InvalidOrganizationStatusTransitionError, OrganizationNotFoundError } from "../../domain/errors";
import { Organization } from "../../domain/organization.aggregate";
import { OrganizationId } from "../../domain/organization-id.value-object";
import { OrganizationSlug } from "../../domain/organization-slug.value-object";
import { InMemoryOrganizationRepository } from "../../test-support/in-memory-organization.repository";
import { FixedClock } from "../../test-support/fakes";
import { ReactivateOrganizationUseCase } from "./reactivate-organization.use-case";

describe("ReactivateOrganizationUseCase", () => {
  let repository: InMemoryOrganizationRepository;
  let useCase: ReactivateOrganizationUseCase;

  beforeEach(() => {
    repository = new InMemoryOrganizationRepository();
    useCase = new ReactivateOrganizationUseCase(repository, new FixedClock());
  });

  it("reactivates a suspended organization", async () => {
    const organization = Organization.create({
      id: OrganizationId.from("org-1"),
      name: "Acme Corp",
      slug: OrganizationSlug.create("acme-corp"),
      defaultCurrency: "EUR",
      defaultTimezone: "Europe/Paris",
      occurredAt: new Date("2026-01-01T00:00:00Z"),
    });
    organization.suspend(new Date());
    await repository.seed(organization);

    const result = await useCase.execute({ id: "org-1" });

    expect(result.status).toBe("ACTIVE");
  });

  it("throws when the organization does not exist", async () => {
    await expect(useCase.execute({ id: "missing-org" })).rejects.toThrow(OrganizationNotFoundError);
  });

  it("refuses to reactivate a non-suspended organization", async () => {
    const organization = Organization.create({
      id: OrganizationId.from("org-1"),
      name: "Acme Corp",
      slug: OrganizationSlug.create("acme-corp"),
      defaultCurrency: "EUR",
      defaultTimezone: "Europe/Paris",
      occurredAt: new Date("2026-01-01T00:00:00Z"),
    });
    await repository.seed(organization);

    await expect(useCase.execute({ id: "org-1" })).rejects.toThrow(InvalidOrganizationStatusTransitionError);
  });
});
