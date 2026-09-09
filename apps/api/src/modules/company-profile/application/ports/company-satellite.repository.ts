import type {
  DocumentCandidateCompanyAssociationRecord,
  CompanyBankAccountRecord,
  CompanyCertificationRecord,
  CompanyHumanResourceRecord,
  CompanyInsuranceRecord,
  CompanyLegalIdentityRecord,
  CompanyMaterialResourceRecord,
  CompanyReferenceDocumentRecord,
  CompanyReferenceRecord,
  CompanyRepresentativeRecord,
  DocumentClientAccountAssociationRecord,
} from "../dtos";

export type ClientScope = Readonly<{ organizationId: string; clientAccountId: string }>;
/** Correctif audit Codex P0 — DOIT contraindre `clientAccountId` en plus de `organizationId`/`id` :
 *  sans lui, un acteur autorisé sur le Client A (vérifié par `CompanyProfileAccessService` sur la
 *  route) pouvait muter une ressource du Client B de la MÊME organisation en fournissant son id
 *  dans l'URL — `assertClientAccess` ne valide que le `clientAccountId` de la route, jamais celui
 *  de la ressource ciblée. Chaque repository DOIT filtrer sa requête SQL par les trois champs. */
export type EntityScope = Readonly<{ organizationId: string; clientAccountId: string; id: string }>;

/** Checkpoint TENDEROS-2.1-CCV2-C — scope de la SOT V2. Symétrique exact de `ClientScope` : toute
 *  lecture/écriture candidate est bornée par `(organizationId, candidateCompanyId)`, jamais par le
 *  seul id de la ressource — même correctif que le P0 rappelé ci-dessus, transposé au palier
 *  candidate (sans quoi un acteur autorisé sur le Candidat A pourrait muter une capacité du
 *  Candidat B de la MÊME organisation en fournissant son id dans l'URL). */
export type CandidateScope = Readonly<{ organizationId: string; candidateCompanyId: string }>;
export type CandidateEntityScope = Readonly<{ organizationId: string; candidateCompanyId: string; id: string }>;


/** Équivalent de `Partial<T>` mais compatible `exactOptionalPropertyTypes` : chaque champ accepte
 *  explicitement `undefined` ("non fourni, ne pas toucher"), distinct de `null` ("effacer la
 *  valeur") — même sémantique que Prisma `updateMany` (une clé `undefined` est omise du `SET`). */
export type Patch<T> = { [K in keyof T]?: T[K] | undefined };

export interface CompanyLegalIdentityRepository {
  findByClientAccount(scope: ClientScope): Promise<CompanyLegalIdentityRecord | null>;
  /**
   * Checkpoint TENDEROS-2.1-CCV2-I.4 — `upsert` et `findDuplicateSiretInOrganization` ont ete
   * retires : l'identite juridique du candidat appartient a `CandidateCompany`, sa route d'ecriture
   * cote client n'existe plus, et l'arbitrage de doublon de SIRET est desormais assure EN BASE par
   * l'index unique de `candidate_establishments`. Ce depot est donc en LECTURE SEULE — ce qui est
   * exactement le role qui lui reste : servir les identites historiques.
   */
}
export const COMPANY_LEGAL_IDENTITY_REPOSITORY = Symbol("COMPANY_LEGAL_IDENTITY_REPOSITORY");

export interface CompanyRepresentativeRepository {
  create(input: Omit<CompanyRepresentativeRecord, "createdAt" | "updatedAt">): Promise<CompanyRepresentativeRecord>;
  update(scope: EntityScope, patch: Patch<Omit<CompanyRepresentativeRecord, "id" | "organizationId" | "clientAccountId">>): Promise<CompanyRepresentativeRecord | null>;
  findById(scope: EntityScope): Promise<CompanyRepresentativeRecord | null>;
  list(scope: ClientScope): Promise<CompanyRepresentativeRecord[]>;
  /** CCV2-C — SOT V2. Jamais un second chemin de lecture : MÊME table, MÊME ligne, borné par
   *  `candidateCompanyId` au lieu de `clientAccountId`. */
  listByCandidate(scope: CandidateScope): Promise<CompanyRepresentativeRecord[]>;
  findByIdForCandidate(scope: CandidateEntityScope): Promise<CompanyRepresentativeRecord | null>;
  updateForCandidate(scope: CandidateEntityScope, patch: Patch<Omit<CompanyRepresentativeRecord, "id" | "organizationId" | "clientAccountId" | "candidateCompanyId">>): Promise<CompanyRepresentativeRecord | null>;
}
export const COMPANY_REPRESENTATIVE_REPOSITORY = Symbol("COMPANY_REPRESENTATIVE_REPOSITORY");

