import type { ResponsePackageVersionStatus } from "../domain/enums";
import { ResponsePackageVersion } from "../domain/response-package-version.entity";

type ResponsePackageVersionRow = {
  id: string;
  organizationId: string;
  responsePackageId: string;
  versionNumber: number;
  status: string;
  createdBy: string;
  createdAt: Date;
  validatedBy: string | null;
  validatedAt: Date | null;
  candidateCompanyId: string | null;
};

export function toDomainResponsePackageVersion(record: ResponsePackageVersionRow): ResponsePackageVersion {
  return ResponsePackageVersion.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    responsePackageId: record.responsePackageId,
    versionNumber: record.versionNumber,
    status: record.status as ResponsePackageVersionStatus,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    validatedBy: record.validatedBy ?? undefined,
    validatedAt: record.validatedAt ?? undefined,
    candidateCompanyId: record.candidateCompanyId ?? undefined,
  });
}

export function toResponsePackageVersionRow(version: ResponsePackageVersion) {
  return {
    id: version.id,
    organizationId: version.organizationId,
    responsePackageId: version.responsePackageId,
    versionNumber: version.versionNumber,
    status: version.status,
    createdBy: version.createdBy,
    createdAt: version.createdAt,
    validatedBy: version.validatedBy ?? null,
    validatedAt: version.validatedAt ?? null,
    candidateCompanyId: version.candidateCompanyId ?? null,
  };
}
