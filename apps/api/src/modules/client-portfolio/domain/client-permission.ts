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
  /** Sprint 6 (Generation) — lire/lancer-éditer-régénérer/valider une génération IA pour ce client,
   *  même motif additif que `ManageKnowledge` : distingue lecture, écriture, et validation plutôt
   *  que de réutiliser une permission existante sémantiquement différente. */
  ReadGeneration: "CLIENT_READ_GENERATION",
  ManageGeneration: "CLIENT_MANAGE_GENERATION",
  ValidateGeneration: "CLIENT_VALIDATE_GENERATION",
  /** Sprint 7 (AI Pricing & Prévisions) — même motif additif que `ReadGeneration`/`ManageGeneration` :
   *  consulter le coût/les estimations d'un Tender ou d'un client vs. créer/recalculer/archiver une
   *  estimation, deux capacités distinctes plutôt qu'une seule permission ambiguë. */
  ReadPricing: "CLIENT_READ_PRICING",
  ManagePricing: "CLIENT_MANAGE_PRICING",
  /** Sprint 8A/8A bis (Export, Validation, Signature, Package) — même motif additif que
   *  `ReadPricing`/`ManagePricing` : consulter (aperçu/export/validation/signature/package) vs.
   *  créer/agir (aperçu, export final, validation, résolution, signataires, exigences de
   *  signature) vs. les actions à "règle stricte" de la mission (approbation finale, démarrage
   *  d'une signature, import d'un document signé, création du package) — trois capacités
   *  distinctes plutôt qu'une seule permission ambiguë (mission §42/§56 "Selon règle stricte"). */
  ReadExport: "CLIENT_READ_EXPORT",
  ManageExport: "CLIENT_MANAGE_EXPORT",
  ApproveExport: "CLIENT_APPROVE_EXPORT",
  /** Sprint 8A.1 (Espace Livrables) — même motif additif que `ReadGeneration`/`ManageGeneration`/
   *  `ValidateGeneration` : consulter un livrable/une section/une révision vs. éditer/générer/
   *  soumettre à revue/commenter vs. valider/approuver une revue/sélectionner pour l'export
   *  ("règle stricte" implicite, mission §17 — même palier que `ApproveExport`). */
  ReadDeliverable: "CLIENT_READ_DELIVERABLE",
  ManageDeliverable: "CLIENT_MANAGE_DELIVERABLE",
  ValidateDeliverable: "CLIENT_VALIDATE_DELIVERABLE",
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
  ClientPermission.ReadGeneration,
  ClientPermission.ManageGeneration,
  ClientPermission.ValidateGeneration,
  ClientPermission.ReadPricing,
  ClientPermission.ManagePricing,
  ClientPermission.ReadExport,
  ClientPermission.ManageExport,
  ClientPermission.ApproveExport,
  ClientPermission.ReadDeliverable,
  ClientPermission.ManageDeliverable,
  ClientPermission.ValidateDeliverable,
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
    ClientPermission.ReadGeneration,
    ClientPermission.ManageGeneration,
    ClientPermission.ValidateGeneration,
    ClientPermission.ReadPricing,
    ClientPermission.ManagePricing,
    ClientPermission.ReadExport,
    ClientPermission.ManageExport,
    ClientPermission.ApproveExport,
    ClientPermission.ReadDeliverable,
    ClientPermission.ManageDeliverable,
    /** Mission §17 "Valider : Selon politique" — accordé au CLIENT_MANAGER, même palier que
     *  `ApproveExport` ("règle stricte"), jamais au CONTRIBUTOR. */
    ClientPermission.ValidateDeliverable,
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
    ClientPermission.ReadGeneration,
    ClientPermission.ManageGeneration,
    /** "Règle simple" (mission Sprint 6 §"Validation") — présent ici comme porte grossière ("ce
     *  rôle peut valider AU MOINS ses propres générations") ; la restriction fine "uniquement ses
     *  propres générations" est appliquée par `generation-validate.policy.ts`, jamais ici. */
    ClientPermission.ValidateGeneration,
    ClientPermission.ReadPricing,
    ClientPermission.ManagePricing,
    ClientPermission.ReadExport,
    /** Mission §42/§56 "Créer un export final : Selon règle" / "Lancer la validation : Oui" —
     *  accordé au CONTRIBUTOR ; en revanche `ApproveExport` ("règle stricte") reste réservé au
     *  CLIENT_MANAGER et au palier organisation, jamais au CONTRIBUTOR. */
    ClientPermission.ManageExport,
    ClientPermission.ReadDeliverable,
    ClientPermission.ManageDeliverable,
  ],
  [ClientRole.Viewer]: [
    ClientPermission.Read,
    ClientPermission.ReadTender,
    ClientPermission.ReadDocuments,
    ClientPermission.ReadAnalysis,
    ClientPermission.ReadKnowledge,
    ClientPermission.ReadGeneration,
    ClientPermission.ReadPricing,
    ClientPermission.ReadExport,
    ClientPermission.ReadDeliverable,
  ],
};

export function clientRoleHasActionPermission(role: string, permission: ClientPermission): boolean {
  return (ROLE_CLIENT_ACTION_PERMISSIONS[role] ?? []).includes(permission);
}