export interface CompanyBankAccountRepository {
  create(input: Omit<CompanyBankAccountRecord, "createdAt" | "updatedAt">): Promise<CompanyBankAccountRecord>;
  update(scope: EntityScope, patch: Patch<Omit<CompanyBankAccountRecord, "id" | "organizationId" | "clientAccountId">>): Promise<CompanyBankAccountRecord | null>;
  findById(scope: EntityScope): Promise<CompanyBankAccountRecord | null>;
  list(scope: ClientScope): Promise<CompanyBankAccountRecord[]>;
  /** CCV2-C.1 — SOT V2 du banking. MÊME table, MÊME ligne, bornée par `candidateCompanyId`. */
  listByCandidate(scope: CandidateScope): Promise<CompanyBankAccountRecord[]>;
  findByIdForCandidate(scope: CandidateEntityScope): Promise<CompanyBankAccountRecord | null>;
  updateForCandidate(scope: CandidateEntityScope, patch: Patch<Omit<CompanyBankAccountRecord, "id" | "organizationId" | "clientAccountId" | "candidateCompanyId">>): Promise<CompanyBankAccountRecord | null>;
  /** Création candidate ATOMIQUE : lorsque le compte naît principal, la rétrogradation des autres
   *  et l'insertion se produisent dans UNE SEULE transaction — sans quoi deux créations
   *  concurrentes laisseraient deux comptes principaux (l'index unique partiel les rejetterait
   *  alors par une erreur brute, jamais par un état correct). */
  createForCandidate(input: Omit<CompanyBankAccountRecord, "createdAt" | "updatedAt">): Promise<CompanyBankAccountRecord>;
}
export const COMPANY_BANK_ACCOUNT_REPOSITORY = Symbol("COMPANY_BANK_ACCOUNT_REPOSITORY");

export interface CompanyInsuranceRepository {
  create(input: Omit<CompanyInsuranceRecord, "createdAt" | "updatedAt">): Promise<CompanyInsuranceRecord>;
  update(scope: EntityScope, patch: Patch<Omit<CompanyInsuranceRecord, "id" | "organizationId" | "clientAccountId">>): Promise<CompanyInsuranceRecord | null>;
  findById(scope: EntityScope): Promise<CompanyInsuranceRecord | null>;
  list(scope: ClientScope): Promise<CompanyInsuranceRecord[]>;
  /** CCV2-C — SOT V2. Jamais un second chemin de lecture : MÊME table, MÊME ligne, borné par
   *  `candidateCompanyId` au lieu de `clientAccountId`. */
  listByCandidate(scope: CandidateScope): Promise<CompanyInsuranceRecord[]>;
  findByIdForCandidate(scope: CandidateEntityScope): Promise<CompanyInsuranceRecord | null>;
  updateForCandidate(scope: CandidateEntityScope, patch: Patch<Omit<CompanyInsuranceRecord, "id" | "organizationId" | "clientAccountId" | "candidateCompanyId">>): Promise<CompanyInsuranceRecord | null>;
}
export const COMPANY_INSURANCE_REPOSITORY = Symbol("COMPANY_INSURANCE_REPOSITORY");

