import { InvalidOrganizationSlugError } from "./errors";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Normalise en minuscules avant persistance — clé métier lisible, unique
 * (docs/04-architecture/DATABASE_DESIGN.md §5.2 — `organizations.slug`).
 */
export class OrganizationSlug {
  private constructor(readonly value: string) {}

  static create(rawValue: string): OrganizationSlug {
    const normalized = rawValue.trim().toLowerCase();

    if (normalized.length === 0 || normalized.length > 120 || !SLUG_PATTERN.test(normalized)) {
      throw new InvalidOrganizationSlugError(rawValue);
    }

    return new OrganizationSlug(normalized);
  }

  equals(other: OrganizationSlug): boolean {
    return this.value === other.value;
  }
}
