import { Injectable } from "@nestjs/common";
import type { DocumentVersion as DocumentVersionRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { DocumentVersionRepository } from "../application/ports/document-version.repository";
import { DocumentVersion } from "../domain/document-version.entity";

function toDomain(record: DocumentVersionRecord): DocumentVersion {
  return DocumentVersion.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    documentId: record.documentId,
    versionNumber: record.versionNumber,
    originalFilename: record.originalFilename,
    sanitizedFilename: record.sanitizedFilename,
    mimeType: record.mimeType,
    extension: record.extension,
    sizeBytes: record.sizeBytes,
    checksum: record.checksum,
    storageKey: record.storageKey,
    uploadedByUserId: record.uploadedByUserId,
    createdAt: record.createdAt,
  });
}

/** Exportée pour être réutilisée par `PrismaDocumentRepository` dans ses méthodes composites
 *  (`createWithInitialVersion`/`addVersionAndPromote`), seul autre endroit où une
 *  DocumentVersion est écrite. */
export function toDocumentVersionPersistence(version: DocumentVersion) {
  return {
    id: version.id,
    organizationId: version.organizationId,
    documentId: version.documentId,
    versionNumber: version.versionNumber,
    originalFilename: version.originalFilename,
    sanitizedFilename: version.sanitizedFilename,
    mimeType: version.mimeType,
    extension: version.extension,
    sizeBytes: version.sizeBytes,
    checksum: version.checksum,
    storageKey: version.storageKey,
    uploadedByUserId: version.uploadedByUserId,
    createdAt: version.createdAt,
  };
}

@Injectable()
export class PrismaDocumentVersionRepository implements DocumentVersionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: {
    organizationId: string;
    documentId: string;
    versionId: string;
  }): Promise<DocumentVersion | null> {
    const record = await this.prisma.documentVersion.findFirst({
      where: { id: input.versionId, documentId: input.documentId, organizationId: input.organizationId },
    });
    return record ? toDomain(record) : null;
  }

  async listByDocument(input: { organizationId: string; documentId: string }): Promise<DocumentVersion[]> {
    const records = await this.prisma.documentVersion.findMany({
      where: { documentId: input.documentId, organizationId: input.organizationId },
      orderBy: { versionNumber: "asc" },
    });
    return records.map(toDomain);
  }

  async findByIds(input: { organizationId: string; versionIds: readonly string[] }): Promise<DocumentVersion[]> {
    if (input.versionIds.length === 0) return [];
    const records = await this.prisma.documentVersion.findMany({
      where: { organizationId: input.organizationId, id: { in: [...input.versionIds] } },
    });
    return records.map(toDomain);
  }

  async getHighestVersionNumber(input: { organizationId: string; documentId: string }): Promise<number> {
    const record = await this.prisma.documentVersion.findFirst({
      where: { documentId: input.documentId, organizationId: input.organizationId },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });
    return record?.versionNumber ?? 0;
  }

  async sumStorageBytesForOrganization(organizationId: string): Promise<number> {
    const result = await this.prisma.documentVersion.aggregate({ where: { organizationId }, _sum: { sizeBytes: true } });
    return result._sum.sizeBytes ?? 0;
  }
}
