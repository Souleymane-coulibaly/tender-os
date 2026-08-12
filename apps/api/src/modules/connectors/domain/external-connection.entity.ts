import { ConnectionStatus, type ConnectorProvider } from "./enums";
import { ExternalConnectionRevokedError } from "./errors";

export type ExternalConnectionProps = {
  id: string;
  organizationId: string;
  provider: ConnectorProvider;
  name: string;
  status: ConnectionStatus;
  scopes: readonly string[];
  externalAccountId: string;
  externalTenantId?: string | undefined;
  externalAccountLabel?: string | undefined;
  encryptedAccessToken?: string | undefined;
  encryptedRefreshToken?: string | undefined;
  expiresAt?: Date | undefined;
  lastRefreshAt?: Date | undefined;
  lastSuccessfulSyncAt?: Date | undefined;
  lastError?: string | undefined;
  allowedClientAccountIds: readonly string[];
  createdBy: string;
  connectedBy: string;
  createdAt: Date;
  updatedAt: Date;
  revokedAt?: Date | undefined;
  revokedBy?: string | undefined;
};

/**
 * Mission §4/§45 — connexion OAuth organisationnelle vers Microsoft 365 ou Google Workspace.
 * Jamais un élargissement des droits TenderOS (mission §45) : `isClientAllowed` est un narrowing
 * STRICT uniquement, même motif que `ApiKey.isClientAllowed` (Sprint 16) — jamais un
 * `ClientAssignment` (décision Sprint 19 validée, la connexion est un principal technique
 * organisationnel, pas un accès utilisateur par client).
 */
export class ExternalConnection {
  private constructor(private props: ExternalConnectionProps) {}