export interface CompanyCertificationRepository {
  create(input: Omit<CompanyCertificationRecord, "createdAt" | "updatedAt">): Promise<CompanyCertificationRecord>;
  update(scope: EntityScope, patch: Patch<Omit<CompanyCertificationRecord, "id" | "organizationId" | "clientAccountId">>): Promise<CompanyCertificationRecord | null>;
  findById(scope: EntityScope): Promise<CompanyCertificationRecord | null>;
  list(scope: ClientScope): Promise<CompanyCertificationRecord[]>;
  /** CCV2-C — SOT V2. Jamais un second chemin de lecture : MÊME table, MÊME ligne, borné par
   *  `candidateCompanyId` au lieu de `clientAccountId`. */
  listByCandidate(scope: CandidateScope): Promise<CompanyCertificationRecord[]>;
  findByIdForCandidate(scope: CandidateEntityScope): Promise<CompanyCertificationRecord | null>;
  updateForCandidate(scope: CandidateEntityScope, patch: Patch<Omit<CompanyCertificationRecord, "id" | "organizationId" | "clientAccountId" | "candidateCompanyId">>): Promise<CompanyCertificationRecord | null>;
}
export const COMPANY_CERTIFICATION_REPOSITORY = Symbol("COMPANY_CERTIFICATION_REPOSITORY");

export interface CompanyReferenceRepository {
  create(input: Omit<CompanyReferenceRecord, "createdAt" | "updatedAt">): Promise<CompanyReferenceRecord>;
  update(scope: EntityScope, patch: Patch<Omit<CompanyReferenceRecord, "id" | "organizationId" | "clientAccountId">>): Promise<CompanyReferenceRecord | null>;
  findById(scope: EntityScope): Promise<CompanyReferenceRecord | null>;
  list(scope: ClientScope): Promise<CompanyReferenceRecord[]>;
  /** CCV2-C — SOT V2. Jamais un second chemin de lecture : MÊME table, MÊME ligne, borné par
   *  `candidateCompanyId` au lieu de `clientAccountId`. */
  listByCandidate(scope: CandidateScope): Promise<CompanyReferenceRecord[]>;
  findByIdForCandidate(scope: CandidateEntityScope): Promise<CompanyReferenceRecord | null>;
  updateForCandidate(scope: CandidateEntityScope, patch: Patch<Omit<CompanyReferenceRecord, "id" | "organizationId" | "clientAccountId" | "candidateCompanyId">>): Promise<CompanyReferenceRecord | null>;
}
export const COMPANY_REFERENCE_REPOSITORY = Symbol("COMPANY_REFERENCE_REPOSITORY");

export interface CompanyReferenceDocumentRepository {
  create(input: Omit<CompanyReferenceDocumentRecord, "createdAt">): Promise<CompanyReferenceDocumentRecord>;
  list(input: { organizationId: string; companyReferenceId: string }): Promise<CompanyReferenceDocumentRecord[]>;
}
export const COMPANY_REFERENCE_DOCUMENT_REPOSITORY = Symbol("COMPANY_REFERENCE_DOCUMENT_REPOSITORY");

export interface CompanyHumanResourceRepository {
  create(input: Omit<CompanyHumanResourceRecord, "createdAt" | "updatedAt">): Promise<CompanyHumanResourceRecord>;
  update(scope: EntityScope, patch: Patch<Omit<CompanyHumanResourceRecord, "id" | "organizationId" | "clientAccountId">>): Promise<CompanyHumanResourceRecord | null>;
  findById(scope: EntityScope): Promise<CompanyHumanResourceRecord | null>;
  list(scope: ClientScope): Promise<CompanyHumanResourceRecord[]>;
  /** CCV2-C — SOT V2. Jamais un second chemin de lecture : MÊME table, MÊME ligne, borné par
   *  `candidateCompanyId` au lieu de `clientAccountId`. */
  listByCandidate(scope: CandidateScope): Promise<CompanyHumanResourceRecord[]>;
  findByIdForCandidate(scope: CandidateEntityScope): Promise<CompanyHumanResourceRecord | null>;
  updateForCandidate(scope: CandidateEntityScope, patch: Patch<Omit<CompanyHumanResourceRecord, "id" | "organizationId" | "clientAccountId" | "candidateCompanyId">>): Promise<CompanyHumanResourceRecord | null>;
}
export const COMPANY_HUMAN_RESOURCE_REPOSITORY = Symbol("COMPANY_HUMAN_RESOURCE_REPOSITORY");

