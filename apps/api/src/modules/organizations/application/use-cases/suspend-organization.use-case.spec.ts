import { beforeEach, describe, expect, it } from "vitest";
import { InvalidOrganizationStatusTransitionError, OrganizationNotFoundError } from "../../domain/errors";
import { Organization } from "../../domain/organization.aggregate";
import { OrganizationId } from "../../domain/organization-id.value-object";
import { OrganizationSlug } from "../../domain/organization-slug.value-object";
import { InMemoryOrganizationRepository } from "../../test-support/in-memory-organization.repository";
import { FixedClock } from "../../test-support/fakes";
import { SuspendOrganizationUseCase } from "./suspend-organization.use-case";

describe("SuspendOrganizationUseCase", () => {
  let repository: InMemoryOrganizationRepository;
  let useCase: SuspendOrganizationUseCase;

  beforeEach(() => {
    repository = new InMemoryOrganizationRepository();
    useCase = new SuspendOrganizationUseCase(repository, new FixedClock());
  });

  it("suspends an existing organization", async () => {
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

    expect(result.status).toBe("SUSPENDED");
  });

  it("throws when the organization does not exist", async () => {
    await expect(useCase.execute({ id: "missing-org" })).rejects.toThrow(OrganizationNotFoundError);
  });

  it("refuses to suspend an already-suspended organization", async () => {
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

    await expect(useCase.execute({ id: "org-1" })).rejects.toThrow(InvalidOrganizationStatusTransitionError);
  });
});
