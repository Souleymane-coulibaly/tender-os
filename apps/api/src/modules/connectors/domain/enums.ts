/** Catalogue gouverné (mission §5) — extensible plus tard, jamais une string arbitraire acceptée
 *  à la création d'une connexion. */
export const ConnectorProvider = {
  Microsoft365: "MICROSOFT_365",
  GoogleWorkspace: "GOOGLE_WORKSPACE",
} as const;
export type ConnectorProvider = (typeof ConnectorProvider)[keyof typeof ConnectorProvider];

/** PENDING = flow OAuth initié, callback pas encore réussi (mission §6). ACTIVE = utilisable.
 *  REAUTH_REQUIRED = refresh définitivement échoué (mission §11, jamais une suppression
 *  silencieuse). REVOKED = déconnectée par un utilisateur (mission §12), historique conservé. */
export const ConnectionStatus = {
  Pending: "PENDING",
  Active: "ACTIVE",
  ReauthRequired: "REAUTH_REQUIRED",
  Revoked: "REVOKED",
} as const;
export type ConnectionStatus = (typeof ConnectionStatus)[keyof typeof ConnectionStatus];

/** Mission §36 — BIDIRECTIONAL délibérément absent ce sprint (décision validée AskUserQuestion). */
export const SyncDirection = {
  ImportOnly: "IMPORT_ONLY",
  ExportOnly: "EXPORT_ONLY",
} as const;
export type SyncDirection = (typeof SyncDirection)[keyof typeof SyncDirection];

/** V2 Sprint 20 — mission §13, modèle commun d'erreur provider. Microsoft ET Google traduisent
 *  leurs codes HTTP/erreurs spécifiques vers ce catalogue unique — jamais un statut HTTP brut
 *  propagé tel quel côté application (`infrastructure/provider-http-client.ts`). */
export const ProviderErrorCode = {
  AuthError: "AUTH_ERROR",
  PermissionDenied: "PERMISSION_DENIED",
  NotFound: "NOT_FOUND",
  Conflict: "CONFLICT",
  RateLimited: "RATE_LIMITED",
  Timeout: "TIMEOUT",
  ProviderUnavailable: "PROVIDER_UNAVAILABLE",
  InvalidRequest: "INVALID_REQUEST",
  Unknown: "UNKNOWN",
} as const;
export type ProviderErrorCode = (typeof ProviderErrorCode)[keyof typeof ProviderErrorCode];
