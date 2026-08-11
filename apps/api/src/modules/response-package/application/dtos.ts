import type { PackageArtifact } from "../domain/package-artifact.value-object";
import type { PackageItem } from "../domain/package-item.entity";
import type { ResponsePackageVersion } from "../domain/response-package-version.entity";
import type { ResponsePackage } from "../domain/response-package.aggregate";

/** Les agrégats/entités du domaine exposent leur état via des GETTERS de prototype — `JSON.stringify`
 *  ne sérialise jamais les accesseurs hérités. Chaque type retourné par une route HTTP passe donc
 *  par un mapper explicite (même motif que `pricing-schedule/application/dtos.ts`, Sprint 13). */

export type ResponsePackageSummary = Readonly<{
  id: string;
  organizationId: string;
  tenderId: string;
  lotId?: string | undefined;
  clientAccountId: string;
  status: string;
  currentVersionId?: string | undefined;
  currentVersionNumber: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}>;

export function toResponsePackageSummary(pkg: ResponsePackage): ResponsePackageSummary {
  return {
    id: pkg.id,
    organizationId: pkg.organizationId,
    tenderId: pkg.tenderId,
    lotId: pkg.lotId,
    clientAccountId: pkg.clientAccountId,
    status: pkg.status,
    currentVersionId: pkg.currentVersionId,
    currentVersionNumber: pkg.currentVersionNumber,
    createdBy: pkg.createdBy,
    createdAt: pkg.createdAt.toISOString(),
    updatedAt: pkg.updatedAt.toISOString(),
  };
}

export type ResponsePackageVersionSummary = Readonly<{
  id: string;
  organizationId: string;
  responsePackageId: string;
  versionNumber: number;
  status: string;
  createdBy: string;
  createdAt: string;
  validatedBy?: string | undefined;
  validatedAt?: string | undefined;
}>;

export function toResponsePackageVersionSummary(version: ResponsePackageVersion): ResponsePackageVersionSummary {
  return {
    id: version.id,
    organizationId: version.organizationId,
    responsePackageId: version.responsePackageId,
    versionNumber: version.versionNumber,
    status: version.status,
    createdBy: version.createdBy,
    createdAt: version.createdAt.toISOString(),
    validatedBy: version.validatedBy,
    validatedAt: version.validatedAt?.toISOString(),
  };
}

export type PackageItemSummary = Readonly<{
  id: string;
  organizationId: string;
  responsePackageVersionId: string;
  category: string;
  label: string;
  documentType?: string | undefined;
  sourceType: string;
  sourceId?: string | undefined;
  documentId?: string | undefined;
  documentVersionId?: string | undefined;
  requirementType: string;
  applicabilityStatus: string;
  conditionText?: string | undefined;
  status: string;
  lotId?: string | undefined;
  expiresAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
}>;

export function toPackageItemSummary(item: PackageItem): PackageItemSummary {
  return {
    id: item.id,
    organizationId: item.organizationId,
    responsePackageVersionId: item.responsePackageVersionId,
    category: item.category,
    label: item.label,
    documentType: item.documentType,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    documentId: item.documentId,
    documentVersionId: item.documentVersionId,
    requirementType: item.requirementType,
    applicabilityStatus: item.applicabilityStatus,
    conditionText: item.conditionText,
    status: item.status,
    lotId: item.lotId,
    expiresAt: item.expiresAt?.toISOString(),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export type PackageArtifactSummary = Readonly<{
  id: string;
  organizationId: string;
  responsePackageVersionId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  generatedBy: string;
  generatedAt: string;
}>;

export function toPackageArtifactSummary(artifact: PackageArtifact): PackageArtifactSummary {
  return {
    id: artifact.id,
    organizationId: artifact.organizationId,
    responsePackageVersionId: artifact.responsePackageVersionId,
    fileName: artifact.fileName,
    mimeType: artifact.mimeType,
    sizeBytes: artifact.sizeBytes,
    checksum: artifact.checksum,
    generatedBy: artifact.generatedBy,
    generatedAt: artifact.generatedAt.toISOString(),
  };
}
