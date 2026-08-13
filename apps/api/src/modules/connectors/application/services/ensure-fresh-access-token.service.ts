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
 *
 * Mission §11/§95 — concurrence de refresh : si le token n'est plus frais, la relecture + décision
 * + appel provider + persistance ont lieu sous verrou (`ExternalConnectionRepository.withLock`),
 * avec double vérification de fraîcheur une fois le verrou obtenu. Un second appelant concurrent
 * sur la MÊME connexion attend le verrou puis réutilise directement le token déjà rafraîchi par le
 * premier, au lieu de déclencher un second `adapter.refreshAccessToken()` avec le même refresh
 * token — destructeur si le provider fait tourner (rotationne) le refresh token à chaque usage.
 *
 * Mission §14 — réaction à un 401 reçu malgré un token jugé "frais" localement (provider ayant
 * révoqué le token en dehors de tout signal `expiresAt`) : l'appelant (`callWithReactiveReauth`)
 * repasse ici avec `staleAccessToken` renseigné, ce qui FORCE un vrai refresh — sauf si un appelant
 * concurrent a déjà rafraîchi entre-temps (le token stocké diffère alors déjà de `staleAccessToken`
 * ; on le réutilise directement, jamais un second refresh redondant).
 */
@Injectable()
export class EnsureFreshAccessTokenService {
  constructor(
    @Inject(EXTERNAL_CONNECTION_REPOSITORY) private readonly connectionRepository: ExternalConnectionRepository,
    @Inject(CONNECTOR_PROVIDER_ADAPTERS) private readonly adapters: ConnectorProviderAdapterMap,
    @Inject(CREDENTIAL_CIPHER) private readonly credentialCipher: CredentialCipher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(connection: ExternalConnection, options?: { staleAccessToken?: string }): Promise<string> {
    if (!connection.isUsable()) {
      throw new ExternalConnectionNotUsableError();
    }

    const forcingRefresh = options?.staleAccessToken !== undefined;
    if (!forcingRefresh && this.hasFreshToken(connection, this.clock.now())) {
      return this.credentialCipher.decrypt(connection.encryptedAccessToken!);
    }

    return this.connectionRepository.withLock({ organizationId: connection.organizationId, connectionId: connection.id }, async (locked) => {
      if (!locked.isUsable()) {
        throw new ExternalConnectionNotUsableError();
      }

      const now = this.clock.now();
      const currentToken = locked.encryptedAccessToken !== undefined ? this.credentialCipher.decrypt(locked.encryptedAccessToken) : undefined;

      if (forcingRefresh) {
        // Un appelant concurrent a déjà rafraîchi (le token stocké n'est plus celui qui a produit
        // le 401) : le réutiliser directement, jamais un second refresh redondant.
        if (currentToken !== undefined && currentToken !== options?.staleAccessToken) {
          return currentToken;
        }
      } else if (this.hasFreshToken(locked, now)) {
        // Double-checked locking : un appelant concurrent a peut-être déjà rafraîchi pendant que
        // celui-ci attendait le verrou — relire l'état réel avant de décider quoi que ce soit.
        return currentToken!;
      }

      if (locked.encryptedRefreshToken === undefined) {
        locked.markReauthRequired({ reason: "No refresh token available.", occurredAt: now });
        throw new ExternalConnectionNotUsableError();
      }

      const adapter = getAdapter(this.adapters, locked.provider);
      const refreshToken = this.credentialCipher.decrypt(locked.encryptedRefreshToken);
      try {
        const tokens = await adapter.refreshAccessToken(refreshToken);
        locked.recordSuccessfulRefresh({
          encryptedAccessToken: this.credentialCipher.encrypt(tokens.accessToken),
          encryptedRefreshToken: tokens.refreshToken !== undefined ? this.credentialCipher.encrypt(tokens.refreshToken) : undefined,
          expiresAt: new Date(now.getTime() + tokens.expiresInSeconds * 1000),
          occurredAt: now,
        });
        return tokens.accessToken;
      } catch (error) {
        locked.markReauthRequired({ reason: error instanceof Error ? error.message.slice(0, 500) : "Token refresh failed.", occurredAt: now });
        throw new ExternalConnectionNotUsableError();
      }
    });
  }

  private hasFreshToken(connection: ExternalConnection, now: Date): boolean {
    const stillFresh = connection.expiresAt !== undefined && connection.expiresAt.getTime() - REFRESH_MARGIN_MS > now.getTime();
    return stillFresh && connection.encryptedAccessToken !== undefined;
  }
}
