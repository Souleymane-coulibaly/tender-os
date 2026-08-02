import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { ValidationIssue } from "../domain/validation-issue";
import type { ValidationRun } from "../domain/validation-run.aggregate";
import type { ValidationRunRepository } from "../application/ports/validation-run.repository";
import { toDomainIssue, toDomainRun } from "./validation.persistence-mapper";

const RUN_INCLUDE = { issues: { orderBy: { detectedAt: "asc" as const } } };

@Injectable()
export class PrismaValidationRunRepository implements ValidationRunRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: { run: ValidationRun; issues: readonly ValidationIssue[] }): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.validationRun.create({
        data: {
          id: input.run.id,
          organizationId: input.run.organizationId,
          clientAccountId: input.run.clientAccountId,
          tenderId: input.run.tenderId,
          exportJobId: input.run.exportJobId,
          readinessStatus: input.run.readinessStatus,
          runBy: input.run.runBy,
          runAt: input.run.runAt,
        },
      }),
      ...(input.issues.length > 0
        ? [
            this.prisma.validationIssue.createMany({
              data: input.issues.map((issue) => ({
                id: issue.id,
                organizationId: issue.organizationId,
                validationRunId: input.run.id,
                ruleCode: issue.ruleCode,
                severity: issue.severity,
                message: issue.message,
                resourceType: issue.resourceType ?? null,
                resourceId: issue.resourceId ?? null,
                source: issue.source ?? null,
                recommendation: issue.recommendation ?? null,
                detectedAt: issue.detectedAt,
                resolutionStatus: issue.resolutionStatus,
              })),
            }),
          ]
        : []),
    ]);
  }

  async findById(input: { organizationId: string; validationRunId: string }): Promise<ValidationRun | null> {
    const record = await this.prisma.validationRun.findFirst({ where: { id: input.validationRunId, organizationId: input.organizationId }, include: RUN_INCLUDE });
    return record ? toDomainRun(record) : null;
  }

  async findLatestForExportJob(input: { organizationId: string; exportJobId: string }): Promise<ValidationRun | null> {
    const record = await this.prisma.validationRun.findFirst({
      where: { organizationId: input.organizationId, exportJobId: input.exportJobId },
      include: RUN_INCLUDE,
      orderBy: { runAt: "desc" },
    });
    return record ? toDomainRun(record) : null;
  }

  async list(input: { organizationId: string; tenderId: string; limit: number; offset: number }): Promise<{ items: readonly ValidationRun[]; total: number }> {
    const where = { organizationId: input.organizationId, tenderId: input.tenderId };
    const [records, total] = await Promise.all([
      this.prisma.validationRun.findMany({ where, include: RUN_INCLUDE, orderBy: { runAt: "desc" }, take: input.limit, skip: input.offset }),
      this.prisma.validationRun.count({ where }),
    ]);
    return { items: records.map(toDomainRun), total };
  }

  async findIssueById(input: { organizationId: string; issueId: string }): Promise<ValidationIssue | null> {
    const record = await this.prisma.validationIssue.findFirst({ where: { id: input.issueId, organizationId: input.organizationId } });
    return record ? toDomainIssue(record) : null;
  }

  async saveIssue(issue: ValidationIssue): Promise<void> {
    await this.prisma.validationIssue.update({
      where: { id: issue.id },
      data: {
        resolutionStatus: issue.resolutionStatus,
        resolvedAt: issue.resolvedAt ?? null,
        resolvedBy: issue.resolvedBy ?? null,
        resolutionNote: issue.resolutionNote ?? null,
      },
    });
  }
}
