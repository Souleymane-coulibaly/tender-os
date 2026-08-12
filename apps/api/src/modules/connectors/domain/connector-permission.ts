import { DomainError } from "../../../shared-kernel/domain-error";

/**
 * Mission §48 — adapté au RBAC existant plutôt qu'une copie littérale : `MICROSOFT_CONNECT` et
 * `GOOGLE_CONNECT` sont consolidés en un seul `Manage` (les deux providers ont exactement le même
 * profil de risque — connecter le tenant M365/Google d'une organisation — inventer deux
 * permissions identiques en pratique aurait été une complexité inutile). `Manage` (connecter/
 * réautoriser/déconnecter) suit le motif "table binaire" `IntegrationPermission` (Sprint 16) : seuls
 * OWNER/ORGANIZATION_ADMIN, administrer le tenant M365/Google de l'organisation est un acte sensible.
 *
 * `Read` en revanche est délibérément au MÊME palier que `DocumentImport`/`DocumentExport`
 * (Contributor+), pas OWNER/ADMIN-only — correctif d'un défaut de conception détecté via preuve
 * E2E réelle : `ListExternalConnectionsUseCase` (donc `Read`) est un préalable STRUCTUREL à toute
 * page/action utilisant une connexion (impossible de choisir/utiliser une connexion sans d'abord la
 * lister) ; la gater à OWNER/ADMIN aurait rendu `DocumentImport`/`DocumentExport` inatteignables en
 * pratique pour un CONTRIBUTOR/BID_MANAGER — une capacité accordée mais jamais utilisable n'a aucun
 * sens. Contrairement à `ApiKey`/`WebhookSubscription` (Sprint 16, où même l'EXISTENCE d'une
 * intégration est jugée sensible), savoir "cette organisation a une connexion Microsoft active,
 * connectée par X" est une information nettement moins sensible — jamais un secret, un scope détaillé
 * ou une URL cible.
 *
 * `DocumentImport`/`DocumentExport` restent au palier Contributor+ (jamais Viewer+ pour
 * `DocumentExport`) : contrairement à `DocumentPermission.Download` (lecture pure, réservée à
 * l'acteur authentifié), exporter VERS SharePoint/Drive/Calendrier est une écriture dans un système
 * externe, hors du périmètre d'audit TenderOS — un acteur en lecture seule ne doit jamais pouvoir y
 * faire apparaître un nouvel artefact. L'autorisation réelle cible/Tender/Document reste vérifiée
 * séparément par le module `documents` (mission §50/§51) — `Read`/`DocumentImport`/`DocumentExport`
 * ne sont qu'un premier filtre de capacité.
 */
export const ConnectorPermission = {
  Read: "CONNECTORS_READ",
  Manage: "CONNECTORS_MANAGE",
  DocumentImport: "EXTERNAL_DOCUMENT_IMPORT",
  DocumentExport: "EXTERNAL_DOCUMENT_EXPORT",
} as const;

export type ConnectorPermission = (typeof ConnectorPermission)[keyof typeof ConnectorPermission];

const ALL_PERMISSIONS: readonly ConnectorPermission[] = Object.values(ConnectorPermission);
const USE_TIER: readonly ConnectorPermission[] = [ConnectorPermission.Read, ConnectorPermission.DocumentImport, ConnectorPermission.DocumentExport];

export const ROLE_CONNECTOR_PERMISSIONS: Record<string, readonly ConnectorPermission[]> = {
  OWNER: ALL_PERMISSIONS,
  ORGANIZATION_ADMIN: ALL_PERMISSIONS,
  BID_MANAGER: USE_TIER,
  CONTRIBUTOR: USE_TIER,
  REVIEWER: [],
  EXECUTIVE: [],
  EXTERNAL_CONSULTANT: [],
  READ_ONLY: [],
};

export function roleHasConnectorPermission(role: string, permission: ConnectorPermission): boolean {
  return (ROLE_CONNECTOR_PERMISSIONS[role] ?? []).includes(permission);
}

export function assertHasConnectorPermission(role: string, permission: ConnectorPermission): void {
  if (!roleHasConnectorPermission(role, permission)) {
    throw new ConnectorPermissionMissingError();
  }
}

export class ConnectorPermissionMissingError extends DomainError {
  readonly code = "CONNECTOR_PERMISSION_MISSING";
  constructor() {
    super("You do not have permission to perform this connector action for this organization.");
  }
}
