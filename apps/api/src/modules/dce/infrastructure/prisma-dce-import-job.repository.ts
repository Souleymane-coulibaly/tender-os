import { Injectable } from "@nestjs/common";
import type { DceImportJob as DceImportJobRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { DceImportJobRepository } from "../application/ports/dce-import-job.repository";
import type { ImportDceFilesResult } from "../application/use-cases/import-dce-files.use-case";
import { DceImportJob } from "../domain/dce-import-job.aggregate";
import { isDceImportJobStatus } from "../domain/dce-import-job-status";
import { InvalidDceImportJobStatusTransitionError } from "../domain/errors";

function toDomain(record: DceImportJobRecord): DceImportJob {
  if (!isDceImportJobStatus(record.status)) {
    throw new InvalidDceImportJobStatusTransitionError({ from: record.status, to: record.status });
  }
  return DceImportJob.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    status: record.status,
    originalFilename: record.originalFilename,
    sizeBytes: record.sizeBytes,
    totalFiles: record.totalFiles ?? undefined,
    acceptedCount: record.acceptedCount ?? undefined,
    rejectedCount: record.rejectedCount ?? undefined,
    result: (record.result as ImportDceFilesResult | null) ?? undefined,
    errorMessage: record.errorMessage ?? undefined,
    createdByUserId: record.createdByUserId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt ?? undefined,
  });
}

@Injectable()
export class PrismaDceImportJobRepository implements DceImportJobRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; jobId: string }): Promise<DceImportJob | null> {
    const record = await this.prisma.dceImportJob.findFirst({
      where: { id: input.jobId, organizationId: input.organizationId },
    });
    return record ? toDomain(record) : null;
  }

  async create(job: DceImportJob): Promise<void> {
    await this.prisma.dceImportJob.create({
      data: {
        id: job.id,
        organizationId: job.organizationId,
        tenderId: job.tenderId,
        status: job.status,
        originalFilename: job.originalFilename,
        sizeBytes: job.sizeBytes,
        createdByUserId: job.createdByUserId,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
    });
  }

  async save(job: DceImportJob): Promise<void> {
    await this.prisma.dceImportJob.update({
      where: { id: job.id },
      data: {
        status: job.status,
        totalFiles: job.totalFiles ?? null,
        acceptedCount: job.acceptedCount ?? null,
        rejectedCount: job.rejectedCount ?? null,
        // `result` n'est écrit qu'une fois, à la complétion (markCompleted) — jamais touché tant
        // qu'il n'existe pas encore, plutôt que d'écrire un JSON null explicite prématurément.
        ...(job.result ? { result: job.result } : {}),
        errorMessage: job.errorMessage ?? null,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt ?? null,
      },
    });
  }
}
