import { getRequiredEnv } from "../../../../shared-kernel/env";
import type { ConnectorProvider } from "../../domain/enums";

/** Mission §9 — les Redirect URIs proviennent EXCLUSIVEMENT de la configuration serveur
 *  (`API_BASE_URL`), jamais d'une valeur envoyée par le frontend. Une par provider, fixe, jamais
 *  paramétrable par requête. */
export function oauthRedirectUri(provider: ConnectorProvider): string {
  const base = getRequiredEnv("API_BASE_URL").replace(/\/$/, "");
  return `${base}/api/v1/connectors/oauth/${provider.toLowerCase().replace(/_/g, "-")}/callback`;
}
