import type {
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

/** Équivalent de `Partial<T>` mais compatible `exactOptionalPropertyTypes` : chaque champ accepte
 *  explicitement `undefined` ("non fourni, ne pas toucher"), distinct de `null` ("effacer la
 *  valeur") — même sémantique que Prisma `updateMany` (une clé `undefined` est omise du `SET`). */
export type Patch<T> = { [K in keyof T]?: T[K] | undefined };

export interface CompanyLegalIdentityRepository {
  findByClientAccount(scope: ClientScope): Promise<CompanyLegalIdentityRecord | null>;
  /** Recherche un doublon de SIRET dans l'organisation, sur un AUTRE ClientAccount que celui
   *  fourni (mission §4.1 "empêcher les doublons... sauf justification explicite"). */
  findDuplicateSiretInOrganization(input: { organizationId: string; siret: string; excludeClientAccountId: string }): Promise<CompanyLegalIdentityRecord | null>;
  upsert(input: Omit<CompanyLegalIdentityRecord, "id" | "createdAt" | "updatedAt"> & { id?: string | undefined; updatedAt: Date }): Promise<CompanyLegalIdentityRecord>;
}
export const COMPANY_LEGAL_IDENTITY_REPOSITORY = Symbol("COMPANY_LEGAL_IDENTITY_REPOSITORY");

export interface CompanyRepresentativeRepository {
  create(input: Omit<CompanyRepresentativeRecord, "createdAt" | "updatedAt">): Promise<CompanyRepresentativeRecord>;
  update(scope: EntityScope, patch: Patch<Omit<CompanyRepresentativeRecord, "id" | "organizationId" | "clientAccountId">>): Promise<CompanyRepresentativeRecord | null>;
  findById(scope: EntityScope): Promise<CompanyRepresentativeRecord | null>;
  list(scope: ClientScope): Promise<CompanyRepresentativeRecord[]>;
}
export const COMPANY_REPRESENTATIVE_REPOSITORY = Symbol("COMPANY_REPRESENTATIVE_REPOSITORY");

export interface CompanyBankAccountRepository {
  create(input: Omit<CompanyBankAccountRecord, "createdAt" | "updatedAt">): Promise<CompanyBankAccountRecord>;
  update(scope: EntityScope, patch: Patch<Omit<CompanyBankAccountRecord, "id" | "organizationId" | "clientAccountId">>): Promise<CompanyBankAccountRecord | null>;
  findById(scope: EntityScope): Promise<CompanyBankAccountRecord | null>;
  list(scope: ClientScope): Promise<CompanyBankAccountRecord[]>;
}
export const COMPANY_BANK_ACCOUNT_REPOSITORY = Symbol("COMPANY_BANK_ACCOUNT_REPOSITORY");

export interface CompanyInsuranceRepository {
  create(input: Omit<CompanyInsuranceRecord, "createdAt" | "updatedAt">): Promise<CompanyInsuranceRecord>;
  update(scope: EntityScope, patch: Patch<Omit<CompanyInsuranceRecord, "id" | "organizationId" | "clientAccountId">>): Promise<CompanyInsuranceRecord | null>;
  findById(scope: EntityScope): Promise<CompanyInsuranceRecord | null>;
  list(scope: ClientScope): Promise<CompanyInsuranceRecord[]>;
}
export const COMPANY_INSURANCE_REPOSITORY = Symbol("COMPANY_INSURANCE_REPOSITORY");

export interface CompanyCertificationRepository {
  create(input: Omit<CompanyCertificationRecord, "createdAt" | "updatedAt">): Promise<CompanyCertificationRecord>;
  update(scope: EntityScope, patch: Patch<Omit<CompanyCertificationRecord, "id" | "organizationId" | "clientAccountId">>): Promise<CompanyCertificationRecord | null>;
  findById(scope: EntityScope): Promise<CompanyCertificationRecord | null>;
  list(scope: ClientScope): Promise<CompanyCertificationRecord[]>;
}
export const COMPANY_CERTIFICATION_REPOSITORY = Symbol("COMPANY_CERTIFICATION_REPOSITORY");

export interface CompanyReferenceRepository {
  create(input: Omit<CompanyReferenceRecord, "createdAt" | "updatedAt">): Promise<CompanyReferenceRecord>;
  update(scope: EntityScope, patch: Patch<Omit<CompanyReferenceRecord, "id" | "organizationId" | "clientAccountId">>): Promise<CompanyReferenceRecord | null>;
  findById(scope: EntityScope): Promise<CompanyReferenceRecord | null>;
  list(scope: ClientScope): Promise<CompanyReferenceRecord[]>;
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
}
export const COMPANY_HUMAN_RESOURCE_REPOSITORY = Symbol("COMPANY_HUMAN_RESOURCE_REPOSITORY");

export interface CompanyMaterialResourceRepository {
  create(input: Omit<CompanyMaterialResourceRecord, "createdAt" | "updatedAt">): Promise<CompanyMaterialResourceRecord>;
  update(scope: EntityScope, patch: Patch<Omit<CompanyMaterialResourceRecord, "id" | "organizationId" | "clientAccountId">>): Promise<CompanyMaterialResourceRecord | null>;
  findById(scope: EntityScope): Promise<CompanyMaterialResourceRecord | null>;
  list(scope: ClientScope): Promise<CompanyMaterialResourceRecord[]>;
}
export const COMPANY_MATERIAL_RESOURCE_REPOSITORY = Symbol("COMPANY_MATERIAL_RESOURCE_REPOSITORY");

export interface DocumentClientAccountAssociationRepository {
  create(input: Omit<DocumentClientAccountAssociationRecord, "createdAt">): Promise<DocumentClientAccountAssociationRecord>;
  list(scope: ClientScope): Promise<DocumentClientAccountAssociationRecord[]>;
  findById(scope: EntityScope): Promise<DocumentClientAccountAssociationRecord | null>;
}
export const DOCUMENT_CLIENT_ACCOUNT_ASSOCIATION_REPOSITORY = Symbol("DOCUMENT_CLIENT_ACCOUNT_ASSOCIATION_REPOSITORY");
