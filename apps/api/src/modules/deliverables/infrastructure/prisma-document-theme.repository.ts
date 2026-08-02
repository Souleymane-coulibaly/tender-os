import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { DocumentThemeRepository, DocumentThemeWithVersions } from "../application/ports/document-theme.repository";
import type { DocumentTheme } from "../domain/document-theme.aggregate";
import type { DocumentThemeVersion } from "../domain/document-theme-version.entity";
import { DocumentThemeVersionActivationConflictError } from "../domain/errors";
import type { ScopeLevel } from "../domain/scope-level";
import { VersionLifecycleStatus } from "../domain/version-lifecycle-status";
import { toDomainTheme, toDomainThemeVersion, toThemeRow, toThemeVersionRow } from "./document-theme.persistence-mapper";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class PrismaDocumentThemeRepository implements DocumentThemeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createWithFirstVersion(input: { theme: DocumentTheme; version: DocumentThemeVersion }): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.documentTheme.create({ data: toThemeRow(input.theme) }),
      this.prisma.documentThemeVersion.create({ data: toThemeVersionRow(input.version) }),
    ]);
  }

  async findById(input: { organizationId: string; documentThemeId: string }): Promise<DocumentThemeWithVersions | null> {
    const record = await this.prisma.documentTheme.findFirst({ where: { id: input.documentThemeId, organizationId: input.organizationId } });
    if (!record) return null;
    const activeVersionRecord = await this.prisma.documentThemeVersion.findFirst({
      where: { organizationId: input.organizationId, documentThemeId: input.documentThemeId, status: VersionLifecycleStatus.Active },
    });
    return { theme: toDomainTheme(record), activeVersion: activeVersionRecord ? toDomainThemeVersion(activeVersionRecord) : undefined };
  }

  async list(input: { organizationId: string }): Promise<readonly DocumentThemeWithVersions[]> {
    const records = await this.prisma.documentTheme.findMany({ where: { organizationId: input.organizationId }, orderBy: { createdAt: "desc" } });
    const results: DocumentThemeWithVersions[] = [];
    for (const record of records) {
      const activeVersionRecord = await this.prisma.documentThemeVersion.findFirst({
        where: { organizationId: input.organizationId, documentThemeId: record.id, status: VersionLifecycleStatus.Active },
      });
      results.push({ theme: toDomainTheme(record), activeVersion: activeVersionRecord ? toDomainThemeVersion(activeVersionRecord) : undefined });
    }
    return results;
  }

  async createVersion(version: DocumentThemeVersion): Promise<void> {
    await this.prisma.documentThemeVersion.create({ data: toThemeVersionRow(version) });
  }

  async findVersionById(input: { organizationId: string; versionId: string }): Promise<DocumentThemeVersion | null> {
    const record = await this.prisma.documentThemeVersion.findFirst({ where: { id: input.versionId, organizationId: input.organizationId } });
    return record ? toDomainThemeVersion(record) : null;
  }

  async listVersions(input: { organizationId: string; documentThemeId: string }): Promise<readonly DocumentThemeVersion[]> {
    const records = await this.prisma.documentThemeVersion.findMany({
      where: { organizationId: input.organizationId, documentThemeId: input.documentThemeId },
      orderBy: { version: "desc" },
    });
    return records.map(toDomainThemeVersion);
  }

  async activateAtomically(input: { organizationId: string; documentThemeId: string; versionId: string; occurredAt: Date }): Promise<DocumentThemeVersion> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const currentActive = await tx.documentThemeVersion.findFirst({
          where: { organizationId: input.organizationId, documentThemeId: input.documentThemeId, status: VersionLifecycleStatus.Active, id: { not: input.versionId } },
        });
        if (currentActive) {
          await tx.documentThemeVersion.update({ where: { id: currentActive.id }, data: { status: VersionLifecycleStatus.Archived, archivedAt: input.occurredAt } });
        }
        const updated = await tx.documentThemeVersion.update({
          where: { id: input.versionId },
          data: { status: VersionLifecycleStatus.Active, activatedAt: input.occurredAt },
        });
        return toDomainThemeVersion(updated);
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new DocumentThemeVersionActivationConflictError();
      }
      throw error;
    }
  }

  async findActiveVersionForScope(input: {
    organizationId: string;
    scopeLevel: ScopeLevel;
    clientAccountId?: string | undefined;
    tenderId?: string | undefined;
  }): Promise<{ theme: DocumentTheme; version: DocumentThemeVersion } | null> {
    const theme = await this.prisma.documentTheme.findFirst({
      where: {
        organizationId: input.organizationId,
        scopeLevel: input.scopeLevel,
        clientAccountId: input.scopeLevel === "CLIENT" ? (input.clientAccountId ?? null) : null,
        tenderId: input.scopeLevel === "TENDER" ? (input.tenderId ?? null) : null,
      },
    });
    if (!theme) return null;
    const version = await this.prisma.documentThemeVersion.findFirst({
      where: { organizationId: input.organizationId, documentThemeId: theme.id, status: VersionLifecycleStatus.Active },
    });
    if (!version) return null;
    return { theme: toDomainTheme(theme), version: toDomainThemeVersion(version) };
  }
}