export interface CompanyMaterialResourceRepository {
  create(input: Omit<CompanyMaterialResourceRecord, "createdAt" | "updatedAt">): Promise<CompanyMaterialResourceRecord>;
  update(scope: EntityScope, patch: Patch<Omit<CompanyMaterialResourceRecord, "id" | "organizationId" | "clientAccountId">>): Promise<CompanyMaterialResourceRecord | null>;
  findById(scope: EntityScope): Promise<CompanyMaterialResourceRecord | null>;
  list(scope: ClientScope): Promise<CompanyMaterialResourceRecord[]>;
  /** CCV2-C — SOT V2. Jamais un second chemin de lecture : MÊME table, MÊME ligne, borné par
   *  `candidateCompanyId` au lieu de `clientAccountId`. */
  listByCandidate(scope: CandidateScope): Promise<CompanyMaterialResourceRecord[]>;
  findByIdForCandidate(scope: CandidateEntityScope): Promise<CompanyMaterialResourceRecord | null>;
  updateForCandidate(scope: CandidateEntityScope, patch: Patch<Omit<CompanyMaterialResourceRecord, "id" | "organizationId" | "clientAccountId" | "candidateCompanyId">>): Promise<CompanyMaterialResourceRecord | null>;
}
export const COMPANY_MATERIAL_RESOURCE_REPOSITORY = Symbol("COMPANY_MATERIAL_RESOURCE_REPOSITORY");

export interface DocumentClientAccountAssociationRepository {
  create(input: Omit<DocumentClientAccountAssociationRecord, "createdAt">): Promise<DocumentClientAccountAssociationRecord>;
  list(scope: ClientScope): Promise<DocumentClientAccountAssociationRecord[]>;
  findById(scope: EntityScope): Promise<DocumentClientAccountAssociationRecord | null>;
}
export const DOCUMENT_CLIENT_ACCOUNT_ASSOCIATION_REPOSITORY = Symbol("DOCUMENT_CLIENT_ACCOUNT_ASSOCIATION_REPOSITORY");

/**
 * Checkpoint TENDEROS-2.1-CCV2-D — association documentaire candidate. Miroir strict de
 * `DocumentClientAccountAssociationRepository`, borné par `candidateCompanyId`.
 */
export interface DocumentCandidateCompanyAssociationRepository {
  create(input: Omit<DocumentCandidateCompanyAssociationRecord, "createdAt">): Promise<DocumentCandidateCompanyAssociationRecord>;
  list(scope: CandidateScope): Promise<DocumentCandidateCompanyAssociationRecord[]>;
  findByDocument(scope: CandidateScope & { documentId: string }): Promise<DocumentCandidateCompanyAssociationRecord | null>;
  update(
    scope: CandidateScope & { documentId: string },
    patch: Patch<Pick<DocumentCandidateCompanyAssociationRecord, "category" | "label" | "issuedAt" | "validFrom" | "validUntil">>,
  ): Promise<DocumentCandidateCompanyAssociationRecord | null>;
  /** Dissociation, JAMAIS suppression du Document : le fichier peut rester rattaché ailleurs
   *  (Tender, autre candidat) et un dossier AO déjà déposé doit continuer d'y référer. */
  detach(scope: CandidateScope & { documentId: string }): Promise<boolean>;
  /** Utilisé par le rétrécissement d'accès documentaire : à quel candidat et sous quelle catégorie
   *  ce Document est-il rattaché dans CETTE organisation ? */
  findAssociationsByDocument(input: { organizationId: string; documentId: string }): Promise<DocumentCandidateCompanyAssociationRecord[]>;
  /** Checkpoint CCV2-I.3 — identifiants des documents portant une catégorie BANCAIRE, parmi ceux
   *  fournis. Une seule requête, pour permettre le filtrage d'une page de liste. */
  findBankingDocumentIds(input: { organizationId: string; documentIds: readonly string[] }): Promise<readonly string[]>;
}
export const DOCUMENT_CANDIDATE_COMPANY_ASSOCIATION_REPOSITORY = Symbol("DOCUMENT_CANDIDATE_COMPANY_ASSOCIATION_REPOSITORY");
