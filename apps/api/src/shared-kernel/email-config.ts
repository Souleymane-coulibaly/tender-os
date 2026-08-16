export type EmailProviderKind = "resend" | "logging";

/**
 * P2 (audit Codex, Resend/Demo Request) — même signal que `signature-config.ts` (`NODE_ENV`),
 * jamais un second mécanisme de détection d'environnement (mission §8). `NODE_ENV` non défini est
 * traité comme "clément" (comportement local historique inchangé, mission §4 "ne pas empêcher le
 * développement local inutilement") — seule une valeur EXPLICITEMENT différente de "development"/
 * "test" (typiquement "staging" ou "production") déclenche le régime strict.
 */
export function isEmailStrictEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  const nodeEnv = env.NODE_ENV;
  return nodeEnv !== undefined && nodeEnv !== "development" && nodeEnv !== "test";
}

/**
 * P2 (audit Codex, Resend/Demo Request) — décide quel `EmailProvider` brancher, sans jamais
 * retomber silencieusement sur `LoggingEmailProvider` en staging/production (mission §2/§10/§12).
 * Local/test : comportement historique inchangé (Resend si configuré, sinon Logging). Staging/
 * production : Resend est OBLIGATOIRE dès lors que le système email est actif — son absence est une
 * erreur de configuration levée ICI (consommée par `SharedKernelModule` en `useFactory`, donc au
 * moment de la résolution du graphe DI, avant que l'application ne commence à écouter).
 */
export function resolveEmailProviderKind(env: NodeJS.ProcessEnv = process.env): EmailProviderKind {
  const hasResendConfig = Boolean(env.RESEND_API_KEY) && Boolean(env.RESEND_FROM_EMAIL);

  if (!isEmailStrictEnvironment(env)) {
    return hasResendConfig ? "resend" : "logging";
  }

  if (!hasResendConfig) {
    throw new Error(
      "RESEND_API_KEY and RESEND_FROM_EMAIL must both be configured when NODE_ENV is not development/test — " +
        "refusing to silently fall back to LoggingEmailProvider (P2 audit Codex, Resend/Demo Request).",
    );
  }

  return "resend";
}
