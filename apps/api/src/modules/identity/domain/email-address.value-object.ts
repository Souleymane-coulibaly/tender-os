import { InvalidEmailAddressError } from "./errors";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalise l'adresse email en minuscules avant persistance, ce qui garantit
 * une unicité insensible à la casse sans dépendre de l'extension Postgres citext
 * (docs/04-architecture/DATABASE_DESIGN.md §5.1).
 */
export class EmailAddress {
  private constructor(readonly value: string) {}

  static create(rawValue: string): EmailAddress {
    const normalized = rawValue.trim().toLowerCase();

    if (normalized.length === 0 || normalized.length > 320 || !EMAIL_PATTERN.test(normalized)) {
      throw new InvalidEmailAddressError(rawValue);
    }

    return new EmailAddress(normalized);
  }

  equals(other: EmailAddress): boolean {
    return this.value === other.value;
  }
}
