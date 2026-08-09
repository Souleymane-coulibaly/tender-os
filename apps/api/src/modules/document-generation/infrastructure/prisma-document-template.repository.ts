import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { DocumentTemplateVersionActivationConflictError } from "../domain/errors";
import { DocumentTemplateVersionStatus } from "../domain/document-template-version-status";
import type { DocumentTemplateFieldMapping } from "../domain/document-template-field-mapping";
import type { DocumentTemplateVersion } from "../domain/document-template-version.entity";
import type { DocumentTemplate } from "../domain/document-template.aggregate";
import type { DocumentTemplateRepository, DocumentTemplateWithActiveVersion } from "../application/ports/document-template.repository";
import { toDomainTemplate, toDomainTemplateVersion, toFieldMappingRows, toVersionRow } from "./document-template.persistence-mapper";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class PrismaDocumentTemplateRepository implements DocumentTemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(template: DocumentTemplate): Promise<void> {
    await this.prisma.currentClient().documentTemplate.create({
      data: {
        id: template.id,
        organizationId: template.organizationId,
        scope: template.scope,
        name: template.name,
        description: template.description ?? null,
        createdBy: template.createdBy,
        createdAt: template.createdAt,
        archivedAt: template.archivedAt ?? null,
      },
    });
  }

  private async loadActiveVersion(input: { organizationId: string; documentTemplateId: string }): Promise<DocumentTemplateVersion | undefined> {
    const record = await this.prisma.currentClient().documentTemplateVersion.findFirst({
      where: { organizationId: input.organizationId, documentTemplateId: input.documentTemplateId, status: DocumentTemplateVersionStatus.Active },
    });
    if (!record) return undefined;
    const fieldMappingRows = await this.prisma.currentClient().documentTemplateFieldMapping.findMany({ where: { documentTemplateVersionId: record.id } });
    return toDomainTemplateVersion(record, fieldMappingRows);
  }

  async findById(input: { organizationId: string; documentTemplateId: string }): Promise<DocumentTemplateWithActiveVersion | null> {
    const record = await this.prisma.currentClient().documentTemplate.findFirst({ where: { id: input.documentTemplateId, organizationId: input.organizationId } });
    if (!record) return null;
    return { template: toDomainTemplate(record), activeVersion: await this.loadActiveVersion({ organizationId: input.organizationId, documentTemplateId: record.id }) };
  }

  async findByName(input: { organizationId: string; name: string }): Promise<DocumentTemplate | null> {
    const record = await this.prisma.currentClient().documentTemplate.findFirst({ where: { organizationId: input.organizationId, name: input.name } });
    return record ? toDomainTemplate(record) : null;
  }

  async list(input: { organizationId: string }): Promise<readonly DocumentTemplateWithActiveVersion[]> {
    const records = await this.prisma.currentClient().documentTemplate.findMany({ where: { organizationId: input.organizationId }, orderBy: { createdAt: "desc" } });
    const results: DocumentTemplateWithActiveVersion[] = [];
    for (const record of records) {
      results.push({ template: toDomainTemplate(record), activeVersion: await this.loadActiveVersion({ organizationId: input.organizationId, documentTemplateId: record.id }) });
    }
    return results;
  }

  async createVersion(input: { version: DocumentTemplateVersion; fieldMappings: readonly DocumentTemplateFieldMapping[] }): Promise<void> {
    const client = this.prisma.currentClient();
    await client.documentTemplateVersion.create({ data: toVersionRow(input.version) });
    const rows = toFieldMappingRows({ documentTemplateVersionId: input.version.id, organizationId: input.version.organizationId, mappings: input.fieldMappings });
    if (rows.length > 0) {
      await client.documentTemplateFieldMapping.createMany({ data: rows });
    }
  }

  async findVersionById(input: { organizationId: string; versionId: string }): Promise<DocumentTemplateVersion | null> {
    const record = await this.prisma.currentClient().documentTemplateVersion.findFirst({ where: { id: input.versionId, organizationId: input.organizationId } });
    if (!record) return null;
    const fieldMappingRows = await this.prisma.currentClient().documentTemplateFieldMapping.findMany({ where: { documentTemplateVersionId: record.id } });
    return toDomainTemplateVersion(record, fieldMappingRows);
  }

  async findActiveVersion(input: { organizationId: string; documentTemplateId: string }): Promise<DocumentTemplateVersion | null> {
    return (await this.loadActiveVersion(input)) ?? null;
  }

  async listVersions(input: { organizationId: string; documentTemplateId: string }): Promise<readonly DocumentTemplateVersion[]> {
    const records = await this.prisma.currentClient().documentTemplateVersion.findMany({
      where: { organizationId: input.organizationId, documentTemplateId: input.documentTemplateId },
      orderBy: { version: "desc" },
    });
    const results: DocumentTemplateVersion[] = [];
    for (const record of records) {
      const fieldMappingRows = await this.prisma.currentClient().documentTemplateFieldMapping.findMany({ where: { documentTemplateVersionId: record.id } });
      results.push(toDomainTemplateVersion(record, fieldMappingRows));
    }
    return results;
  }

  async nextVersionNumber(input: { organizationId: string; documentTemplateId: string }): Promise<number> {
    const latest = await this.prisma.currentClient().documentTemplateVersion.findFirst({
      where: { organizationId: input.organizationId, documentTemplateId: input.documentTemplateId },
      orderBy: { version: "desc" },
    });
    return (latest?.version ?? 0) + 1;
  }

  async activateAtomically(input: { organizationId: string; documentTemplateId: string; versionId: string; occurredAt: Date }): Promise<DocumentTemplateVersion> {
    try {
      return await this.prisma.withTransaction(async (tx) => {
        const currentActive = await tx.documentTemplateVersion.findFirst({
          where: { organizationId: input.organizationId, documentTemplateId: input.documentTemplateId, status: DocumentTemplateVersionStatus.Active, id: { not: input.versionId } },
        });
        if (currentActive) {
          await tx.documentTemplateVersion.update({ where: { id: currentActive.id }, data: { status: DocumentTemplateVersionStatus.Archived, archivedAt: input.occurredAt } });
        }
        const updated = await tx.documentTemplateVersion.update({
          where: { id: input.versionId },
          data: { status: DocumentTemplateVersionStatus.Active, activatedAt: input.occurredAt },
        });
        const fieldMappingRows = await tx.documentTemplateFieldMapping.findMany({ where: { documentTemplateVersionId: updated.id } });
        return toDomainTemplateVersion(updated, fieldMappingRows);
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new DocumentTemplateVersionActivationConflictError();
      }
      throw error;
    }
  }
}
