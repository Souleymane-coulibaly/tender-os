import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { DceDocumentRepository } from "../application/ports/dce-document.repository";
import { DceDocument } from "../domain/dce-document.entity";
import type { DceDocumentSummary } from "../application/dtos";

const SUMMARY_INCLUDE = { document: { include: { currentVersion: true } } } as const;

type DceDocumentWithDocument = Prisma.DceDocumentGetPayload<{ include: typeof SUMMARY_INCLUDE }>;

/** `currentVersion` ne peut être `null` qu'entre la création du Document et la promotion de sa
 *  première version (fenêtre transactionnelle interne à Documents, jamais observable une fois
 *  `createWithInitialVersion` terminé) — voir document.aggregate.ts. Un DceDocument n'est jamais
 *  créé avant que cette transaction ne soit terminée avec succès (ImportDceFileUseCase), donc ce
 *  cas ne devrait jamais se produire ici ; il est néanmoins filtré silencieusement plutôt que de
 *  faire planter une liste entière pour une incohérence qui relèverait d'un bug ailleurs. */
function toSummary(record: DceDocumentWithDocument): DceDocumentSummary | null {
  const version = record.document.currentVersion;
  if (!version) {
    return null;
  }
  return {
    dceId: record.dceId,
    documentId: record.documentId,
    originalFilename: version.originalFilename,
    sanitizedFilename: version.sanitizedFilename,
    mimeType: version.mimeType,
    extension: version.extension,
    sizeBytes: version.sizeBytes,
    checksum: version.checksum,
    currentVersionNumber: record.document.currentVersionNumber,
    createdByUserId: record.createdByUserId,
    createdAt: record.createdAt.toISOString(),
  };
}

@Injectable()
export class PrismaDceDocumentRepository implements DceDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(link: DceDocument): Promise<DceDocument> {
    await this.prisma.dceDocument.create({
      data: {
        dceId: link.dceId,
        documentId: link.documentId,
        organizationId: link.organizationId,
        createdByUserId: link.createdByUserId,
        createdAt: link.createdAt,
      },
    });
    return link;
  }

  async findByDceIdAndDocumentId(input: {
    organizationId: string;
    dceId: string;
    documentId: string;
  }): Promise<DceDocument | null> {
    const record = await this.prisma.dceDocument.findFirst({
      where: { dceId: input.dceId, documentId: input.documentId, organizationId: input.organizationId },
    });
    return record
      ? DceDocument.rehydrate({
          dceId: record.dceId,
          documentId: record.documentId,
          organizationId: record.organizationId,
          createdByUserId: record.createdByUserId,
          createdAt: record.createdAt,
        })
      : null;
  }

  async listSummariesByDceId(input: { organizationId: string; dceId: string }): Promise<DceDocumentSummary[]> {
    const records = await this.prisma.dceDocument.findMany({
      where: { dceId: input.dceId, organizationId: input.organizationId, document: { deletedAt: null } },
      include: SUMMARY_INCLUDE,
      orderBy: { createdAt: "asc" },
    });
    return records.map(toSummary).filter((summary): summary is DceDocumentSummary => summary !== null);
  }

  async getSummaryByDocumentId(input: {
    organizationId: string;
    dceId: string;
    documentId: string;
  }): Promise<DceDocumentSummary | null> {
    const record = await this.prisma.dceDocument.findFirst({
      where: {
        dceId: input.dceId,
        documentId: input.documentId,
        organizationId: input.organizationId,
        document: { deletedAt: null },
      },
      include: SUMMARY_INCLUDE,
    });
    return record ? toSummary(record) : null;
  }

  async findActiveByChecksum(input: {
    organizationId: string;
    dceId: string;
    checksum: string;
  }): Promise<DceDocumentSummary | null> {
    const record = await this.prisma.dceDocument.findFirst({
      where: {
        dceId: input.dceId,
        organizationId: input.organizationId,
        document: { deletedAt: null, currentVersion: { checksum: input.checksum } },
      },
      include: SUMMARY_INCLUDE,
    });
    return record ? toSummary(record) : null;
  }

  async countActiveByDceId(input: { organizationId: string; dceId: string }): Promise<number> {
    return this.prisma.dceDocument.count({
      where: { dceId: input.dceId, organizationId: input.organizationId, document: { deletedAt: null } },
    });
  }
}
