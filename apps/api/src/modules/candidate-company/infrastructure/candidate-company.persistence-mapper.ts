import type { CandidateCompany as CandidateCompanyRecord } from "@prisma/client";
import { CandidateCompany } from "../domain/candidate-company.aggregate";
import type { CandidateCompanyStatus } from "../domain/candidate-company-status";

export function toDomain(record: CandidateCompanyRecord): CandidateCompany {
  return CandidateCompany.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    name: record.name,
    nameNormalized: record.nameNormalized,
    legalName: record.legalName ?? undefined,
    siren: record.siren ?? undefined,
    vatNumber: record.vatNumber ?? undefined,
    legalForm: record.legalForm ?? undefined,
    status: record.status as CandidateCompanyStatus,
    sourceClientAccountId: record.sourceClientAccountId ?? undefined,
    createdBy: record.createdBy,
    updatedBy: record.updatedBy ?? undefined,
    archivedAt: record.archivedAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toPersistence(company: CandidateCompany) {
  return {
    id: company.id,
    organizationId: company.organizationId,
    name: company.name,
    nameNormalized: company.nameNormalized,
    legalName: company.legalName ?? null,
    siren: company.siren ?? null,
    vatNumber: company.vatNumber ?? null,
    legalForm: company.legalForm ?? null,
    status: company.status,
    sourceClientAccountId: company.sourceClientAccountId ?? null,
    createdBy: company.createdBy,
    updatedBy: company.updatedBy ?? null,
    archivedAt: company.archivedAt ?? null,
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
  };
}
