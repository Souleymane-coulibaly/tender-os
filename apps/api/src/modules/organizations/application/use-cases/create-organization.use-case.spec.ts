import { beforeEach, describe, expect, it } from "vitest";
import { OrganizationSlugAlreadyTakenError } from "../../domain/errors";
import { Organization } from "../../domain/organization.aggregate";
import { OrganizationId } from "../../domain/organization-id.value-object";
import { OrganizationSlug } from "../../domain/organization-slug.value-object";
import { InMemoryOrganizationRepository } from "../../test-support/in-memory-organization.repository";
import { FixedClock, SequentialIdGenerator } from "../../test-support/fakes";
import { CreateOrganizationUseCase } from "./create-organization.use-case";

function createUseCase(repository: InMemoryOrganizationRepository): CreateOrganizationUseCase {
  return new CreateOrganizationUseCase(repository, new FixedClock(), new SequentialIdGenerator());
}

describe("CreateOrganizationUseCase", () => {
  let repository: InMemoryOrganizationRepository;

  beforeEach(() => {
    repository = new InMemoryOrganizationRepository();
  });

  it("creates a new organization in TRIAL status", async () => {
    const useCase = createUseCase(repository);

    const result = await useCase.execute({
      name: "Acme Corp",
      slug: "Acme-Corp",
      defaultTimezone: "Europe/Paris",
    });

    expect(result.slug).toBe("acme-corp");
    expect(result.status).toBe("TRIAL");
    expect(result.defaultCurrency).toBe("EUR");
    expect(repository.savedIds).toHaveLength(1);
  });

  it("refuses to create an organization with an already-taken slug", async () => {
    const useCase = createUseCase(repository);
    const existing = Organization.create({
      id: OrganizationId.from("existing-org"),
      name: "Acme Corp",
      slug: OrganizationSlug.create("acme-corp"),
      defaultCurrency: "EUR",
      defaultTimezone: "Europe/Paris",
      occurredAt: new Date(),
    });
    await repository.seed(existing);

    await expect(
      useCase.execute({ name: "Another Acme", slug: "ACME-CORP", defaultTimezone: "Europe/Paris" }),
    ).rejects.toThrow(OrganizationSlugAlreadyTakenError);
  });
});