  static initiate(input: {
    id: string;
    organizationId: string;
    provider: ConnectorProvider;
    name: string;
    allowedClientAccountIds: readonly string[];
    createdBy: string;
    occurredAt: Date;
  }): ExternalConnection {
    return new ExternalConnection({
      id: input.id,
      organizationId: input.organizationId,
      provider: input.provider,
      name: input.name,
      status: ConnectionStatus.Pending,
      scopes: [],
      externalAccountId: "",
      allowedClientAccountIds: input.allowedClientAccountIds,
      createdBy: input.createdBy,
      connectedBy: input.createdBy,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: ExternalConnectionProps): ExternalConnection {
    return new ExternalConnection(props);
  }

  /** Callback OAuth réussi (mission §6/§11/§69) — utilisable depuis PENDING (nouvelle connexion),
   *  ACTIVE ou REAUTH_REQUIRED (réautorisation, même ligne réutilisée, jamais une seconde
   *  connexion pour le même provider) ; jamais depuis REVOKED, qui exige une nouvelle connexion
   *  explicite (`assertNotRevoked`). */
  activate(input: {
    connectedBy: string;
    scopes: readonly string[];
    externalAccountId: string;
    externalTenantId?: string | undefined;
    externalAccountLabel?: string | undefined;
    encryptedAccessToken: string;
    encryptedRefreshToken: string | undefined;
    expiresAt: Date | undefined;
    occurredAt: Date;
  }): void {
    this.assertNotRevoked();
    this.props.status = ConnectionStatus.Active;
    this.props.connectedBy = input.connectedBy;
    this.props.scopes = input.scopes;
    this.props.externalAccountId = input.externalAccountId;
    this.props.externalTenantId = input.externalTenantId;
    this.props.externalAccountLabel = input.externalAccountLabel;
    this.props.encryptedAccessToken = input.encryptedAccessToken;
    this.props.encryptedRefreshToken = input.encryptedRefreshToken;
    this.props.expiresAt = input.expiresAt;
    this.props.lastRefreshAt = input.occurredAt;
    this.props.lastError = undefined;
    this.props.updatedAt = input.occurredAt;
  }

  /** Mission §11 — renouvellement réussi (automatique ou après reconnexion suite à
   *  REAUTH_REQUIRED) : redevient ACTIVE dans tous les cas. */
  recordSuccessfulRefresh(input: { encryptedAccessToken: string; encryptedRefreshToken?: string | undefined; expiresAt: Date | undefined; occurredAt: Date }): void {
    this.assertNotRevoked();
    this.props.status = ConnectionStatus.Active;
    this.props.encryptedAccessToken = input.encryptedAccessToken;
    if (input.encryptedRefreshToken !== undefined) {
      this.props.encryptedRefreshToken = input.encryptedRefreshToken;
    }
    this.props.expiresAt = input.expiresAt;
    this.props.lastRefreshAt = input.occurredAt;
    this.props.lastError = undefined;
    this.props.updatedAt = input.occurredAt;
  }

  /** Mission §11 "ne pas supprimer silencieusement" — le refresh a échoué DÉFINITIVEMENT
   *  (provider a révoqué le refresh token, ou consentement retiré côté admin M365/Google) : la
   *  ligne reste, l'historique reste consultable, seul le statut change. */
  markReauthRequired(input: { reason: string; occurredAt: Date }): void {
    this.assertNotRevoked();
    this.props.status = ConnectionStatus.ReauthRequired;
    this.props.lastError = input.reason;
    this.props.updatedAt = input.occurredAt;
  }

  recordTransientError(input: { reason: string; occurredAt: Date }): void {
    this.props.lastError = input.reason;
    this.props.updatedAt = input.occurredAt;
  }

  recordSuccessfulSync(occurredAt: Date): void {
    this.props.lastSuccessfulSyncAt = occurredAt;
    this.props.lastError = undefined;
    this.props.updatedAt = occurredAt;
  }

  /** Mission §12 — déconnexion explicite : les credentials chiffrés sont réellement effacés
   *  (jamais juste un statut, la donnée sensible elle-même disparaît), la ligne reste pour
   *  l'historique (AuditLog/logs de connexion, mission §75/§77). */
  revoke(input: { revokedBy: string; occurredAt: Date }): void {
    this.assertNotRevoked();
    this.props.status = ConnectionStatus.Revoked;
    this.props.encryptedAccessToken = undefined;
    this.props.encryptedRefreshToken = undefined;
    this.props.revokedAt = input.occurredAt;
    this.props.revokedBy = input.revokedBy;
    this.props.updatedAt = input.occurredAt;
  }

  private assertNotRevoked(): void {
    if (this.props.status === ConnectionStatus.Revoked) {
      throw new ExternalConnectionRevokedError();
    }
  }

  isUsable(): boolean {
    return this.props.status === ConnectionStatus.Active;
  }

  /** Mission §49 — vide = pas de restriction additionnelle ; non-vide = narrowing STRICT. */
  isClientAllowed(clientAccountId: string | undefined): boolean {
    if (this.props.allowedClientAccountIds.length === 0) return true;
    if (clientAccountId === undefined) return false;
    return this.props.allowedClientAccountIds.includes(clientAccountId);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get provider(): ConnectorProvider {
    return this.props.provider;
  }
  get name(): string {
    return this.props.name;
  }
  get status(): ConnectionStatus {
    return this.props.status;
  }
  get scopes(): readonly string[] {
    return this.props.scopes;
  }
  get externalAccountId(): string {
    return this.props.externalAccountId;
  }
  get externalTenantId(): string | undefined {
    return this.props.externalTenantId;
  }
  get externalAccountLabel(): string | undefined {
    return this.props.externalAccountLabel;
  }
  get encryptedAccessToken(): string | undefined {
    return this.props.encryptedAccessToken;
  }
  get encryptedRefreshToken(): string | undefined {
    return this.props.encryptedRefreshToken;
  }
  get expiresAt(): Date | undefined {
    return this.props.expiresAt;
  }
  get lastRefreshAt(): Date | undefined {
    return this.props.lastRefreshAt;
  }
  get lastSuccessfulSyncAt(): Date | undefined {
    return this.props.lastSuccessfulSyncAt;
  }
  get lastError(): string | undefined {
    return this.props.lastError;
  }
  get allowedClientAccountIds(): readonly string[] {
    return this.props.allowedClientAccountIds;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get connectedBy(): string {
    return this.props.connectedBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get revokedAt(): Date | undefined {
    return this.props.revokedAt;
  }
  get revokedBy(): string | undefined {
    return this.props.revokedBy;
  }
}
