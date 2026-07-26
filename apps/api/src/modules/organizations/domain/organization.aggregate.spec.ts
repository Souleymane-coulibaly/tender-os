import { describe, expect, it } from "vitest";
import { InvalidOrganizationStatusTransitionError } from "./errors";
import { Organization } from "./organization.aggregate";
import { OrganizationId } from "./organization-id.value-object";
import { OrganizationSlug } from "./organization-slug.value-object";
import { OrganizationStatus } from "./organization-status";

function createOrganization(): Organization {
  return Organization.create({
    id: OrganizationId.from("org-1"),
    name: "Acme Corp",
    slug: OrganizationSlug.create("acme-corp"),
    defaultCurrency: "EUR",
    defaultTimezone: "Europe/Paris",
    occurredAt: new Date("2026-01-01T00:00:00Z"),
  });
}

describe("Organization.create", () => {
  it("starts in TRIAL status with the given profile", () => {
    const organization = createOrganization();

    expect(organization.status).toBe(OrganizationStatus.Trial);
    expect(organization.name).toBe("Acme Corp");
    expect(organization.deletedAt).toBeUndefined();
  });

  it("defaults settings to an empty object when omitted", () => {
    const organization = createOrganization();

    expect(organization.settings).toEqual({});
  });
});

describe("Organization#updateProfile", () => {
  it("applies only the provided fields and bumps updatedAt", () => {
    const organization = createOrganization();

    organization.updateProfile(
      { name: "Acme Corporation", legalName: "Acme Corporation SAS" },
      new Date("2026-02-01T00:00:00Z"),
    );

    expect(organization.name).toBe("Acme Corporation");
    expect(organization.legalName).toBe("Acme Corporation SAS");
    expect(organization.defaultCurrency).toBe("EUR");
    expect(organization.updatedAt).toEqual(new Date("2026-02-01T00:00:00Z"));
  });

  it("leaves the slug untouched (not part of the editable profile)", () => {
    const organization = createOrganization();

    organization.updateProfile({ name: "Renamed" }, new Date("2026-02-01T00:00:00Z"));

    expect(organization.slug.value).toBe("acme-corp");
  });
});

describe("Organization#markDeleted", () => {
  it("sets deletedAt and bumps updatedAt", () => {
    const organization = createOrganization();

    organization.markDeleted(new Date("2026-03-01T00:00:00Z"));

    expect(organization.deletedAt).toEqual(new Date("2026-03-01T00:00:00Z"));
    expect(organization.updatedAt).toEqual(new Date("2026-03-01T00:00:00Z"));
  });
});

describe("Organization#suspend", () => {
  it("transitions TRIAL to SUSPENDED", () => {
    const organization = createOrganization();

    organization.suspend(new Date("2026-03-01T00:00:00Z"));

    expect(organization.status).toBe(OrganizationStatus.Suspended);
  });

  it("refuses to suspend an already-suspended organization", () => {
    const organization = createOrganization();
    organization.suspend(new Date());

    expect(() => organization.suspend(new Date())).toThrow(InvalidOrganizationStatusTransitionError);
  });
});

describe("Organization#reactivate", () => {
  it("transitions SUSPENDED back to ACTIVE", () => {
    const organization = createOrganization();
    organization.suspend(new Date());

    organization.reactivate(new Date("2026-04-01T00:00:00Z"));

    expect(organization.status).toBe(OrganizationStatus.Active);
  });

  it("refuses to reactivate a non-suspended organization", () => {
    const organization = createOrganization();

    expect(() => organization.reactivate(new Date())).toThrow(InvalidOrganizationStatusTransitionError);
  });
});
