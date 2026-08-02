import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ID_GENERATOR, type IdGenerator } from "../../../shared-kernel/id-generator";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { DeliverableTemplateRepository, DeliverableTemplateWithVersions } from "../application/ports/deliverable-template.repository";
import type { DeliverableTemplate } from "../domain/deliverable-template.aggregate";
import type { DeliverableTemplateVersion } from "../domain/deliverable-template-version.entity";
import type { DeliverableType } from "../domain/deliverable-type";
import { DeliverableTemplateVersionActivationConflictError } from "../domain/errors";
import type { ScopeLevel } from "../domain/scope-level";
import { VersionLifecycleStatus } from "../domain/version-lifecycle-status";
import { toDomainTemplate, toDomainTemplateVersion, toSectionRows, toTemplateRow, toVersionRow } from "./deliverable-template.persistence-mapper";

const VERSION_INCLUDE = { sections: true } as const;

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class PrismaDeliverableTemplateRepository implements DeliverableTemplateRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async createWithFirstVersion(input: { template: DeliverableTemplate; version: DeliverableTemplateVersion }): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.deliverableTemplate.create({ data: toTemplateRow(input.template) }),
      this.prisma.deliverableTemplateVersion.create({ data: toVersionRow(input.version) }),
      this.prisma.deliverableTemplateSection.createMany({
        data: toSectionRows(input.version, this.idGenerator, input.template.organizationId),
      }),
    ]);
  }

  async findById(input: { organizationId: string; deliverableTemplateId: string }): Promise<DeliverableTemplateWithVersions | null> {
    const record = await this.prisma.deliverableTemplate.findFirst({ where: { id: input.deliverableTemplateId, organizationId: input.organizationId } });
    if (!record) return null;
    const activeVersionRecord = await this.prisma.deliverableTemplateVersion.findFirst({
      where: { organizationId: input.organizationId, deliverableTemplateId: input.deliverableTemplateId, status: VersionLifecycleStatus.Active },
      include: VERSION_INCLUDE,
    });
    return { template: toDomainTemplate(record), activeVersion: activeVersionRecord ? toDomainTemplateVersion(activeVersionRecord) : undefined };
  }

  async list(input: { organizationId: string; documentType?: DeliverableType | undefined }): Promise<readonly DeliverableTemplateWithVersions[]> {
    const records = await this.prisma.deliverableTemplate.findMany({
      where: { organizationId: input.organizationId, ...(input.documentType ? { documentType: input.documentType } : {}) },
      orderBy: { createdAt: "desc" },
    });
    const results: DeliverableTemplateWithVersions[] = [];
    for (const record of records) {
      const activeVersionRecord = await this.prisma.deliverableTemplateVersion.findFirst({
        where: { organizationId: input.organizationId, deliverableTemplateId: record.id, status: VersionLifecycleStatus.Active },
        include: VERSION_INCLUDE,
      });
      results.push({ template: toDomainTemplate(record), activeVersion: activeVersionRecord ? toDomainTemplateVersion(activeVersionRecord) : undefined });
    }
    return results;
  }

  async createVersion(version: DeliverableTemplateVersion): Promise<void> {
    const template = await this.prisma.deliverableTemplate.findFirstOrThrow({ where: { id: version.deliverableTemplateId, organizationId: version.organizationId } });
    await this.prisma.$transaction([
      this.prisma.deliverableTemplateVersion.create({ data: toVersionRow(version) }),
      this.prisma.deliverableTemplateSection.createMany({ data: toSectionRows(version, this.idGenerator, template.organizationId) }),
    ]);
  }

  async findVersionById(input: { organizationId: string; versionId: string }): Promise<DeliverableTemplateVersion | null> {
    const record = await this.prisma.deliverableTemplateVersion.findFirst({
      where: { id: input.versionId, organizationId: input.organizationId },
      include: VERSION_INCLUDE,
    });
    return record ? toDomainTemplateVersion(record) : null;
  }

  async listVersions(input: { organizationId: string; deliverableTemplateId: string }): Promise<readonly DeliverableTemplateVersion[]> {
    const records = await this.prisma.deliverableTemplateVersion.findMany({
      where: { organizationId: input.organizationId, deliverableTemplateId: input.deliverableTemplateId },
      orderBy: { version: "desc" },
      include: VERSION_INCLUDE,
    });
    return records.map(toDomainTemplateVersion);
  }

  async activateAtomically(input: { organizationId: string; deliverableTemplateId: string; versionId: string; occurredAt: Date }): Promise<DeliverableTemplateVersion> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const currentActive = await tx.deliverableTemplateVersion.findFirst({
          where: { organizationId: input.organizationId, deliverableTemplateId: input.deliverableTemplateId, status: VersionLifecycleStatus.Active, id: { not: input.versionId } },
        });
        if (currentActive) {
          await tx.deliverableTemplateVersion.update({ where: { id: currentActive.id }, data: { status: VersionLifecycleStatus.Archived, archivedAt: input.occurredAt } });
        }
        const updated = await tx.deliverableTemplateVersion.update({
          where: { id: input.versionId },
          data: { status: VersionLifecycleStatus.Active, activatedAt: input.occurredAt },
          include: VERSION_INCLUDE,
        });
        return toDomainTemplateVersion(updated);
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new DeliverableTemplateVersionActivationConflictError();
      }
      throw error;
    }
  }

  async findActiveVersionForScope(input: {
    organizationId: string;
    scopeLevel: ScopeLevel;
    clientAccountId?: string | undefined;
    tenderId?: string | undefined;
    documentType: DeliverableType;
  }): Promise<{ template: DeliverableTemplate; version: DeliverableTemplateVersion } | null> {
    const template = await this.prisma.deliverableTemplate.findFirst({
      where: {
        organizationId: input.organizationId,
        scopeLevel: input.scopeLevel,
        documentType: input.documentType,
        clientAccountId: input.scopeLevel === "CLIENT" ? (input.clientAccountId ?? null) : null,
        tenderId: input.scopeLevel === "TENDER" ? (input.tenderId ?? null) : null,
      },
    });
    if (!template) return null;
    const version = await this.prisma.deliverableTemplateVersion.findFirst({
      where: { organizationId: input.organizationId, deliverableTemplateId: template.id, status: VersionLifecycleStatus.Active },
      include: VERSION_INCLUDE,
    });
    if (!version) return null;
    return { template: toDomainTemplate(template), version: toDomainTemplateVersion(version) };
  }
}
