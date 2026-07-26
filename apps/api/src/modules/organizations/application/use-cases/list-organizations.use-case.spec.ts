import { beforeEach, describe, expect, it } from "vitest";
import { Organization } from "../../domain/organization.aggregate";
import { OrganizationId } from "../../domain/organization-id.value-object";
import { OrganizationSlug } from "../../domain/organization-slug.value-object";
import { OrganizationStatus } from "../../domain/organization-status";
import { InMemoryOrganizationRepository } from "../../test-support/in-memory-organization.repository";
import { ListOrganizationsUseCase } from "./list-organizations.use-case";

describe("ListOrganizationsUseCase", () => {
  let repository: InMemoryOrganizationRepository;
  let useCase: ListOrganizationsUseCase;

  beforeEach(() => {
    repository = new InMemoryOrganizationRepository();
    useCase = new ListOrganizationsUseCase(repository);
  });

  it("lists organizations across the whole platform", async () => {
    await repository.seed(
      Organization.create({
        id: OrganizationId.from("org-1"),
        name: "Acme Corp",
        slug: OrganizationSlug.create("acme-corp"),
        defaultCurrency: "EUR",
        defaultTimezone: "Europe/Paris",
        occurredAt: new Date("2026-01-01T00:00:00Z"),
      }),
    );
    await repository.seed(
      Organization.create({
        id: OrganizationId.from("org-2"),
        name: "Beta Inc",
        slug: OrganizationSlug.create("beta-inc"),
        defaultCurrency: "EUR",
        defaultTimezone: "Europe/Paris",
        occurredAt: new Date("2026-01-02T00:00:00Z"),
      }),
    );

    const result = await useCase.execute({ limit: 25 });

    expect(result.items).toHaveLength(2);
  });

  it("filters by status", async () => {
    const suspended = Organization.create({
      id: OrganizationId.from("org-1"),
      name: "Acme Corp",
      slug: OrganizationSlug.create("acme-corp"),
      defaultCurrency: "EUR",
      defaultTimezone: "Europe/Paris",
      occurredAt: new Date("2026-01-01T00:00:00Z"),
    });
    suspended.suspend(new Date());
    await repository.seed(suspended);
    await repository.seed(
      Organization.create({
        id: OrganizationId.from("org-2"),
        name: "Beta Inc",
        slug: OrganizationSlug.create("beta-inc"),
        defaultCurrency: "EUR",
        defaultTimezone: "Europe/Paris",
        occurredAt: new Date("2026-01-02T00:00:00Z"),
      }),
    );

    const result = await useCase.execute({ limit: 25, status: OrganizationStatus.Suspended });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe("org-1");
  });
});
