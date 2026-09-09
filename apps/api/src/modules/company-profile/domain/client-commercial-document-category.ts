import { ClientCommercialDocumentCategoryError } from "./errors";

/**
 * Checkpoint TENDEROS-2.1-CCV2-I.1 — catalogue CRM des documents rattachés à un `ClientAccount`.
 *
 * Les deux agrégats peuvent légitimement porter des documents, mais leur SENS diffère (mission §6) :
 *  - `ClientAccount` : documents COMMERCIAUX de la relation client (contrat, brief, compte rendu) ;
 *  - `CandidateCompany` : pièces de CANDIDATURE (Kbis, attestations, assurances, RIB…), déjà
 *    couvertes par `DocumentCandidateCompanyAssociation` depuis CCV2-D.
 *
 * Le catalogue Legacy de cette table était pourtant `KBIS | TAX_CERTIFICATE | SOCIAL_CERTIFICATE |
 * ARTICLES_OF_ASSOCIATION | OTHER` — c'est-à-dire un catalogue de CANDIDATURE. C'est exactement
 * l'ambiguïté que la mission demande de supprimer : un « document entreprise » générique ouvrant
 * silencieusement une seconde source de vérité inscriptible.
 *
 * Les anciennes valeurs restent ACCEPTÉES EN BASE (aucune ligne historique n'est invalidée, mission
 * §8) mais ne sont plus proposables à l'écriture : une pièce de candidature se rattache désormais à
 * l'entreprise candidate.
 */
export const CLIENT_COMMERCIAL_DOCUMENT_CATEGORIES = [
  "COMMERCIAL_CONTRACT",
  "CLIENT_BRIEF",
  "MEETING_NOTE",
  "CLIENT_PROVIDED_DOCUMENT",
  "INTERNAL_COMMERCIAL_DOCUMENT",
  "OTHER_COMMERCIAL",
] as const;
export type ClientCommercialDocumentCategory = (typeof CLIENT_COMMERCIAL_DOCUMENT_CATEGORIES)[number];

/**
 * Catégories HISTORIQUES, conservées en lecture. Elles appartiennent au domaine de la candidature
 * et ne peuvent plus être choisies pour une NOUVELLE association côté client.
 */
export const LEGACY_BIDDER_DOCUMENT_CATEGORIES: readonly string[] = [
  "KBIS",
  "TAX_CERTIFICATE",
  "SOCIAL_CERTIFICATE",
  "ARTICLES_OF_ASSOCIATION",
  "OTHER",
];

export function isClientCommercialDocumentCategory(value: string): value is ClientCommercialDocumentCategory {
  return (CLIENT_COMMERCIAL_DOCUMENT_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Refuse une catégorie de CANDIDATURE sur la surface commerciale. Le message distingue les deux cas
 * — catégorie de candidature vs valeur inconnue — parce qu'ils appellent des corrections opposées :
 * l'une se rattache ailleurs, l'autre est une faute de saisie.
 */
export function assertClientCommercialDocumentCategory(value: string): void {
  if (isClientCommercialDocumentCategory(value)) {
    return;
  }
  throw new ClientCommercialDocumentCategoryError(
    LEGACY_BIDDER_DOCUMENT_CATEGORIES.includes(value)
      ? `"${value}" is a bidder document category: attach it to the CandidateCompany, not to the ClientAccount.`
      : `"${value}" is not a commercial document category.`,
  );
}
