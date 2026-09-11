import type { BadgeTone } from "../components/ui";

export const CONNECTOR_PROVIDERS = ["MICROSOFT_365", "GOOGLE_WORKSPACE"] as const;
export type ConnectorProvider = (typeof CONNECTOR_PROVIDERS)[number];

export const CONNECTOR_PROVIDER_LABELS: Record<ConnectorProvider, string> = {
  MICROSOFT_365: "Microsoft 365",
  GOOGLE_WORKSPACE: "Google Workspace",
};

export const CONNECTOR_PROVIDER_FEATURES: Record<ConnectorProvider, string> = {
  MICROSOFT_365: "SharePoint • OneDrive • Calendrier",
  GOOGLE_WORKSPACE: "Drive • Calendrier",
};

export type ConnectionStatus = "PENDING" | "ACTIVE" | "REAUTH_REQUIRED" | "REVOKED";

export const CONNECTION_STATUS_LABELS: Record<ConnectionStatus, string> = {
  PENDING: "Connexion en cours",
  ACTIVE: "Connecté",
  REAUTH_REQUIRED: "Reconnexion requise",
  REVOKED: "Déconnecté",
};

/** Design System — ton du `<Badge>` par statut de connexion (remplace l'ancien
 *  `connectionStatusBadgeClass()`, classes Tailwind brutes ; mêmes couleurs sémantiques). */
export const CONNECTION_STATUS_TONE: Record<ConnectionStatus, BadgeTone> = {
  ACTIVE: "success",
  REAUTH_REQUIRED: "warning",
  PENDING: "neutral",
  REVOKED: "neutral",
};

export type ExternalConnectionSummary = {
  id: string;
  provider: ConnectorProvider;
  name: string;
  status: ConnectionStatus;
  scopes: readonly string[];
  externalAccountLabel?: string;
  externalTenantId?: string;
  allowedClientAccountIds: readonly string[];
  lastRefreshAt?: string;
  lastSuccessfulSyncAt?: string;
  lastError?: string;
  connectedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type RemoteContainer = { id: string; name: string; kind: string };
export type RemoteFolder = { id: string; name: string };
export type RemoteFile = { id: string; name: string; mimeType: string; sizeBytes: number; modifiedAt: string; webUrl?: string };
export type RemoteFolderListing = { folders: readonly RemoteFolder[]; files: readonly RemoteFile[] };
export type BrowseResult = { containers?: readonly RemoteContainer[]; listing?: RemoteFolderListing };

/** Vérification UI uniquement — le backend revalide toujours via `ConnectorPermission` (mission
 *  §48). `Manage` = OWNER/ORGANIZATION_ADMIN uniquement (connecter/déconnecter) ; `Use` = aussi
 *  BID_MANAGER/CONTRIBUTOR (importer/exporter une fois une connexion déjà établie). */
const MANAGE_TIER = ["OWNER", "ORGANIZATION_ADMIN"];
const USE_TIER = ["OWNER", "ORGANIZATION_ADMIN", "BID_MANAGER", "CONTRIBUTOR"];
export function canManageConnectors(role: string | undefined): boolean {
  return role !== undefined && MANAGE_TIER.includes(role);
}
export function canUseConnectors(role: string | undefined): boolean {
  return role !== undefined && USE_TIER.includes(role);
}
