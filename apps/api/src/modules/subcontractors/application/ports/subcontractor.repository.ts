import type {
  SubcontractorCertificationRecord,
  SubcontractorInsuranceRecord,
  SubcontractorProfileDocumentRecord,
  SubcontractorProfileRecord,
  SubcontractorReferenceRecord,
} from "../dtos";

export type OrgScope = Readonly<{ organizationId: string }>;
export type EntityScope = Readonly<{ organizationId: string; id: string }>;

/** Équivalent de `Partial<T>` compatible `exactOptionalPropertyTypes` — même motif que
 *  `company-profile/application/ports/company-satellite.repository.ts`. */
export type Patch<T> = { [K in keyof T]?: T[K] | undefined };

export interface SubcontractorProfileRepository {
  create(input: Omit<SubcontractorProfileRecord, "createdAt" | "updatedAt">): Promise<SubcontractorProfileRecord>;
  update(scope: EntityScope, patch: Patch<Omit<SubcontractorProfileRecord, "id" | "organizationId">>): Promise<SubcontractorProfileRecord | null>;
  findById(scope: EntityScope): Promise<SubcontractorProfileRecord | null>;
  list(scope: OrgScope & { status?: string | undefined; search?: string | undefined }): Promise<SubcontractorProfileRecord[]>;
  findDuplicateSiretInOrganization(input: { organizationId: string; siret: string; excludeProfileId?: string | undefined }): Promise<SubcontractorProfileRecord | null>;
}
export const SUBCONTRACTOR_PROFILE_REPOSITORY = Symbol("SUBCONTRACTOR_PROFILE_REPOSITORY");

export interface SubcontractorReferenceRepository {
  create(input: Omit<SubcontractorReferenceRecord, "createdAt" | "updatedAt">): Promise<SubcontractorReferenceRecord>;
  list(input: { organizationId: string; subcontractorProfileId: string }): Promise<SubcontractorReferenceRecord[]>;
  /** Correctif audit Codex P1 — jamais un `delete` Prisma, seulement `status = ARCHIVED` (historique
   *  conservé, même discipline que tous les satellites `company-profile`). */
  archive(scope: EntityScope): Promise<boolean>;
}
export const SUBCONTRACTOR_REFERENCE_REPOSITORY = Symbol("SUBCONTRACTOR_REFERENCE_REPOSITORY");

export interface SubcontractorCertificationRepository {
  create(input: Omit<SubcontractorCertificationRecord, "createdAt" | "updatedAt">): Promise<SubcontractorCertificationRecord>;
  list(input: { organizationId: string; subcontractorProfileId: string }): Promise<SubcontractorCertificationRecord[]>;
  archive(scope: EntityScope): Promise<boolean>;
}
export const SUBCONTRACTOR_CERTIFICATION_REPOSITORY = Symbol("SUBCONTRACTOR_CERTIFICATION_REPOSITORY");

export interface SubcontractorInsuranceRepository {
  create(input: Omit<SubcontractorInsuranceRecord, "createdAt" | "updatedAt">): Promise<SubcontractorInsuranceRecord>;
  list(input: { organizationId: string; subcontractorProfileId: string }): Promise<SubcontractorInsuranceRecord[]>;
  archive(scope: EntityScope): Promise<boolean>;
}
export const SUBCONTRACTOR_INSURANCE_REPOSITORY = Symbol("SUBCONTRACTOR_INSURANCE_REPOSITORY");

export interface SubcontractorProfileDocumentRepository {
  create(input: Omit<SubcontractorProfileDocumentRecord, "createdAt">): Promise<SubcontractorProfileDocumentRecord>;
  list(input: { organizationId: string; subcontractorProfileId: string }): Promise<SubcontractorProfileDocumentRecord[]>;
}
export const SUBCONTRACTOR_PROFILE_DOCUMENT_REPOSITORY = Symbol("SUBCONTRACTOR_PROFILE_DOCUMENT_REPOSITORY");
