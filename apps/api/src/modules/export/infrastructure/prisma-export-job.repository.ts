import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { ExportArtifact } from "../domain/export-artifact";
import { ExportJob } from "../domain/export-job.aggregate";
import type { ExportJobRepository, ExportJobWithArtifact } from "../application/ports/export-job.repository";
import { toDomainArtifact, toDomainJob } from "./export-job.persistence-mapper";

const JOB_INCLUDE = { sections: { orderBy: { order: "asc" as const } }, artifact: true };

@Injectable()
export class PrismaExportJobRepository implements ExportJobRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Deux créations top-level dans la MÊME transaction courte, jamais une création imbriquée
   *  (`sections: { create: [...] }`) : la FK composée `(exportJobId, organizationId)` sur
   *  `ExportSectionSelection` n'est pas correctement inférée par le raccourci imbriqué de Prisma
   *  quand le parent référencé lui-même par une FK composée — vérifié empiriquement. */
  async create(job: ExportJob): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.exportJob.create({
        data: {
          id: job.id,
          organizationId: job.organizationId,
          clientAccountId: job.clientAccountId,
          tenderId: job.tenderId,
          exportTemplateId: job.exportTemplateId,
          exportTemplateVersionId: job.exportTemplateVersionId,
          documentType: job.documentType,
          mode: job.mode,
          format: job.format,
          status: job.status,
          version: job.version,
          basedOnExportJobId: job.basedOnExportJobId ?? null,
          themeVersionId: job.themeVersionId ?? null,
          themeSourceLevel: job.themeSourceLevel ?? null,
          createdBy: job.createdBy,
          createdAt: job.createdAt,
        },
      }),
      this.prisma.exportSectionSelection.createMany({
        data: job.sections.map((section) => ({
          organizationId: job.organizationId,
          exportJobId: job.id,
          sectionId: section.sectionId,
          taskType: section.taskType ?? null,
          sourceType: section.sourceType,
          generationId: section.generationId ?? null,
          pricingEstimateId: section.pricingEstimateId ?? null,
          pricingEstimateVersionNumber: section.pricingEstimateVersionNumber ?? null,
          manualContent: section.manualContent ?? null,
          ...(section.manualBlocks ? { manualBlocks: section.manualBlocks as Prisma.InputJsonValue } : {}),
          ...(section.deliverableProvenance
            ? { deliverableProvenance: { ...section.deliverableProvenance, selectedAt: section.deliverableProvenance.selectedAt.toISOString() } as Prisma.InputJsonValue }
            : {}),
          validationStatus: section.validationStatus,
          selectedBy: section.selectedBy,
          selectedAt: section.selectedAt,
          order: section.order,
          notes: section.notes ?? null,
        })),
      }),
    ]);
  }

  async findById(input: { organizationId: string; exportJobId: string }): Promise<ExportJobWithArtifact | null> {
    const record = await this.prisma.exportJob.findFirst({
      where: { id: input.exportJobId, organizationId: input.organizationId },
      include: JOB_INCLUDE,
    });
    if (!record) return null;
    return { job: toDomainJob(record), artifact: record.artifact ? toDomainArtifact(record.artifact) : undefined };
  }

  async findByArtifactId(input: { organizationId: string; exportArtifactId: string }): Promise<ExportJobWithArtifact | null> {
    const artifact = await this.prisma.exportArtifact.findFirst({ where: { id: input.exportArtifactId, organizationId: input.organizationId } });
    if (!artifact) return null;
    return this.findById({ organizationId: input.organizationId, exportJobId: artifact.exportJobId });
  }

  async nextVersion(input: { organizationId: string; tenderId: string; documentType: string; format: string }): Promise<number> {
    const latest = await this.prisma.exportJob.findFirst({
      where: { organizationId: input.organizationId, tenderId: input.tenderId, documentType: input.documentType, format: input.format },
      orderBy: { version: "desc" },
    });
    return (latest?.version ?? 0) + 1;
  }

  async list(input: {
    organizationId: string;
    tenderId: string;
    mode?: string | undefined;
    limit: number;
    offset: number;
  }): Promise<{ items: readonly ExportJobWithArtifact[]; total: number }> {
    const where: Prisma.ExportJobWhereInput = {
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      ...(input.mode ? { mode: input.mode } : {}),
    };
    const [records, total] = await Promise.all([
      this.prisma.exportJob.findMany({ where, include: JOB_INCLUDE, orderBy: { createdAt: "desc" }, take: input.limit, skip: input.offset }),
      this.prisma.exportJob.count({ where }),
    ]);
    return {
      items: records.map((record) => ({ job: toDomainJob(record), artifact: record.artifact ? toDomainArtifact(record.artifact) : undefined })),
      total,
    };
  }

  async markGenerating(input: { organizationId: string; exportJobId: string }): Promise<void> {
    await this.prisma.exportJob.update({ where: { id: input.exportJobId }, data: { status: "GENERATING" } });
  }

  async completeWithArtifact(input: { organizationId: string; exportJobId: string; artifact: ExportArtifact; occurredAt: Date }): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.exportArtifact.create({
        data: {
          id: input.artifact.id,
          organizationId: input.artifact.organizationId,
          exportJobId: input.artifact.exportJobId,
          fileName: input.artifact.fileName,
          mimeType: input.artifact.mimeType,
          fileSize: input.artifact.fileSize,
          fileHash: input.artifact.fileHash,
          hashAlgorithm: input.artifact.hashAlgorithm,
          storageKey: input.artifact.storageKey,
          manifestJson: input.artifact.manifest as unknown as Prisma.InputJsonValue,
          warnings: input.artifact.warnings as unknown as Prisma.InputJsonValue,
          errors: input.artifact.errors as unknown as Prisma.InputJsonValue,
          createdAt: input.artifact.createdAt,
        },
      }),
      this.prisma.exportJob.update({ where: { id: input.exportJobId }, data: { status: "COMPLETED", completedAt: input.occurredAt } }),
    ]);
  }

  async markFailed(input: { organizationId: string; exportJobId: string; errorCode: string; errorMessage: string; occurredAt: Date }): Promise<void> {
    await this.prisma.exportJob.update({
      where: { id: input.exportJobId },
      data: { status: "FAILED", errorCode: input.errorCode, errorMessage: input.errorMessage, completedAt: input.occurredAt },
    });
  }
}
