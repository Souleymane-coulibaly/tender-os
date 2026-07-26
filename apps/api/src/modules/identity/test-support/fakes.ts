import type { Clock } from "../../../shared-kernel/clock";
import type { IdGenerator } from "../../../shared-kernel/id-generator";
import type {
  AccessTokenClaims,
  AccessTokenService,
} from "../application/ports/access-token.service";
import type { PasswordHasher } from "../application/ports/password-hasher";

export const FIXED_NOW = new Date("2026-07-25T14:00:00Z");

export class FixedClock implements Clock {
  constructor(private readonly value: Date = FIXED_NOW) {}

  now(): Date {
    return this.value;
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;

  generate(): string {
    this.counter += 1;

    return `id-${this.counter}`;
  }
}

/**
 * Hasher déterministe et lisible pour les tests — jamais utilisé en dehors de ce dossier.
 */
export class FakePasswordHasher implements PasswordHasher {
  async hash(plainPassword: string): Promise<string> {
    return `hashed:${plainPassword}`;
  }

  async verify(plainPassword: string, passwordHash: string): Promise<boolean> {
    return passwordHash === `hashed:${plainPassword}`;
  }
}

export class FakeAccessTokenService implements AccessTokenService {
  private readonly issued = new Map<string, AccessTokenClaims>();
  private counter = 0;

  issue(claims: AccessTokenClaims): string {
    this.counter += 1;
    const token = `token-${this.counter}`;
    this.issued.set(token, claims);

    return token;
  }

  verify(token: string): AccessTokenClaims | null {
    return this.issued.get(token) ?? null;
  }
}
