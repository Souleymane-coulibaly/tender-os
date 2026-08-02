import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { ExportTemplateVersionActivationConflictError } from "../domain/errors";
import { ExportTemplateVersionStatus } from "../domain/export-template-version-status";
import type { ExportTemplateVersion } from "../domain/export-template-version.entity";
import type { ExportTemplate } from "../domain/export-template.aggregate";
import type { ExportTemplateRepository, ExportTemplateWithVersions } from "../application/ports/export-template.repository";
import { toDomainTemplate, toDomainTemplateVersion } from "./export-template.persistence-mapper";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class PrismaExportTemplateRepository implements ExportTemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createWithFirstVersion(input: { template: ExportTemplate; version: ExportTemplateVersion }): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.exportTemplate.create({
        data: {
          id: input.template.id,
          organizationId: input.template.organizationId,
          documentType: input.template.documentType,
          name: input.template.name,
          description: input.template.description ?? null,
          createdBy: input.template.createdBy,
          createdAt: input.template.createdAt,
        },
      }),
      this.prisma.exportTemplateVersion.create({ data: toVersionRow(input.version) }),
    ]);
  }

  async findById(input: { organizationId: string; exportTemplateId: string }): Promise<ExportTemplateWithVersions | null> {
    const record = await this.prisma.exportTemplate.findFirst({ where: { id: input.exportTemplateId, organizationId: input.organizationId } });
    if (!record) return null;
    const activeVersionRecord = await this.prisma.exportTemplateVersion.findFirst({
      where: { organizationId: input.organizationId, exportTemplateId: input.exportTemplateId, status: ExportTemplateVersionStatus.Active },
    });
    return { template: toDomainTemplate(record), activeVersion: activeVersionRecord ? toDomainTemplateVersion(activeVersionRecord) : undefined };
  }

  async findByDocumentTypeAndName(input: { organizationId: string; documentType: string; name: string }): Promise<ExportTemplate | null> {
    const record = await this.prisma.exportTemplate.findFirst({
      where: { organizationId: input.organizationId, documentType: input.documentType, name: input.name },
    });
    return record ? toDomainTemplate(record) : null;
  }

  async list(input: { organizationId: string }): Promise<readonly ExportTemplateWithVersions[]> {
    const records = await this.prisma.exportTemplate.findMany({ where: { organizationId: input.organizationId }, orderBy: { createdAt: "desc" } });
    const results: ExportTemplateWithVersions[] = [];
    for (const record of records) {
      const activeVersionRecord = await this.prisma.exportTemplateVersion.findFirst({
        where: { organizationId: input.organizationId, exportTemplateId: record.id, status: ExportTemplateVersionStatus.Active },
      });
      results.push({ template: toDomainTemplate(record), activeVersion: activeVersionRecord ? toDomainTemplateVersion(activeVersionRecord) : undefined });
    }
    return results;
  }

  async createVersion(version: ExportTemplateVersion): Promise<void> {
    await this.prisma.exportTemplateVersion.create({ data: toVersionRow(version) });
  }

  async findVersionById(input: { organizationId: string; versionId: string }): Promise<ExportTemplateVersion | null> {
    const record = await this.prisma.exportTemplateVersion.findFirst({ where: { id: input.versionId, organizationId: input.organizationId } });
    return record ? toDomainTemplateVersion(record) : null;
  }

  async findActiveVersion(input: { organizationId: string; exportTemplateId: string }): Promise<ExportTemplateVersion | null> {
    const record = await this.prisma.exportTemplateVersion.findFirst({
      where: { organizationId: input.organizationId, exportTemplateId: input.exportTemplateId, status: ExportTemplateVersionStatus.Active },
    });
    return record ? toDomainTemplateVersion(record) : null;
  }

  async listVersions(input: { organizationId: string; exportTemplateId: string }): Promise<readonly ExportTemplateVersion[]> {
    const records = await this.prisma.exportTemplateVersion.findMany({
      where: { organizationId: input.organizationId, exportTemplateId: input.exportTemplateId },
      orderBy: { version: "desc" },
    });
    return records.map(toDomainTemplateVersion);
  }

  /** Mission Sprint 8A §7/§16 — même motif que `PrismaPromptVersionRepository.activateAtomically`
   *  (Sprint 6) : archive l'éventuelle version ACTIVE puis active la nouvelle, transaction courte.
   *  L'index partiel `export_template_versions_org_template_active_key` (migration) reste le filet
   *  de sécurité de dernier recours. */
  async activateAtomically(input: { organizationId: string; exportTemplateId: string; versionId: string; occurredAt: Date }): Promise<ExportTemplateVersion> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const currentActive = await tx.exportTemplateVersion.findFirst({
          where: { organizationId: input.organizationId, exportTemplateId: input.exportTemplateId, status: ExportTemplateVersionStatus.Active, id: { not: input.versionId } },
        });
        if (currentActive) {
          await tx.exportTemplateVersion.update({ where: { id: currentActive.id }, data: { status: ExportTemplateVersionStatus.Archived, archivedAt: input.occurredAt } });
        }
        const updated = await tx.exportTemplateVersion.update({
          where: { id: input.versionId },
          data: { status: ExportTemplateVersionStatus.Active, activatedAt: input.occurredAt },
        });
        return toDomainTemplateVersion(updated);
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ExportTemplateVersionActivationConflictError();
      }
      throw error;
    }
  }
}

function toVersionRow(version: ExportTemplateVersion) {
  return {
    id: version.id,
    organizationId: version.organizationId,
    exportTemplateId: version.exportTemplateId,
    version: version.version,
    status: version.status,
    format: version.format,
    config: version.config as Prisma.InputJsonValue,
    createdBy: version.createdBy,
    createdAt: version.createdAt,
    activatedAt: version.activatedAt ?? null,
    archivedAt: version.archivedAt ?? null,
  };
}
