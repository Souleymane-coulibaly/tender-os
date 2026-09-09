import { ClientBidderWriteRetiredError } from "./errors";

/**
 * Checkpoint TENDEROS-2.1-CCV2-I.1 — FRONTIÈRE SÉMANTIQUE ClientAccount / CandidateCompany.
 *
 * `ClientAccount` est la relation COMMERCIALE (CRM). `CandidateCompany` est l'entité JURIDIQUE qui
 * candidate. Une même société réelle peut correspondre aux deux, mais les deux agrégats n'ont pas
 * la même responsabilité — et surtout, une donnée de candidature ne doit avoir qu'UNE source de
 * vérité inscriptible.
 *
 * Ce module ferme la surface d'ÉCRITURE Legacy pour les domaines qui appartiennent désormais à
 * `CandidateCompany`. Il ne supprime rien :
 *  - la LECTURE reste ouverte (les lignes historiques restent lisibles et auditables) ;
 *  - les 29 routes `/clients/:id/*` restent en place (leur retrait éventuel appartient aux vagues
 *    I suivantes, mission §24) ;
 *  - aucune donnée n'est déplacée ni convertie automatiquement.
 *
 * Ce qui devient impossible, c'est de CRÉER une nouvelle donnée de candidature ailleurs que sur
 * `CandidateCompany` — sans quoi le décommissionnement prouvé en CCV2-G.2 se reconstituerait par
 * l'autre bout.
 */
export const ClientBidderDomain = {
  /** Identité juridique du candidat : raison sociale, SIREN, SIRET, forme juridique, adresse. */
  LegalIdentity: "LEGAL_IDENTITY",
  /** Représentant LÉGAL ou signataire habilité — distinct d'un contact commercial (voir plus bas). */
  LegalRepresentative: "LEGAL_REPRESENTATIVE",
  /** RIB du candidat : sécurisé par `candidate:read_banking`/`manage_banking` depuis CCV2-C.1. */
  BankAccount: "BANK_ACCOUNT",
  Insurance: "INSURANCE",
  Certification: "CERTIFICATION",
  /** Référence professionnelle mobilisable dans un mémoire technique. */
  ProfessionalReference: "PROFESSIONAL_REFERENCE",
  HumanResource: "HUMAN_RESOURCE",
  MaterialResource: "MATERIAL_RESOURCE",
} as const;
export type ClientBidderDomain = (typeof ClientBidderDomain)[keyof typeof ClientBidderDomain];

/**
 * Types de représentant qui portent une AUTORITÉ JURIDIQUE. Ils appartiennent à l'entreprise
 * candidate : c'est elle qui signe un acte d'engagement, jamais le client commercial.
 *
 * Les autres types (`ADMINISTRATIVE_CONTACT`, `COMMERCIAL_CONTACT`, `TECHNICAL_CONTACT`) restent
 * légitimes côté `ClientAccount` : ce sont des CONTACTS au sens CRM (mission §5). C'est cette
 * distinction — et non le nom de la table — qui fait la frontière.
 */
const LEGAL_AUTHORITY_REPRESENTATIVE_TYPES: readonly string[] = ["LEGAL_REPRESENTATIVE", "SIGNATORY"];

export function isLegalAuthorityRepresentativeType(type: string): boolean {
  return LEGAL_AUTHORITY_REPRESENTATIVE_TYPES.includes(type);
}

/**
 * Refuse une écriture NOUVELLE dans un domaine de candidature via la surface `ClientAccount`.
 *
 * Levée AVANT toute écriture, jamais après : une transaction partiellement appliquée puis annulée
 * laisserait des identifiants consommés et des événements émis pour une opération interdite.
 *
 * TYPE DE RETOUR `void` ET NON `never`, choix délibéré : avec `never`, TypeScript marquerait le
 * corps des use cases retirés comme inaccessible et cesserait d'y appliquer ses affinements de
 * type, produisant des erreurs sur du code pourtant correct. Or la mission §24 dit explicitement
 * que I.1 n'est PAS la suppression finale : l'implémentation historique reste donc en place,
 * lisible et compilée, jusqu'à ce que I.2 décide de son retrait. La fonction ne retourne jamais
 * normalement — le refus est bien réel à l'exécution.
 */
export function assertClientBidderWriteRetired(domain: ClientBidderDomain): void {
  throw new ClientBidderWriteRetiredError(domain);
}
