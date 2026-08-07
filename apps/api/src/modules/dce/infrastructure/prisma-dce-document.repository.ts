import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { DceDocumentRepository } from "../application/ports/dce-document.repository";
import { DceDocument } from "../domain/dce-document.entity";
import type { DceDocumentCategory } from "../domain/dce-document-category";
import type { DceDocumentProcessingStatus } from "../domain/dce-document-processing-status";
import type { DceDocumentSummary } from "../application/dtos";

const SUMMARY_INCLUDE = { document: { include: { currentVersion: true } } } as const;

/** Durée large et volontaire (mission P1-2), même motif que
 *  MembershipRepository.runExclusiveForOrganization : la transaction reste ouverte le temps que
 *  `fn` (fourni par ImportDceFilesUseCase) termine, y compris l'attente d'un import concurrent
 *  déjà en cours sur le même DCE. */
const DCE_IMPORT_TX_OPTIONS = { timeout: 15_000, maxWait: 15_000 } as const;

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
    currentVersionId: version.id,
    currentVersionNumber: record.document.currentVersionNumber,
    category: record.category,
    processingStatus: record.processingStatus,
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
        category: link.category,
        processingStatus: link.processingStatus,
        createdAt: link.createdAt,
        updatedAt: link.updatedAt,
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
          category: record.category as DceDocumentCategory,
          processingStatus: record.processingStatus as DceDocumentProcessingStatus,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
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

  async updateProcessingStatus(input: {
    organizationId: string;
    dceId: string;
    documentId: string;
    processingStatus: string;
    updatedAt: Date;
  }): Promise<void> {
    await this.prisma.dceDocument.updateMany({
      where: { dceId: input.dceId, documentId: input.documentId, organizationId: input.organizationId },
      data: { processingStatus: input.processingStatus, updatedAt: input.updatedAt },
    });
  }

  async updateCategory(input: {
    organizationId: string;
    dceId: string;
    documentId: string;
    category: string;
    updatedAt: Date;
  }): Promise<void> {
    await this.prisma.dceDocument.updateMany({
      where: { dceId: input.dceId, documentId: input.documentId, organizationId: input.organizationId },
      data: { category: input.category, updatedAt: input.updatedAt },
    });
  }

  async runExclusiveForDce<T>(input: { dceId: string; fn: () => Promise<T> }): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      // Verrou consultatif Postgres scopé au DCE (mission P1-2) : sérialise tout import concurrent
      // du même DCE (deux organisations ou deux DCE différents ne sont jamais bloqués entre eux).
      // Auto-libéré à la fin de la transaction — même mécanisme que PrismaTenderLotRepository et
      // PrismaMembershipRepository.runExclusiveForOrganization.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.dceId}))`;
      return input.fn();
    }, DCE_IMPORT_TX_OPTIONS);
  }
}
