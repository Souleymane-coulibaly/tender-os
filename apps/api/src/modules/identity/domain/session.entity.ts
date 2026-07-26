export type SessionProps = {
  id: string;
  userId: string;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt?: Date | undefined;
};

/**
 * Session server-side référencée par le jeton d'accès émis
 * (bible/04-architecture/system-architecture.md §14 — IdentityProvider.revokeSession).
 */
export class Session {
  private constructor(private props: SessionProps) {}

  static issue(input: { id: string; userId: string; issuedAt: Date; ttlSeconds: number }): Session {
    return new Session({
      id: input.id,
      userId: input.userId,
      issuedAt: input.issuedAt,
      expiresAt: new Date(input.issuedAt.getTime() + input.ttlSeconds * 1000),
      revokedAt: undefined,
    });
  }

  static rehydrate(props: SessionProps): Session {
    return new Session(props);
  }

  isValid(at: Date): boolean {
    return this.props.revokedAt === undefined && this.props.expiresAt.getTime() > at.getTime();
  }

  revoke(occurredAt: Date): void {
    this.props.revokedAt = occurredAt;
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get issuedAt(): Date {
    return this.props.issuedAt;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get revokedAt(): Date | undefined {
    return this.props.revokedAt;
  }
}
