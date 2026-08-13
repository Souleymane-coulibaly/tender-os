import { ProviderErrorCode } from "../../domain/enums";
import { RemoteProviderError } from "../../domain/errors";
import type { ExternalConnection } from "../../domain/external-connection.entity";
import type { EnsureFreshAccessTokenService } from "./ensure-fresh-access-token.service";

/**
 * Mission §14/§19 — un token jugé "frais" localement (`expiresAt` non dépassé) peut malgré tout
 * être rejeté par le provider (révocation côté admin M365/Google, hors du signal `expiresAt`
 * connu de TenderOS). Point d'appel UNIQUE pour toute opération provider authentifiée : sur un
 * premier échec `AUTH_ERROR`, force UN SEUL refresh (jamais une boucle) puis rejoue l'opération une
 * seule fois ; si le second essai échoue encore, l'erreur remonte telle quelle (REAUTH_REQUIRED a
 * déjà été persisté par `EnsureFreshAccessTokenService` si le refresh forcé lui-même a échoué).
 */
export async function callWithReactiveReauth<T>(input: {
  connection: ExternalConnection;
  ensureFreshAccessToken: EnsureFreshAccessTokenService;
  operation: (accessToken: string) => Promise<T>;
}): Promise<T> {
  const accessToken = await input.ensureFreshAccessToken.execute(input.connection);
  try {
    return await input.operation(accessToken);
  } catch (error) {
    if (!(error instanceof RemoteProviderError) || error.providerErrorCode !== ProviderErrorCode.AuthError) {
      throw error;
    }
    const freshAccessToken = await input.ensureFreshAccessToken.execute(input.connection, { staleAccessToken: accessToken });
    return input.operation(freshAccessToken);
  }
}
