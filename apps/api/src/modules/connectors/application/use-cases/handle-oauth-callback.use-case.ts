import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ExternalConnectionNotFoundError, OAuthStateInvalidError } from "../../domain/errors";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { CONNECTOR_PROVIDER_ADAPTERS, type ConnectorProviderAdapterMap } from "../ports/connector-provider-adapter";
import { CREDENTIAL_CIPHER, type CredentialCipher } from "../ports/credential-cipher";
import { EXTERNAL_CONNECTION_REPOSITORY, type ExternalConnectionRepository } from "../ports/external-connection.repository";
import { OAUTH_FLOW_STATE_REPOSITORY, type OAuthFlowStateRepository } from "../ports/oauth-flow-state.repository";
import { getAdapter } from "../services/get-adapter";
import { oauthRedirectUri } from "../services/redirect-uri";

export type HandleOAuthCallbackCommand = Readonly<{ state: string; code: string }>;
export type HandleOAuthCallbackResult = Readonly<{ organizationId: string; provider: string; connectionId: string }>;

/**
 * Mission §6/§7/§54/§55/§102 (POINT CRITIQUE sécurité) — endpoint appelé directement par le
 * navigateur suite à la redirection Microsoft/Google, SANS session TenderOS authentifiée
 * attachable (le navigateur ne porte pas de Bearer token vers ce endpoint). Toute la confiance
 * repose donc EXCLUSIVEMENT sur la consommation atomique et unique de `state`
 * (`OAuthFlowStateRepository.consumeIfValid`, mission §55 "account swap" — un `state` forgé/rejoué/
 * appartenant à une autre organisation ne peut jamais faire aboutir ce callback, faute de ligne
 * `OAuthFlowState` valide correspondante). `organizationId`/`actorId` ne sont JAMAIS des paramètres
 * de ce use-case : ils sont dérivés du `state` consommé, jamais acceptés depuis la requête HTTP
 * elle-même (mission §101 mass assignment).
 */
@Injectable()
export class HandleOAuthCallbackUseCase {
  constructor(
    @Inject(OAUTH_FLOW_STATE_REPOSITORY) private readonly flowStateRepository: OAuthFlowStateRepository,
    @Inject(EXTERNAL_CONNECTION_REPOSITORY) private readonly connectionRepository: ExternalConnectionRepository,
    @Inject(CONNECTOR_PROVIDER_ADAPTERS) private readonly adapters: ConnectorProviderAdapterMap,
    @Inject(CREDENTIAL_CIPHER) private readonly credentialCipher: CredentialCipher,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: HandleOAuthCallbackCommand): Promise<HandleOAuthCallbackResult> {
    const now = this.clock.now();
    const flowState = await this.flowStateRepository.consumeIfValid(command.state, now);
    if (!flowState) {
      throw new OAuthStateInvalidError();
    }

    const connection = await this.connectionRepository.findActiveByOrganizationAndProvider({ organizationId: flowState.organizationId, provider: flowState.provider });
    // Ligne attendue (créée par InitiateOAuthConnectionUseCase, ou déjà existante pour une
    // réautorisation) — son absence signifierait un état incohérent (jamais un simple 404 muet,
    // ce chemin ne devrait structurellement jamais être atteint par un `state` valide).
    if (!connection || (flowState.connectionId !== undefined && flowState.connectionId !== connection.id)) {
      throw new ExternalConnectionNotFoundError();
    }

    const adapter = getAdapter(this.adapters, flowState.provider);
    const tokens = await adapter.exchangeCodeForTokens({ code: command.code, codeVerifier: flowState.codeVerifier, redirectUri: oauthRedirectUri(flowState.provider) });
    const accountInfo = await adapter.fetchAccountInfo(tokens.accessToken);

    connection.activate({
      connectedBy: flowState.userId,
      scopes: tokens.scopes,
      externalAccountId: accountInfo.externalAccountId,
      externalTenantId: accountInfo.externalTenantId,
      externalAccountLabel: accountInfo.externalAccountLabel,
      encryptedAccessToken: this.credentialCipher.encrypt(tokens.accessToken),
      encryptedRefreshToken: tokens.refreshToken !== undefined ? this.credentialCipher.encrypt(tokens.refreshToken) : undefined,
      expiresAt: new Date(now.getTime() + tokens.expiresInSeconds * 1000),
      occurredAt: now,
    });
    await this.connectionRepository.save(connection);

    // Mission §60/§61/§77 — jamais un token, même chiffré, dans les metadata d'AuditLog.
    await this.auditLogWriter.record({
      organizationId: flowState.organizationId,
      actorType: "USER",
      actorId: flowState.userId,
      action: "connector.connection_activated",
      resourceType: "ExternalConnection",
      resourceId: connection.id,
      metadata: { provider: flowState.provider, externalAccountLabel: accountInfo.externalAccountLabel },
    });

    return { organizationId: flowState.organizationId, provider: flowState.provider, connectionId: connection.id };
  }
}
