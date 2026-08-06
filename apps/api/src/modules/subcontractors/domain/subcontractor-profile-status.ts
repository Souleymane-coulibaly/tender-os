/** Mission §6 : TO_VERIFY par défaut (jamais créé automatiquement par l'IA, un profil ajouté
 *  manuellement doit être vérifié avant d'être considéré fiable), ACTIVE/INACTIVE pour l'usage
 *  courant, ARCHIVED pour un retrait définitif (jamais une suppression physique). */
export const SubcontractorProfileStatus = {
  ToVerify: "TO_VERIFY",
  Active: "ACTIVE",
  Inactive: "INACTIVE",
  Archived: "ARCHIVED",
} as const;
export type SubcontractorProfileStatus = (typeof SubcontractorProfileStatus)[keyof typeof SubcontractorProfileStatus];

const ALLOWED_TRANSITIONS: Record<SubcontractorProfileStatus, readonly SubcontractorProfileStatus[]> = {
  [SubcontractorProfileStatus.ToVerify]: [SubcontractorProfileStatus.Active, SubcontractorProfileStatus.Inactive, SubcontractorProfileStatus.Archived],
  [SubcontractorProfileStatus.Active]: [SubcontractorProfileStatus.Inactive, SubcontractorProfileStatus.Archived, SubcontractorProfileStatus.ToVerify],
  [SubcontractorProfileStatus.Inactive]: [SubcontractorProfileStatus.Active, SubcontractorProfileStatus.Archived, SubcontractorProfileStatus.ToVerify],
  [SubcontractorProfileStatus.Archived]: [SubcontractorProfileStatus.ToVerify, SubcontractorProfileStatus.Active, SubcontractorProfileStatus.Inactive],
};

export function canTransitionSubcontractorProfileStatus(from: SubcontractorProfileStatus, to: SubcontractorProfileStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
