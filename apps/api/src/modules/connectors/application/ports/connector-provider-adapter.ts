import type { ConnectorProvider } from "../../domain/enums";

export type OAuthTokenResult = Readonly<{
  accessToken: string;
  refreshToken?: string | undefined;
  expiresInSeconds: number;
  scopes: readonly string[];
}>;

export type OAuthAccountInfo = Readonly<{
  externalAccountId: string;
  externalTenantId?: string | undefined;
  externalAccountLabel?: string | undefined;
}>;

export type RemoteContainer = Readonly<{ id: string; name: string; kind: string }>;
export type RemoteFolder = Readonly<{ id: string; name: string }>;
export type RemoteFile = Readonly<{ id: string; name: string; mimeType: string; sizeBytes: number; modifiedAt: Date; eTag?: string | undefined; webUrl?: string | undefined }>;
export type RemoteFolderListing = Readonly<{ folders: readonly RemoteFolder[]; files: readonly RemoteFile[] }>;
export type DownloadedFile = Readonly<{ buffer: Buffer; mimeType: string; filename: string }>;

/**
 * Mission §1 — port unique, jamais un appel Microsoft Graph/Google API disséminé dans les modules
 * métier. Une seule interface pour les deux providers (mission §14/§27 : "adapter dédié" par
 * provider, mais la FORME de ce qu'un adapter expose est commune — OAuth + navigation + fichiers +
 * calendrier), sélectionnée par `provider` via `CONNECTOR_PROVIDER_ADAPTERS` (une Map, jamais un
 * `if/else` dispersé). `accessToken` est toujours passé en clair par l'appelant (déjà déchiffré
 * juste avant, jamais persisté ni loggé par l'adapter lui-même) — l'adapter ne connaît jamais
 * `ExternalConnection` ni le chiffrement, uniquement le protocole HTTP du provider.
 */
export interface ConnectorProviderAdapter {
  readonly provider: ConnectorProvider;

  buildAuthorizationUrl(input: { state: string; codeChallenge: string; redirectUri: string }): string;
  exchangeCodeForTokens(input: { code: string; codeVerifier: string; redirectUri: string }): Promise<OAuthTokenResult>;
  refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult>;
  fetchAccountInfo(accessToken: string): Promise<OAuthAccountInfo>;
  /** Best-effort (mission §12) — l'échec de révocation côté provider ne doit jamais empêcher la
   *  déconnexion locale (la connexion TenderOS est de toute façon révoquée et ses credentials
   *  effacés dans tous les cas, voir `ExternalConnection.revoke`). */
  revokeToken(refreshToken: string): Promise<void>;

  listContainers(accessToken: string): Promise<readonly RemoteContainer[]>;
  listFolderChildren(accessToken: string, input: { containerId: string; folderId?: string | undefined }): Promise<RemoteFolderListing>;
  downloadFile(accessToken: string, input: { containerId: string; fileId: string; mimeType: string }): Promise<DownloadedFile>;
  uploadFile(accessToken: string, input: { containerId: string; folderId: string; filename: string; content: Buffer; mimeType: string }): Promise<RemoteFile>;

  createCalendarEvent(accessToken: string, input: { title: string; description: string; startAt: Date; endAt: Date; timezone: string }): Promise<{ externalEventId: string }>;
}

export const CONNECTOR_PROVIDER_ADAPTERS = Symbol("CONNECTOR_PROVIDER_ADAPTERS");
/** Injecté comme `Map<ConnectorProvider, ConnectorProviderAdapter>` (mission §5, catalogue
 *  extensible plus tard). */
export type ConnectorProviderAdapterMap = ReadonlyMap<ConnectorProvider, ConnectorProviderAdapter>;
