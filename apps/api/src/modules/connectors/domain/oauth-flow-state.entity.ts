import type { ConnectorProvider } from "./enums";
import { OAuthStateInvalidError } from "./errors";

export type OAuthFlowStateProps = {
  id: string;
  state: string;
  organizationId: string;
  userId: string;
  provider: ConnectorProvider;
  /** Présent uniquement pour une réautorisation d'une connexion existante (mission §11) — absent
   *  pour une nouvelle connexion (mission §6). */
  connectionId?: string | undefined;
  codeVerifier: string;
  createdAt: Date;
  expiresAt: Date;
  consumedAt?: Date | undefined;
};

/**
 * Mission §7/§8/§55 — état éphémère, usage unique, du flow OAuth Authorization Code + PKCE. Lie
 * cryptographiquement le `state` renvoyé par le provider à l'organisation/l'utilisateur qui a
 * initié la connexion : un attaquant qui intercepte/forge un `state` ne peut jamais faire aboutir
 * un callback sur une AUTRE organisation que celle qui l'a réellement initié (mission §55 "account
 * swap").
 */
export class OAuthFlowState {
  private constructor(private props: OAuthFlowStateProps) {}

  static initiate(input: { id: string; state: string; organizationId: string; userId: string; provider: ConnectorProvider; connectionId?: string | undefined; codeVerifier: string; occurredAt: Date; ttlMs: number }): OAuthFlowState {
    return new OAuthFlowState({
      id: input.id,
      state: input.state,
      organizationId: input.organizationId,
      userId: input.userId,
      provider: input.provider,
      connectionId: input.connectionId,
      codeVerifier: input.codeVerifier,
      createdAt: input.occurredAt,
      expiresAt: new Date(input.occurredAt.getTime() + input.ttlMs),
    });
  }

  static rehydrate(props: OAuthFlowStateProps): OAuthFlowState {
    return new OAuthFlowState(props);
  }

  /** Mission §55 — usage unique : consommé exactement une fois, jamais rejouable même si le
   *  callback provider est intercepté/répété. */
  consume(now: Date): void {
    if (this.props.consumedAt !== undefined) {
      throw new OAuthStateInvalidError();
    }
    if (this.props.expiresAt.getTime() <= now.getTime()) {
      throw new OAuthStateInvalidError();
    }
    this.props.consumedAt = now;
  }

  get id(): string {
    return this.props.id;
  }
  get state(): string {
    return this.props.state;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get userId(): string {
    return this.props.userId;
  }
  get provider(): ConnectorProvider {
    return this.props.provider;
  }
  get connectionId(): string | undefined {
    return this.props.connectionId;
  }
  get codeVerifier(): string {
    return this.props.codeVerifier;
  }
  get expiresAt(): Date {
    return this.props.expiresAt;
  }
  get consumedAt(): Date | undefined {
    return this.props.consumedAt;
  }
}
