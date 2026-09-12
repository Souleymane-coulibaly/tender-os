import { ConnectorNotConfiguredError } from "../../domain/errors";

/** Lecture d'une variable de configuration indispensable à un connecteur (identifiants OAuth,
 *  `API_BASE_URL`). Absente, elle lève `ConnectorNotConfiguredError` (503 explicite) plutôt que
 *  l'`Error` générique de `getRequiredEnv` (500 opaque) : l'erreur est un défaut de configuration
 *  du serveur, pas une panne. */
export function requireConnectorEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new ConnectorNotConfiguredError(name);
  }
  return value;
}
