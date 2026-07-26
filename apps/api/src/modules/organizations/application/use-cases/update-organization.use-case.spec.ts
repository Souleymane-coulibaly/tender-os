import { beforeEach, describe, expect, it } from "vitest";
import { OrganizationNotFoundError } from "../../domain/errors";
import { Organization } from "../../domain/organization.aggregate";
import { OrganizationId } from "../../domain/organization-id.value-object";
import { OrganizationSlug } from "../../domain/organization-slug.value-object";
import { InMemoryOrganizationRepository } from "../../test-support/in-memory-organization.repository";
import { FixedClock } from "../../test-support/fakes";
import { UpdateOrganizationUseCase } from "./update-organization.use-case";

describe("UpdateOrganizationUseCase", () => {
  let repository: InMemoryOrganizationRepository;
  let useCase: UpdateOrganizationUseCase;

  beforeEach(() => {
    repository = new InMemoryOrganizationRepository();
    useCase = new UpdateOrganizationUseCase(repository, new FixedClock());
  });

  it("updates only the provided fields", async () => {
    const organization = Organization.create({
      id: OrganizationId.from("org-1"),
      name: "Acme Corp",
      slug: OrganizationSlug.create("acme-corp"),
      defaultCurrency: "EUR",
      defaultTimezone: "Europe/Paris",
      occurredAt: new Date("2026-01-01T00:00:00Z"),
    });
    await repository.seed(organization);

    const result = await useCase.execute({ id: "org-1", legalName: "Acme Corporation SAS" });

    expect(result.name).toBe("Acme Corp");
    expect(result.legalName).toBe("Acme Corporation SAS");
  });

  it("throws when the organization cannot be found", async () => {
    await expect(useCase.execute({ id: "missing-org", name: "New name" })).rejects.toThrow(
      OrganizationNotFoundError,
    );
  });
});
