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

export function connectionStatusBadgeClass(status: ConnectionStatus): string {
  switch (status) {
    case "ACTIVE":
      return "bg-green-100 text-green-800";
    case "REAUTH_REQUIRED":
      return "bg-amber-100 text-amber-800";
    case "PENDING":
      return "bg-neutral-200 text-neutral-700";
    case "REVOKED":
      return "bg-neutral-200 text-neutral-500";
  }
}

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
