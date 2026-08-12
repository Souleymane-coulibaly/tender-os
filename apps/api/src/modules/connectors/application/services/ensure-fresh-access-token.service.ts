import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import type { ExternalConnection } from "../../domain/external-connection.entity";
import { ExternalConnectionNotUsableError } from "../../domain/errors";
import { CONNECTOR_PROVIDER_ADAPTERS, type ConnectorProviderAdapterMap } from "../ports/connector-provider-adapter";
import { CREDENTIAL_CIPHER, type CredentialCipher } from "../ports/credential-cipher";
import { EXTERNAL_CONNECTION_REPOSITORY, type ExternalConnectionRepository } from "../ports/external-connection.repository";
import { getAdapter } from "./get-adapter";

const REFRESH_MARGIN_MS = 60_000;

/**
 * Mission §11 — renouvellement automatique. Point d'appel UNIQUE avant toute opération provider
 * (navigation, import, export, calendrier) : jamais un appel direct au token stocké sans passer
 * par ici. Un échec définitif de refresh fait passer la connexion en REAUTH_REQUIRED (persisté
 * immédiatement) et lève une erreur explicite — jamais un access token expiré silencieusement
 * transmis au provider.
 */
@Injectable()
export class EnsureFreshAccessTokenService {
  constructor(
    @Inject(EXTERNAL_CONNECTION_REPOSITORY) private readonly connectionRepository: ExternalConnectionRepository,
    @Inject(CONNECTOR_PROVIDER_ADAPTERS) private readonly adapters: ConnectorProviderAdapterMap,
    @Inject(CREDENTIAL_CIPHER) private readonly credentialCipher: CredentialCipher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(connection: ExternalConnection): Promise<string> {
    if (!connection.isUsable()) {
      throw new ExternalConnectionNotUsableError();
    }

    const now = this.clock.now();
    const stillFresh = connection.expiresAt !== undefined && connection.expiresAt.getTime() - REFRESH_MARGIN_MS > now.getTime();
    if (stillFresh && connection.encryptedAccessToken !== undefined) {
      return this.credentialCipher.decrypt(connection.encryptedAccessToken);
    }

    if (connection.encryptedRefreshToken === undefined) {
      connection.markReauthRequired({ reason: "No refresh token available.", occurredAt: now });
      await this.connectionRepository.save(connection);
      throw new ExternalConnectionNotUsableError();
    }

    const adapter = getAdapter(this.adapters, connection.provider);
    const refreshToken = this.credentialCipher.decrypt(connection.encryptedRefreshToken);
    try {
      const tokens = await adapter.refreshAccessToken(refreshToken);
      connection.recordSuccessfulRefresh({
        encryptedAccessToken: this.credentialCipher.encrypt(tokens.accessToken),
        encryptedRefreshToken: tokens.refreshToken !== undefined ? this.credentialCipher.encrypt(tokens.refreshToken) : undefined,
        expiresAt: new Date(now.getTime() + tokens.expiresInSeconds * 1000),
        occurredAt: now,
      });
      await this.connectionRepository.save(connection);
      return tokens.accessToken;
    } catch (error) {
      connection.markReauthRequired({ reason: error instanceof Error ? error.message.slice(0, 500) : "Token refresh failed.", occurredAt: now });
      await this.connectionRepository.save(connection);
      throw new ExternalConnectionNotUsableError();
    }
  }
}
