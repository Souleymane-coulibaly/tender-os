import { SIGNATURE_PROVIDER } from "../domain/signature-level";

/** Configuration COMPLÈTE résolue depuis l'environnement — usage interne à l'infrastructure
 *  uniquement (le token DI applicatif `SIGNATURE_CONFIG`, voir
 *  `application/ports/signature-config.port.ts`, n'expose que `{ provider }`, jamais la clé API
 *  ni les URLs : l'application ne doit dépendre d'aucun détail Universign concret). */
export type LoadedSignatureConfig = Readonly<{
  provider: "FAKE" | "UNIVERSIGN";
  universign?:
    | Readonly<{
        apiKey: string;
        apiBaseUrl: string;
        environment: "ALPHA" | "PRODUCTION";
        webhookAudience?: string | undefined;
        returnUrl: string;
        cancelUrl: string;
        jwksUrl: string;
        requestTimeoutMs: number;
      }>
    | undefined;
}>;

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Mission Sprint 8A §37/§38 — "une mauvaise configuration doit provoquer une erreur claire plutôt
 * qu'un fallback silencieux vers le fake". Contrairement à `GenerationConfig`/`AnalysisConfig`
 * (aucune variable obligatoire au démarrage), `SIGNATURE_PROVIDER` EST validé explicitement ici :
 * absent ou invalide ⇒ échec immédiat, jamais une bascule implicite. En développement local sans
 * cette variable, le module refuse de démarrer plutôt que de deviner — c'est un choix de sécurité
 * assumé (mission "aucun secret dans les tests/logs" + "jamais de bascule silencieuse").
 */
export function loadSignatureConfig(env: NodeJS.ProcessEnv = process.env): LoadedSignatureConfig {
  const provider = env.SIGNATURE_PROVIDER;
  if (provider !== SIGNATURE_PROVIDER.Fake && provider !== SIGNATURE_PROVIDER.Universign) {
    throw new Error(
      `Missing or invalid environment variable SIGNATURE_PROVIDER: expected "FAKE" or "UNIVERSIGN", got ${provider ? `"${provider}"` : "undefined"}.`,
    );
  }

  if (provider === SIGNATURE_PROVIDER.Fake) {
    // Mission (audit de correction) — "SIGNATURE_PROVIDER=FAKE doit être impossible en
    // production" : NODE_ENV=production est le signal standard Node.js (Railway le positionne
    // automatiquement en déploiement), jamais une variable inventée pour ce seul module.
    if (env.NODE_ENV === "production") {
      throw new Error("SIGNATURE_PROVIDER=FAKE is not allowed when NODE_ENV=production — configure SIGNATURE_PROVIDER=UNIVERSIGN.");
    }
    return { provider };
  }

  const apiKey = requireEnv(env, "UNIVERSIGN_API_KEY");
  const apiBaseUrl = requireEnv(env, "UNIVERSIGN_API_BASE_URL");
  const environment = env.UNIVERSIGN_ENVIRONMENT;
  if (environment !== "ALPHA" && environment !== "PRODUCTION") {
    throw new Error(`Invalid environment variable UNIVERSIGN_ENVIRONMENT: expected "ALPHA" or "PRODUCTION", got ${environment ? `"${environment}"` : "undefined"}.`);
  }
  // Mission §6/§36 — "ne jamais appeler Production pendant le Sprint 8A/8A bis".
  if (environment === "PRODUCTION") {
    throw new Error("Sprint 8A/8A bis must never be configured against Universign Production — set UNIVERSIGN_ENVIRONMENT=ALPHA.");
  }

  return {
    provider,
    universign: {
      apiKey,
      apiBaseUrl,
      environment,
      webhookAudience: env.UNIVERSIGN_WEBHOOK_AUDIENCE || undefined,
      returnUrl: requireEnv(env, "UNIVERSIGN_RETURN_URL"),
      cancelUrl: requireEnv(env, "UNIVERSIGN_CANCEL_URL"),
      jwksUrl: requireEnv(env, "UNIVERSIGN_JWKS_URL"),
      requestTimeoutMs: readPositiveIntegerOrDefault(env, "UNIVERSIGN_REQUEST_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    },
  };
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readPositiveIntegerOrDefault(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid environment variable ${name}: "${raw}" must be a positive integer.`);
  }
  return value;
}
