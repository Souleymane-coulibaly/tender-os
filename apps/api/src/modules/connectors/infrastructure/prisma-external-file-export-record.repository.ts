import { Injectable } from "@nestjs/common";
import type { ExternalFileExportRecord as ExternalFileExportRecordRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { ExternalFileExportRecordStatus, ExternalFileExportRecord } from "../domain/external-file-export-record.entity";
import type { ExternalFileExportRecordRepository } from "../application/ports/external-file-export-record.repository";

function toDomain(record: ExternalFileExportRecordRecord): ExternalFileExportRecord {
  return ExternalFileExportRecord.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    connectionId: record.connectionId,
    documentId: record.documentId,
    documentVersionId: record.documentVersionId,
    remoteContainerId: record.remoteContainerId,
    remoteFolderId: record.remoteFolderId,
    filename: record.filename,
    status: record.status as ExternalFileExportRecordStatus,
    remoteFileId: record.remoteFileId ?? undefined,
    remoteFileMimeType: record.remoteFileMimeType ?? undefined,
    remoteFileSizeBytes: record.remoteFileSizeBytes ?? undefined,
    remoteFileModifiedAt: record.remoteFileModifiedAt ?? undefined,
    remoteFileETag: record.remoteFileETag ?? undefined,
    remoteFileWebUrl: record.remoteFileWebUrl ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

@Injectable()
export class PrismaExternalFileExportRecordRepository implements ExternalFileExportRecordRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByDestination(input: { organizationId: string; connectionId: string; documentId: string; documentVersionId: string; remoteContainerId: string; remoteFolderId: string; filename: string }): Promise<ExternalFileExportRecord | null> {
    const record = await this.prisma.currentClient().externalFileExportRecord.findFirst({
      where: {
        organizationId: input.organizationId,
        connectionId: input.connectionId,
        documentId: input.documentId,
        documentVersionId: input.documentVersionId,
        remoteContainerId: input.remoteContainerId,
        remoteFolderId: input.remoteFolderId,
        filename: input.filename,
      },
    });
    return record ? toDomain(record) : null;
  }

  async save(record: ExternalFileExportRecord): Promise<void> {
    const data = {
      id: record.id,
      organizationId: record.organizationId,
      connectionId: record.connectionId,
      documentId: record.documentId,
      documentVersionId: record.documentVersionId,
      remoteContainerId: record.remoteContainerId,
      remoteFolderId: record.remoteFolderId,
      filename: record.filename,
      status: record.status,
      remoteFileId: record.remoteFileId ?? null,
      remoteFileMimeType: record.remoteFileMimeType ?? null,
      remoteFileSizeBytes: record.remoteFileSizeBytes ?? null,
      remoteFileModifiedAt: record.remoteFileModifiedAt ?? null,
      remoteFileETag: record.remoteFileETag ?? null,
      remoteFileWebUrl: record.remoteFileWebUrl ?? null,
    };
    await this.prisma.currentClient().externalFileExportRecord.upsert({ where: { id: data.id }, create: data, update: data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma
      .currentClient()
      .externalFileExportRecord.delete({ where: { id } })
      .catch(() => undefined);
  }

  /** Correctif audit Codex (P1-001/P1-002) — même mécanisme que
   *  `PrismaExternalFileImportRecordRepository.withLock`. `fn` doit rester COURT — jamais l'upload
   *  provider à l'intérieur (voir le port pour le détail complet). */
  async withLock<T>(key: { connectionId: string; documentId: string; documentVersionId: string; remoteContainerId: string; remoteFolderId: string; filename: string }, fn: () => Promise<T>): Promise<T> {
    const lockKey = `connectors:export:${key.connectionId}:${key.documentId}:${key.documentVersionId}:${key.remoteContainerId}:${key.remoteFolderId}:${key.filename}`;
    return this.prisma.withTransaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      return fn();
    });
  }
}
