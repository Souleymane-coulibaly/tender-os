export type PasswordResetTokenProps = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date | undefined;
  createdAt: Date;
};

/** Courte durée de vie volontaire (mission "expiry courte") — un jeton non utilisé après 30
 *  minutes est inutilisable, réduisant la fenêtre d'exploitation d'un email intercepté. */
export const PASSWORD_RESET_TOKEN_TTL_SECONDS = 30 * 60;

/**
 * Jeton à usage unique du flow "Mot de passe oublié" (V2 Sprint 24, onboarding) — même motif que
 * `Session` (identity/domain/session.entity.ts) : émission avec TTL, invalidation explicite.
 */
export class PasswordResetToken {
  private constructor(private props: PasswordResetTokenProps) {}

  static issue(input: { id: string; userId: string; tokenHash: string; issuedAt: Date }): PasswordResetToken {
    return new PasswordResetToken({
      id: input.id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: new Date(input.issuedAt.getTime() + PASSWORD_RESET_TOKEN_TTL_SECONDS * 1000),
      usedAt: undefined,
      createdAt: input.issuedAt,
    });
  }

  static rehydrate(props: PasswordResetTokenProps): PasswordResetToken {
    return new PasswordResetToken(props);
  }

  isValid(at: Date): boolean {
    return this.props.usedAt === undefined && this.props.expiresAt.getTime() > at.getTime();
  }

  markUsed(occurredAt: Date): void {
    this.props.usedAt = occurredAt;
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get tokenHash(): string {
    return this.props.tokenHash;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get usedAt(): Date | undefined {
    return this.props.usedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
