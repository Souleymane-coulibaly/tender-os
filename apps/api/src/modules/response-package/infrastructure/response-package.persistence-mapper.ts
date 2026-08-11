import type { ResponsePackageStatus } from "../domain/enums";
import { ResponsePackage } from "../domain/response-package.aggregate";

type ResponsePackageRow = {
  id: string;
  organizationId: string;
  tenderId: string;
  lotId: string | null;
  clientAccountId: string;
  status: string;
  currentVersionId: string | null;
  currentVersionNumber: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toDomainResponsePackage(record: ResponsePackageRow): ResponsePackage {
  return ResponsePackage.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    lotId: record.lotId ?? undefined,
    clientAccountId: record.clientAccountId,
    status: record.status as ResponsePackageStatus,
    currentVersionId: record.currentVersionId ?? undefined,
    currentVersionNumber: record.currentVersionNumber,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toResponsePackageRow(pkg: ResponsePackage) {
  return {
    id: pkg.id,
    organizationId: pkg.organizationId,
    tenderId: pkg.tenderId,
    lotId: pkg.lotId ?? null,
    clientAccountId: pkg.clientAccountId,
    status: pkg.status,
    currentVersionId: pkg.currentVersionId ?? null,
    currentVersionNumber: pkg.currentVersionNumber,
    createdBy: pkg.createdBy,
    createdAt: pkg.createdAt,
    updatedAt: pkg.updatedAt,
  };
}
