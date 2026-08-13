import { Injectable } from "@nestjs/common";
import type { ExternalFileImportRecord as ExternalFileImportRecordRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { ExternalFileImportRecordStatus, ExternalFileImportRecord } from "../domain/external-file-import-record.entity";
import type { ExternalFileImportRecordRepository } from "../application/ports/external-file-import-record.repository";

function toDomain(record: ExternalFileImportRecordRecord): ExternalFileImportRecord {
  return ExternalFileImportRecord.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    connectionId: record.connectionId,
    remoteContainerId: record.remoteContainerId,
    remoteFileId: record.remoteFileId,
    targetDocumentId: record.targetDocumentId ?? undefined,
    contentChecksum: record.contentChecksum,
    status: record.status as ExternalFileImportRecordStatus,
    documentId: record.documentId ?? undefined,
    documentVersionId: record.documentVersionId ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

@Injectable()
export class PrismaExternalFileImportRecordRepository implements ExternalFileImportRecordRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByRemoteFile(input: { organizationId: string; connectionId: string; remoteContainerId: string; remoteFileId: string; targetDocumentId?: string | undefined }): Promise<ExternalFileImportRecord | null> {
    const record = await this.prisma.currentClient().externalFileImportRecord.findFirst({
      where: {
        organizationId: input.organizationId,
        connectionId: input.connectionId,
        remoteContainerId: input.remoteContainerId,
        remoteFileId: input.remoteFileId,
        targetDocumentId: input.targetDocumentId ?? null,
      },
    });
    return record ? toDomain(record) : null;
  }

  async save(record: ExternalFileImportRecord): Promise<void> {
    const data = {
      id: record.id,
      organizationId: record.organizationId,
      connectionId: record.connectionId,
      remoteContainerId: record.remoteContainerId,
      remoteFileId: record.remoteFileId,
      targetDocumentId: record.targetDocumentId ?? null,
      contentChecksum: record.contentChecksum,
      status: record.status,
      documentId: record.documentId ?? null,
      documentVersionId: record.documentVersionId ?? null,
    };
    await this.prisma.currentClient().externalFileImportRecord.upsert({ where: { id: data.id }, create: data, update: data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma
      .currentClient()
      .externalFileImportRecord.delete({ where: { id } })
      .catch(() => undefined);
  }

  /** Correctif audit Codex (P1-001/P1-002) — verrou consultatif Postgres scopé à la clé
   *  d'idempotence (jamais à la connexion entière, contrairement à
   *  `ExternalConnectionRepository.withLock` — deux imports de fichiers DIFFÉRENTS restent
   *  parallèles). `fn` doit rester COURT : la transaction englobante reste ouverte pendant TOUTE son
   *  exécution — jamais un appel réseau externe à l'intérieur (voir le port pour le détail complet). */
  async withLock<T>(key: { connectionId: string; remoteContainerId: string; remoteFileId: string; targetDocumentId?: string | undefined }, fn: () => Promise<T>): Promise<T> {
    const lockKey = `connectors:import:${key.connectionId}:${key.remoteContainerId}:${key.remoteFileId}:${key.targetDocumentId ?? "NEW"}`;
    return this.prisma.withTransaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      return fn();
    });
  }
}
