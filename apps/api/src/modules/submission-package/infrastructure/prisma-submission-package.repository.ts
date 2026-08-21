import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { PackageFile } from "../domain/package-file";
import type { SubmissionPackage } from "../domain/submission-package.aggregate";
import type { SubmissionPackageRepository, SubmissionPackageResponsePackageProvenanceInput, SubmissionPackageWithFiles } from "../application/ports/submission-package.repository";
import { toDomainSubmissionPackage } from "./submission-package.persistence-mapper";

const INCLUDE = { files: { orderBy: { order: "asc" as const } }, responsePackageProvenance: true };

@Injectable()
export class PrismaSubmissionPackageRepository implements SubmissionPackageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: { pkg: SubmissionPackage; files: readonly PackageFile[]; responsePackageProvenance?: readonly SubmissionPackageResponsePackageProvenanceInput[] }): Promise<void> {
    // Opérations top-level dans une transaction courte plutôt que le raccourci Prisma
    // `files: { create: [...] }` (même contournement que `PrismaExportJobRepository.create` —
    // la FK composite `(submissionPackageId, organizationId)` sur `PackageFile` n'est pas
    // correctement inférée par le raccourci imbriqué).
    await this.prisma.$transaction([
      this.prisma.submissionPackage.create({ data: toPackageRow(input.pkg) }),
      ...(input.files.length > 0
        ? [
            this.prisma.packageFile.createMany({
              data: input.files.map((f) => ({
                organizationId: input.pkg.organizationId,
                submissionPackageId: input.pkg.id,
                archivePath: f.archivePath,
                sourceType: f.sourceType,
                sourceId: f.sourceId ?? null,
                fileName: f.fileName,
                mimeType: f.mimeType,
                fileSize: f.fileSize,
                fileHash: f.fileHash,
                order: f.order,
              })),
            }),
          ]
        : []),
      // Checkpoint TENDEROS-2.1-P2.2-F4.1-CODEX-AUDIT — provenance multi-lot (mode LOT uniquement),
      // mirroir exact de `PrismaTenderSubmissionRepository.create`'s `submissionResponsePackage`.
      ...(input.responsePackageProvenance && input.responsePackageProvenance.length > 0
        ? [
            this.prisma.submissionPackageResponsePackage.createMany({
              data: input.responsePackageProvenance.map((p) => ({
                organizationId: input.pkg.organizationId,
                submissionPackageId: input.pkg.id,
                lotId: p.lotId,
                responsePackageVersionId: p.responsePackageVersionId,
                responsePackageArtifactId: p.responsePackageArtifactId,
                artifactChecksum: p.artifactChecksum,
              })),
            }),
          ]
        : []),
    ]);
  }

  async findById(input: { organizationId: string; packageId: string }): Promise<SubmissionPackageWithFiles | null> {
    const record = await this.prisma.submissionPackage.findFirst({ where: { id: input.packageId, organizationId: input.organizationId }, include: INCLUDE });
    return record ? toDomainSubmissionPackage(record) : null;
  }

  async listForTender(input: { organizationId: string; tenderId: string }): Promise<readonly SubmissionPackageWithFiles[]> {
    const records = await this.prisma.submissionPackage.findMany({ where: { organizationId: input.organizationId, tenderId: input.tenderId }, include: INCLUDE, orderBy: { version: "desc" } });
    return records.map(toDomainSubmissionPackage);
  }

  async findLatestCompletedForTender(input: { organizationId: string; tenderId: string }): Promise<SubmissionPackageWithFiles | null> {
    const record = await this.prisma.submissionPackage.findFirst({
      where: { organizationId: input.organizationId, tenderId: input.tenderId, status: "COMPLETED" },
      include: INCLUDE,
      orderBy: { version: "desc" },
    });
    return record ? toDomainSubmissionPackage(record) : null;
  }

  async nextVersion(input: { organizationId: string; tenderId: string }): Promise<number> {
    const latest = await this.prisma.submissionPackage.findFirst({ where: { organizationId: input.organizationId, tenderId: input.tenderId }, orderBy: { version: "desc" } });
    return (latest?.version ?? 0) + 1;
  }

  async markGenerating(input: { organizationId: string; packageId: string }): Promise<void> {
    await this.prisma.submissionPackage.update({ where: { id: input.packageId }, data: { status: "GENERATING" } });
  }

  async completeWithArchive(input: {
    organizationId: string;
    packageId: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    fileHash: string;
    storageKey: string;
    manifestJson: unknown;
    occurredAt: Date;
  }): Promise<void> {
    await this.prisma.submissionPackage.update({
      where: { id: input.packageId },
      data: {
        status: "COMPLETED",
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        fileHash: input.fileHash,
        storageKey: input.storageKey,
        manifestJson: input.manifestJson as object,
        completedAt: input.occurredAt,
      },
    });
  }

  async markFailed(input: { organizationId: string; packageId: string; errorCode: string; errorMessage: string; occurredAt: Date }): Promise<void> {
    await this.prisma.submissionPackage.update({
      where: { id: input.packageId },
      data: { status: "FAILED", errorCode: input.errorCode, errorMessage: input.errorMessage, completedAt: input.occurredAt },
    });
  }
}

function toPackageRow(pkg: SubmissionPackage) {
  return {
    id: pkg.id,
    organizationId: pkg.organizationId,
    clientAccountId: pkg.clientAccountId,
    tenderId: pkg.tenderId,
    version: pkg.version,
    status: pkg.status,
    validationRunId: pkg.validationRunId,
    approvalId: pkg.approvalId,
    readinessStatus: pkg.readinessStatus,
    fileName: pkg.fileName ?? null,
    mimeType: pkg.mimeType ?? null,
    fileSize: pkg.fileSize ?? null,
    fileHash: pkg.fileHash ?? null,
    storageKey: pkg.storageKey ?? null,
    responsePackageVersionId: pkg.responsePackageVersionId ?? null,
    responsePackageArtifactId: pkg.responsePackageArtifactId ?? null,
    responsePackageArtifactChecksum: pkg.responsePackageArtifactChecksum ?? null,
    createdBy: pkg.createdBy,
    createdAt: pkg.createdAt,
    completedAt: pkg.completedAt ?? null,
    errorCode: pkg.errorCode ?? null,
    errorMessage: pkg.errorMessage ?? null,
  };
}
