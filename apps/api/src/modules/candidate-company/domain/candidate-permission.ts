import { CandidatePermissionMissingError } from "./errors";

/**
 * Checkpoint TENDEROS-2.1-CCV2-A — couche d'autorisation de l'entreprise candidate, livrée AVANT
 * toute migration de capacités/documents (CCV2-B/C) : repointer des satellites sensibles (IBAN,
 * assurances, certifications) vers une entité gardée par la seule appartenance à l'organisation
 * serait une régression de sécurité livrée avant sa protection (finding CCV2-P0-01).
 *
 * PALIER UNIQUE — ORGANISATION. Contrairement à `ClientPermission` (client-portfolio), il n'existe
 * PAS de second palier ici : `CandidateCompany` est rattachée directement à `Organization` (1→N,
 * jamais à `ClientAccount`), donc aucun équivalent de `ClientAssignment` n'existe et aucune table
 * d'affectation n'est créée — l'ACL complexe est explicitement écartée (mission CCV2 §20). Le rôle
 * évalué est TOUJOURS `OrganizationMembership.role` (`MembershipContext.role`), jamais un rôle
 * client. Même motif exact que `ai-routing/domain/ai-routing-permission.ts` et
 * `market-watch/domain/market-watch-permission.ts`.
 *
 * Un rôle inconnu ne reçoit AUCUNE permission (refus par défaut, PERM-001) — jamais un accès
 * implicite parce que la table ne le mentionne pas.
 */
export const CandidatePermission = {
  /** Lire l'entreprise candidate, ses établissements et (CCV2-C) ses capacités NON bancaires. */
  Read: "candidate:read",
  /**
   * Créer une entreprise candidate et déclarer ses établissements (SIRET) — l'IDENTITÉ JURIDIQUE,
   * distincte des capacités. Absente de la liste minimale de la mission CCV2-A, ajoutée ici parce
   * que les routes concernées EXISTENT DÉJÀ et devaient être protégées : les laisser ouvertes
   * aurait contredit la décision produit "EXTERNAL_CONSULTANT / READ_ONLY : lecture uniquement,
   * jamais de mutation". Le palier retenu (jamais CONTRIBUTOR) découle de la même décision, qui
   * limite le CONTRIBUTOR à "édition capacités + upload documents" — créer une personne morale
   * n'est ni l'un ni l'autre.
   */
  ManageIdentity: "candidate:manage_identity",
  /** Éditer les capacités candidate NON bancaires (CCV2-C) : certifications, assurances,
   *  références, moyens humains/matériels, représentants. */
  CapabilityEdit: "candidate:capability_edit",
  /** Rattacher un document à l'entreprise candidate (CCV2-C). */
  DocumentUpload: "candidate:document_upload",
  /** Détacher/supprimer un document de l'entreprise candidate (CCV2-C) — palier strictement plus
   *  élevé que l'upload, jamais délégué au CONTRIBUTOR (décision produit CCV2-A §3). */
  DocumentDelete: "candidate:document_delete",
  /**
   * Lire les coordonnées bancaires candidate (CCV2-C.1). Reproduit le palier de
   * `ClientPermission.ReadCompanyBanking`, aujourd'hui réservé au seul CLIENT_MANAGER : cette
   * permission ne doit JAMAIS être accordée à un rôle qui n'a pas déjà accès au banking legacy,
   * sans quoi la migration CCV2-B constituerait une escalade de privilège sur des IBAN.
   */
  ReadBanking: "candidate:read_banking",
  /** Créer/modifier/archiver un compte bancaire candidate (CCV2-C.1) — même palier que
   *  `ClientPermission.ManageCompanyBanking`. */
  ManageBanking: "candidate:manage_banking",
} as const;

export type CandidatePermission = (typeof CandidatePermission)[keyof typeof CandidatePermission];

const ALL_PERMISSIONS: readonly CandidatePermission[] = Object.values(CandidatePermission);

/** Lecture seule stricte — décision produit CCV2-A §3 : REVIEWER, EXECUTIVE, EXTERNAL_CONSULTANT et
 *  READ_ONLY voient l'entreprise candidate mais ne la mutent jamais et n'accèdent jamais au
 *  banking. */
const READ_ONLY_PERMISSIONS: readonly CandidatePermission[] = [CandidatePermission.Read];

/** CONTRIBUTOR — décision produit CCV2-A §3 : "lecture + édition capacités + upload documents",
 *  explicitement "aucun delete document, aucun banking". Ne reçoit pas non plus `ManageIdentity`
 *  (voir la note sur cette permission ci-dessus). */
const CONTRIBUTOR_PERMISSIONS: readonly CandidatePermission[] = [
  CandidatePermission.Read,
  CandidatePermission.CapabilityEdit,
  CandidatePermission.DocumentUpload,
];

/** BID_MANAGER — décision produit CCV2-A §3 : "lecture + édition capacités + documents + banking",
 *  soit l'ensemble des permissions. Le rôle porte la responsabilité de la réponse AO : il gère
 *  l'entreprise qui candidate, y compris son RIB (nécessaire au DC4). */
const BID_MANAGER_PERMISSIONS: readonly CandidatePermission[] = ALL_PERMISSIONS;

export const ROLE_CANDIDATE_PERMISSIONS: Record<string, readonly CandidatePermission[]> = {
  OWNER: ALL_PERMISSIONS,
  ORGANIZATION_ADMIN: ALL_PERMISSIONS,
  BID_MANAGER: BID_MANAGER_PERMISSIONS,
  CONTRIBUTOR: CONTRIBUTOR_PERMISSIONS,
  REVIEWER: READ_ONLY_PERMISSIONS,
  EXECUTIVE: READ_ONLY_PERMISSIONS,
  EXTERNAL_CONSULTANT: READ_ONLY_PERMISSIONS,
  READ_ONLY: READ_ONLY_PERMISSIONS,
};

export function roleHasCandidatePermission(role: string, permission: CandidatePermission): boolean {
  return (ROLE_CANDIDATE_PERMISSIONS[role] ?? []).includes(permission);
}

export function assertHasCandidatePermission(role: string, permission: CandidatePermission): void {
  if (!roleHasCandidatePermission(role, permission)) {
    throw new CandidatePermissionMissingError();
  }
}
