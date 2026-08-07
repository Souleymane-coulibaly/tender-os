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
  /** V2 Sprint 3 §4/§16 — "un changement d'entreprise candidate doit être... fortement contrôlé" :
   *  palier distinct et plus restreint qu'`UpdateTender` (même motif que `ReadCompanyBanking` vs
   *  `ReadCompanyProfile`), vérifié à la fois sur le ClientAccount ACTUEL et sur le NOUVEAU
   *  ClientAccount cible (voir `ChangeTenderClientAccountUseCase`) — jamais délégué au CONTRIBUTOR. */
  ChangeTenderCandidate: "CLIENT_CHANGE_TENDER_CANDIDATE",
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
  /** Sprint 8C Phase 1 (Dossier administratif) — même motif additif que `ReadDeliverable`/
   *  `ManageDeliverable`/`ValidateDeliverable` : consulter le dossier/la checklist vs. créer/éditer
   *  une exigence ou une pièce vs. valider une exigence/un document ("règle stricte" — même palier
   *  que `ValidateDeliverable`/`ApproveExport`). Distingue en plus la gestion du DOSSIER (exigences)
   *  de celle des DOCUMENTS (pièces/révisions) — deux surfaces différentes de la mission §22. */
  ReadAdministrativeDossier: "CLIENT_READ_ADMINISTRATIVE_DOSSIER",
  ManageAdministrativeDossier: "CLIENT_MANAGE_ADMINISTRATIVE_DOSSIER",
  ValidateAdministrativeDossier: "CLIENT_VALIDATE_ADMINISTRATIVE_DOSSIER",
  ManageAdministrativeDocuments: "CLIENT_MANAGE_ADMINISTRATIVE_DOCUMENTS",
  ValidateAdministrativeDocuments: "CLIENT_VALIDATE_ADMINISTRATIVE_DOCUMENTS",
  /** Sprint 9 (Dépôt manuel assisté) — même motif additif que `ReadAdministrativeDossier`/
   *  `ManageAdministrativeDossier`/`ValidateAdministrativeDossier` : consulter le suivi de dépôt vs.
   *  préparer/enregistrer/ajouter une preuve/remplacer/rejeter vs. confirmer un reçu ("règle simple"
   *  déléguée au CONTRIBUTOR) vs. retirer un dépôt ("règle stricte", même palier que
   *  `ValidateAdministrativeDossier` — mission §15/§20 "Retrait : réservé au palier le plus élevé"). */
  ReadSubmission: "CLIENT_READ_SUBMISSION",
  ManageSubmission: "CLIENT_MANAGE_SUBMISSION",
  ConfirmSubmission: "CLIENT_CONFIRM_SUBMISSION",
  WithdrawSubmission: "CLIENT_WITHDRAW_SUBMISSION",
  /** V2 Sprint 2 (Entreprise candidate) — même motif additif que `ReadSubmission`/
   *  `ManageSubmission` : consulter vs. créer/éditer/archiver/restaurer l'identité légale, les
   *  représentants, assurances, certifications, références, moyens humains/matériels et documents
   *  génériques du profil. Les données BANCAIRES ont leurs propres permissions séparées
   *  ci-dessous (mission §7 "les données bancaires et juridiques sensibles peuvent nécessiter une
   *  permission dédiée") — jamais couvertes par celles-ci. */
  ReadCompanyProfile: "CLIENT_READ_COMPANY_PROFILE",
  ManageCompanyProfile: "CLIENT_MANAGE_COMPANY_PROFILE",
  /** Palier séparé et volontairement plus restreint (mission §7) — voir
   *  `ROLE_CLIENT_ACTION_PERMISSIONS` : jamais accordé au CONTRIBUTOR ni au VIEWER, réservé au
   *  CLIENT_MANAGER et au palier organisation. */
  ReadCompanyBanking: "CLIENT_READ_COMPANY_BANKING",
  ManageCompanyBanking: "CLIENT_MANAGE_COMPANY_BANKING",
  /** V2 Sprint 5 (GO/NO-GO IA) — même motif additif que `ReadSubmission`/`ManageSubmission` :
   *  consulter une Opportunity (Niveau 1) ou un rapport/décision GO/NO-GO (Niveau 2) vs. créer/
   *  éditer une Opportunity/calculer un score vs. enregistrer une décision GO/NO-GO/promouvoir —
   *  ces deux dernières restent au palier "règle stricte" (mission §19 confirmé : aucune
   *  dérogation, décision réservée), même palier que `ValidateDeliverable`/`ChangeTenderCandidate`,
   *  jamais délégué au CONTRIBUTOR.
   */
  ReadOpportunity: "CLIENT_READ_OPPORTUNITY",
  ManageOpportunity: "CLIENT_MANAGE_OPPORTUNITY",
  ReadGoNoGo: "CLIENT_READ_GO_NO_GO",
  RecordGoNoGoDecision: "CLIENT_RECORD_GO_NO_GO_DECISION",
  PromoteOpportunity: "CLIENT_PROMOTE_OPPORTUNITY",
  /** Répertoire organisationnel de sous-traitants (mission §6) — PAS scopé par ClientAccount
   *  (réutilisable par plusieurs entreprises candidates de la même organisation), donc absent de
   *  `ROLE_CLIENT_ACTION_PERMISSIONS` ci-dessous ; vérifié uniquement au palier organisation via
   *  `roleHasClientPortfolioPermission`/`OrganizationRole`, jamais via une affectation client
   *  précise (voir module `subcontractors`, `subcontractor-permission.ts`, qui réutilise le même
   *  motif de matrice en code que ce fichier plutôt qu'un second système).
   */
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
  ClientPermission.ChangeTenderCandidate,
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
  ClientPermission.ReadAdministrativeDossier,
  ClientPermission.ManageAdministrativeDossier,
  ClientPermission.ValidateAdministrativeDossier,
  ClientPermission.ManageAdministrativeDocuments,
  ClientPermission.ValidateAdministrativeDocuments,
  ClientPermission.ReadSubmission,
  ClientPermission.ManageSubmission,
  ClientPermission.ConfirmSubmission,
  ClientPermission.WithdrawSubmission,
  ClientPermission.ReadCompanyProfile,
  ClientPermission.ManageCompanyProfile,
  ClientPermission.ReadCompanyBanking,
  ClientPermission.ManageCompanyBanking,
  ClientPermission.ReadOpportunity,
  ClientPermission.ManageOpportunity,
  ClientPermission.ReadGoNoGo,
  // V2 Sprint 5 (audit Codex, round 2 — P1 confirmé) — `RecordGoNoGoDecision`/`PromoteOpportunity`
  // sont volontairement ABSENTES de ce bypass organisation-tier silencieux : le chemin normal exige
  // une affectation CLIENT_MANAGER réelle sur le client précis, y compris pour OWNER/
  // ORGANIZATION_ADMIN. Un filet de sécurité anti-lockout reste accordé à CES DEUX RÔLES SEULEMENT
  // (jamais BID_MANAGER/CONTRIBUTOR), mais via un chemin séparé et TRACÉ
  // (`opportunity/application/policies/go-no-go-client-access.policy.ts#resolveGoNoGoClientAccess`),
  // jamais ce bypass silencieux générique.
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
    /** V2 Sprint 3 — réservé au CLIENT_MANAGER (et au palier organisation ci-dessus), jamais au
     *  CONTRIBUTOR ni au VIEWER (mission §4 "fortement contrôlé"). */
    ClientPermission.ChangeTenderCandidate,
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
    /** Sprint 8C Phase 1 — même palier "règle stricte" que `ValidateDeliverable` : le CLIENT_MANAGER
     *  peut consulter/gérer/valider le dossier et ses documents. */
    ClientPermission.ReadAdministrativeDossier,
    ClientPermission.ManageAdministrativeDossier,
    ClientPermission.ValidateAdministrativeDossier,
    ClientPermission.ManageAdministrativeDocuments,
    ClientPermission.ValidateAdministrativeDocuments,
    /** Sprint 9 — le CLIENT_MANAGER a tous les droits de suivi de dépôt, y compris le retrait
     *  ("règle stricte"). */
    ClientPermission.ReadSubmission,
    ClientPermission.ManageSubmission,
    ClientPermission.ConfirmSubmission,
    ClientPermission.WithdrawSubmission,
    /** V2 Sprint 2 — le CLIENT_MANAGER a tous les droits sur le profil ET les données bancaires
     *  (mission §7 "les données bancaires... peuvent nécessiter une permission dédiée" — seul le
     *  CLIENT_MANAGER les reçoit, ni le CONTRIBUTOR ni le VIEWER ci-dessous). */
    ClientPermission.ReadCompanyProfile,
    ClientPermission.ManageCompanyProfile,
    ClientPermission.ReadCompanyBanking,
    ClientPermission.ManageCompanyBanking,
    /** V2 Sprint 5 — le CLIENT_MANAGER a tous les droits GO/NO-GO, y compris enregistrer une
     *  décision et promouvoir une Opportunity ("règle stricte", mission §19). */
    ClientPermission.ReadOpportunity,
    ClientPermission.ManageOpportunity,
    ClientPermission.ReadGoNoGo,
    ClientPermission.RecordGoNoGoDecision,
    ClientPermission.PromoteOpportunity,
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
    /** Sprint 8C Phase 1 — le CONTRIBUTOR peut consulter/gérer (créer/éditer des exigences et
     *  documents) mais jamais valider ("règle stricte" réservée au CLIENT_MANAGER ci-dessus). */
    ClientPermission.ReadAdministrativeDossier,
    ClientPermission.ManageAdministrativeDossier,
    ClientPermission.ManageAdministrativeDocuments,
    /** Sprint 9 — le CONTRIBUTOR peut consulter/préparer/enregistrer/ajouter une preuve/remplacer/
     *  rejeter (`ManageSubmission`) et confirmer un reçu ("règle simple"), mais jamais retirer un
     *  dépôt ("règle stricte" réservée au CLIENT_MANAGER ci-dessus, mission §15/§20). */
    ClientPermission.ReadSubmission,
    ClientPermission.ManageSubmission,
    ClientPermission.ConfirmSubmission,
    /** V2 Sprint 2 — le CONTRIBUTOR peut consulter/gérer le profil général mais jamais les
     *  données bancaires (réservées au CLIENT_MANAGER ci-dessus). */
    ClientPermission.ReadCompanyProfile,
    ClientPermission.ManageCompanyProfile,
    /** V2 Sprint 5 — le CONTRIBUTOR peut consulter/préparer (créer une Opportunity, calculer un
     *  score, consulter un rapport) mais jamais enregistrer une décision ni promouvoir ("règle
     *  stricte" réservée au CLIENT_MANAGER ci-dessus, mission §19). */
    ClientPermission.ReadOpportunity,
    ClientPermission.ManageOpportunity,
    ClientPermission.ReadGoNoGo,
  ],
  [ClientRole.Viewer]: [
    ClientPermission.Read,
    ClientPermission.ReadTender,
    ClientPermission.ReadDocuments,
    ClientPermission.ReadAnalysis,
    ClientPermission.ReadKnowledge,
    ClientPermission.ReadGeneration,
    /** V2 Sprint 2 — le VIEWER consulte le profil général, jamais les données bancaires. */
    ClientPermission.ReadCompanyProfile,
    ClientPermission.ReadPricing,
    ClientPermission.ReadExport,
    ClientPermission.ReadDeliverable,
    ClientPermission.ReadAdministrativeDossier,
    ClientPermission.ReadSubmission,
    /** V2 Sprint 5 — le VIEWER consulte l'Opportunity et les rapports/décisions GO/NO-GO, jamais
     *  ni ne les crée ni ne les gère. */
    ClientPermission.ReadOpportunity,
    ClientPermission.ReadGoNoGo,
  ],
};

export function clientRoleHasActionPermission(role: string, permission: ClientPermission): boolean {
  return (ROLE_CLIENT_ACTION_PERMISSIONS[role] ?? []).includes(permission);
}
