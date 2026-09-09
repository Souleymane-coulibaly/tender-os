/**
 * Checkpoint TENDEROS-2.1-CCV2-D — taxonomie documentaire de l'entreprise candidate.
 *
 * PAS un nouvel enum concurrent : c'est exactement le catalogue déjà posé en base par CCV2-B
 * (CHECK `document_candidate_company_associations_category_check`), lui-même construit comme
 * l'UNION des deux catalogues préexistants du dépôt — `document_client_account_associations`
 * (KBIS | TAX_CERTIFICATE | SOCIAL_CERTIFICATE | ARTICLES_OF_ASSOCIATION | OTHER) et
 * `subcontractor_profile_documents` (… | INSURANCE | CERTIFICATION | BANK_DETAILS | REFERENCE |
 * OTHER). Rien n'a été inventé ; `POWER_OF_ATTORNEY` et `CV` complètent les besoins métier
 * explicitement cités par la mission CCV2 (pouvoirs/délégations, moyens humains).
 *
 * `Document.category` (champ libre du moteur documentaire) reste indépendant : il décrit le
 * FICHIER, tandis que cette catégorie décrit son RÔLE pour l'entreprise candidate. Les deux ne sont
 * jamais synchronisés — le même PDF peut être une pièce de marché pour un Tender et un justificatif
 * d'entreprise pour un candidat.
 */
export const CandidateDocumentCategory = {
  Kbis: "KBIS",
  TaxCertificate: "TAX_CERTIFICATE",
  SocialCertificate: "SOCIAL_CERTIFICATE",
  ArticlesOfAssociation: "ARTICLES_OF_ASSOCIATION",
  Insurance: "INSURANCE",
  Certification: "CERTIFICATION",
  BankDetails: "BANK_DETAILS",
  Reference: "REFERENCE",
  PowerOfAttorney: "POWER_OF_ATTORNEY",
  Cv: "CV",
  Other: "OTHER",
} as const;
export type CandidateDocumentCategory = (typeof CandidateDocumentCategory)[keyof typeof CandidateDocumentCategory];

export const CANDIDATE_DOCUMENT_CATEGORIES = Object.values(CandidateDocumentCategory);

/**
 * Catégories dont le contenu est une donnée BANCAIRE. Lire ou télécharger un tel document exige
 * `candidate:read_banking`, jamais le simple `candidate:read` — sans quoi la bibliothèque
 * documentaire générique deviendrait un contournement de la frontière posée en CCV2-C.1.
 *
 * Volontairement une liste EXPLICITE et non une heuristique sur le libellé : un titre de fichier
 * n'est pas une classification de sécurité.
 */
export const BANKING_DOCUMENT_CATEGORIES: readonly string[] = [CandidateDocumentCategory.BankDetails];

export function isBankingDocumentCategory(category: string): boolean {
  return BANKING_DOCUMENT_CATEGORIES.includes(category);
}
