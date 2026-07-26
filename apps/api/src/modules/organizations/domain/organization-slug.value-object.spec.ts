import { describe, expect, it } from "vitest";
import { InvalidOrganizationSlugError } from "./errors";
import { OrganizationSlug } from "./organization-slug.value-object";

describe("OrganizationSlug.create", () => {
  it("normalizes the value to lowercase and trims whitespace", () => {
    const slug = OrganizationSlug.create("  Acme-Corp  ");

    expect(slug.value).toBe("acme-corp");
  });

  it("treats two slugs differing only by case as equal", () => {
    const a = OrganizationSlug.create("acme-corp");
    const b = OrganizationSlug.create("ACME-CORP");

    expect(a.equals(b)).toBe(true);
  });

  it("rejects a value with an underscore or spaces", () => {
    expect(() => OrganizationSlug.create("acme_corp")).toThrow(InvalidOrganizationSlugError);
    expect(() => OrganizationSlug.create("acme corp")).toThrow(InvalidOrganizationSlugError);
  });

  it("rejects a value with consecutive or trailing hyphens", () => {
    expect(() => OrganizationSlug.create("acme--corp")).toThrow(InvalidOrganizationSlugError);
    expect(() => OrganizationSlug.create("acme-corp-")).toThrow(InvalidOrganizationSlugError);
  });

  it("rejects an empty value", () => {
    expect(() => OrganizationSlug.create("   ")).toThrow(InvalidOrganizationSlugError);
  });
});
