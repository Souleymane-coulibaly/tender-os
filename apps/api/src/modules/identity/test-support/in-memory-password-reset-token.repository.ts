import type { PasswordResetTokenRepository } from "../application/ports/password-reset-token.repository";
import type { PasswordResetToken } from "../domain/password-reset-token.entity";

export class InMemoryPasswordResetTokenRepository implements PasswordResetTokenRepository {
  private readonly records = new Map<string, PasswordResetToken>();

  async save(token: PasswordResetToken): Promise<void> {
    this.records.set(token.id, token);
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    for (const token of this.records.values()) {
      if (token.tokenHash === tokenHash) {
        return token;
      }
    }

    return null;
  }

  async invalidateActiveForUser(userId: string, occurredAt: Date): Promise<void> {
    for (const token of this.records.values()) {
      if (token.userId === userId && token.usedAt === undefined) {
        token.markUsed(occurredAt);
      }
    }
  }

  get savedIds(): string[] {
    return [...this.records.keys()];
  }

  get allTokens(): PasswordResetToken[] {
    return [...this.records.values()];
  }
}
