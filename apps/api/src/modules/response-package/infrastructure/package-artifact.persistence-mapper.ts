import type { Prisma } from "@prisma/client";
import { PackageArtifact } from "../domain/package-artifact.value-object";

type PackageArtifactRow = {
  id: string;
  organizationId: string;
  responsePackageVersionId: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  manifest: Prisma.JsonValue;
  generatedBy: string;
  generatedAt: Date;
};

export function toDomainPackageArtifact(record: PackageArtifactRow): PackageArtifact {
  return PackageArtifact.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    responsePackageVersionId: record.responsePackageVersionId,
    storageKey: record.storageKey,
    fileName: record.fileName,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    checksum: record.checksum,
    manifest: record.manifest as Record<string, unknown>,
    generatedBy: record.generatedBy,
    generatedAt: record.generatedAt,
  });
}

export function toPackageArtifactRow(artifact: PackageArtifact) {
  return {
    id: artifact.id,
    organizationId: artifact.organizationId,
    responsePackageVersionId: artifact.responsePackageVersionId,
    storageKey: artifact.storageKey,
    fileName: artifact.fileName,
    mimeType: artifact.mimeType,
    sizeBytes: artifact.sizeBytes,
    checksum: artifact.checksum,
    manifest: artifact.manifest as Prisma.InputJsonValue,
    generatedBy: artifact.generatedBy,
    generatedAt: artifact.generatedAt,
  };
}
