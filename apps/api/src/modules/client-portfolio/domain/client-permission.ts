import { ClientRole } from "./client-role";

/**
 * Capacités client (mission Sprint 5.1 §"Policy d'accès client centralisée") — réutilisées par
 * Tenders/Documents/Analysis/Knowledge Base via `ClientAccessPolicy`, jamais recopiées dans un
 * contrôleur (mission §"La logique ne doit pas être copiée dans chaque contrôleur").
 */
export const ClientPermission = {
  Create: "CLIENT_CREATE",
  Read: "CLIENT_READ",
  Update: "CLIENT_UPDATE",
  Archive: "CLIENT_ARCHIVE",
  Restore: "CLIENT_RESTORE",
  Delete: "CLIENT_DELETE",
  AssignUser: "CLIENT_ASSIGN_USER",
  RemoveUser: "CLIENT_REMOVE_USER",
  ViewAll: "CLIENT_VIEW_ALL",
  CreateTender: "CLIENT_CREATE_TENDER",
  ReadTender: "CLIENT_READ_TENDER",
  UpdateTender: "CLIENT_UPDATE_TENDER",
  ReadDocuments: "CLIENT_READ_DOCUMENTS",
  ReadAnalysis: "CLIENT_READ_ANALYSIS",
  ReadKnowledge: "CLIENT_READ_KNOWLEDGE",
  /** Créer/modifier une entrée Knowledge Base spécifique à ce client — au-delà du seul
   *  `CLIENT_READ_KNOWLEDGE` documenté dans la liste d'exemples de la mission, nécessaire pour
   *  distinguer lecture et écriture (mission §"CLIENT_MANAGER : consulter ET MODIFIER"). */
  ManageKnowledge: "CLIENT_MANAGE_KNOWLEDGE",
} as const;

export type ClientPermission = (typeof ClientPermission)[keyof typeof ClientPermission];

/**
 * Palier ORGANISATION — capacités de PORTEFEUILLE (créer/archiver/restaurer/supprimer un client,
 * voir la liste complète) : jamais délégable via un rôle client, réservé à OWNER/ORGANIZATION_ADMIN
 * (mission §"OWNER : accès à tous les clients... ADMIN : accès à tous les clients selon le modèle
 * de permission existant" — même superset strict que `ROLE_TENDER_PERMISSIONS`/
 * `ROLE_KNOWLEDGE_PERMISSIONS`). Un rôle absent de cette table (BID_MANAGER, CONTRIBUTOR,
 * REVIEWER, EXECUTIVE, EXTERNAL_CONSULTANT, READ_ONLY, ou un rôle inconnu) n'a AUCUNE capacité de
 * portefeuille — leur accès à un client précis passe uniquement par une affectation
 * (`ROLE_CLIENT_ACTION_PERMISSIONS` ci-dessous).
 */
const PORTFOLIO_PERMISSIONS: readonly ClientPermission[] = [
  ClientPermission.Create,
  ClientPermission.Read,
  ClientPermission.Update,
  ClientPermission.Archive,
  ClientPermission.Restore,
  ClientPermission.Delete,
  ClientPermission.AssignUser,
  ClientPermission.RemoveUser,
  ClientPermission.ViewAll,
  ClientPermission.CreateTender,
  ClientPermission.ReadTender,
  ClientPermission.UpdateTender,
  ClientPermission.ReadDocuments,
  ClientPermission.ReadAnalysis,
  ClientPermission.ReadKnowledge,
  ClientPermission.ManageKnowledge,
];

export const ROLE_CLIENT_PORTFOLIO_PERMISSIONS: Record<string, readonly ClientPermission[]> = {
  OWNER: PORTFOLIO_PERMISSIONS,
  ORGANIZATION_ADMIN: PORTFOLIO_PERMISSIONS,
};

export function roleHasClientPortfolioPermission(role: string, permission: ClientPermission): boolean {
  return (ROLE_CLIENT_PORTFOLIO_PERMISSIONS[role] ?? []).includes(permission);
}

/**
 * Palier CLIENT — capacités accordées par le RÔLE CLIENT d'une affectation active
 * (`ClientAssignment.role`), utilisées UNIQUEMENT pour un acteur non-OWNER/ADMIN qui accède à un
 * client précis via sa propre affectation (mission §"Droits" par rôle client). Un rôle client
 * inconnu (jamais censé arriver, la colonne est protégée par une contrainte CHECK) ne reçoit
 * aucun droit.
 */
export const ROLE_CLIENT_ACTION_PERMISSIONS: Record<string, readonly ClientPermission[]> = {
  [ClientRole.ClientManager]: [
    ClientPermission.Read,
    ClientPermission.Update,
    ClientPermission.AssignUser,
    ClientPermission.RemoveUser,
    ClientPermission.CreateTender,
    ClientPermission.ReadTender,
    ClientPermission.UpdateTender,
    ClientPermission.ReadDocuments,
    ClientPermission.ReadAnalysis,
    ClientPermission.ReadKnowledge,
    ClientPermission.ManageKnowledge,
  ],
  [ClientRole.Contributor]: [
    ClientPermission.Read,
    ClientPermission.CreateTender,
    ClientPermission.ReadTender,
    ClientPermission.UpdateTender,
    ClientPermission.ReadDocuments,
    ClientPermission.ReadAnalysis,
    ClientPermission.ReadKnowledge,
    ClientPermission.ManageKnowledge,
  ],
  [ClientRole.Viewer]: [
    ClientPermission.Read,
    ClientPermission.ReadTender,
    ClientPermission.ReadDocuments,
    ClientPermission.ReadAnalysis,
    ClientPermission.ReadKnowledge,
  ],
};

export function clientRoleHasActionPermission(role: string, permission: ClientPermission): boolean {
  return (ROLE_CLIENT_ACTION_PERMISSIONS[role] ?? []).includes(permission);
}
