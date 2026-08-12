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
