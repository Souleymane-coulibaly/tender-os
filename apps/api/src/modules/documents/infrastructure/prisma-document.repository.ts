import { Injectable } from "@nestjs/common";
import { Prisma, type Document as DocumentRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { DocumentPage, DocumentRepository } from "../application/ports/document.repository";
import { ConcurrentVersionCreationError } from "../domain/errors";
import type { Document } from "../domain/document.aggregate";
import type { DocumentVersion } from "../domain/document-version.entity";
import { DocumentPersistenceMapper } from "./document.persistence-mapper";
import { toDocumentVersionPersistence } from "./prisma-document-version.repository";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Sprint 21 (hardening) — mission §29/§30 : `listByTenderId` n'imposait aucune borne (contrairement
 *  à `list`, déjà paginé par curseur). Même motif que `PrismaTaskRepository`/`PrismaCommentRepository`. */
const MAX_TENDER_DOCUMENTS_PER_QUERY = 1000;

@Injectable()
export class PrismaDocumentRepository implements DocumentRepository {
  private readonly mapper = new DocumentPersistenceMapper();

  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; documentId: string }): Promise<Document | null> {
    const record = await this.prisma.document.findFirst({
      where: { id: input.documentId, organizationId: input.organizationId, deletedAt: null },
    });
    return record ? this.mapper.toDomain(record) : null;
  }

  async list(input: {
    organizationId: string;
    cursor?: string | undefined;
    limit: number;
    status?: string | undefined;
    origin?: string | undefined;
    domain?: string | undefined;
    createdByUserId?: string | undefined;
    search?: string | undefined;
    sort?: "createdAt" | "updatedAt" | "title" | "sizeBytes" | "currentVersionNumber" | undefined;
    sortDirection?: "asc" | "desc" | undefined;
  }): Promise<DocumentPage> {
    const sortDirection = input.sortDirection ?? "desc";
    const orderBy: Prisma.DocumentOrderByWithRelationInput[] =
      input.sort === "sizeBytes"
        ? [{ currentVersion: { sizeBytes: sortDirection } }, { id: sortDirection }]
        : [{ [input.sort ?? "createdAt"]: sortDirection }, { id: sortDirection }];

    const andConditions: Prisma.DocumentWhereInput[] = [];
    if (input.status) andConditions.push({ status: input.status });
    if (input.origin) andConditions.push({ origin: input.origin });
    if (input.domain) andConditions.push({ domain: input.domain });
    if (input.createdByUserId) andConditions.push({ createdByUserId: input.createdByUserId });
    if (input.search) {
      andConditions.push({
        OR: [
          { title: { contains: input.search, mode: "insensitive" } },
          { currentVersion: { originalFilename: { contains: input.search, mode: "insensitive" } } },
        ],
      });
    }

    const where: Prisma.DocumentWhereInput = {
      organizationId: input.organizationId,
      deletedAt: null,
      ...(andConditions.length > 0 ? { AND: andConditions } : {}),
    };

    const records = await this.prisma.document.findMany({
      where,
      orderBy,
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    const hasNextPage = records.length > input.limit;
    const page = hasNextPage ? records.slice(0, input.limit) : records;

    return {
      items: page.map((record: DocumentRecord) => this.mapper.toDomain(record)),
      nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async listByTenderId(input: { organizationId: string; tenderId: string }): Promise<Document[]> {
    const records = await this.prisma.document.findMany({
      where: {
        organizationId: input.organizationId,
        deletedAt: null,
        tenderAssociations: { some: { tenderId: input.tenderId, organizationId: input.organizationId } },
      },
      take: MAX_TENDER_DOCUMENTS_PER_QUERY,
    });
    return records.map((record: DocumentRecord) => this.mapper.toDomain(record));
  }

  async save(document: Document): Promise<void> {
    const data = this.mapper.toPersistence(document);
    await this.prisma.document.update({ where: { id: data.id }, data });
  }

  async createWithInitialVersion(input: { document: Document; version: DocumentVersion }): Promise<void> {
    const documentData = this.mapper.toPersistence(input.document);
    const versionData = toDocumentVersionPersistence(input.version);

    await this.prisma.$transaction(async (tx) => {
      // Bootstrap : le Document est créé sans pointeur de version courante, car celle-ci
      // n'existe pas encore (contrainte FK) — voir conception §F.
      await tx.document.create({ data: { ...documentData, currentVersionId: null, currentVersionNumber: 0 } });
      await tx.documentVersion.create({ data: versionData });
      await tx.document.update({
        where: { id: documentData.id },
        data: {
          currentVersionId: documentData.currentVersionId,
          currentVersionNumber: documentData.currentVersionNumber,
          updatedAt: documentData.updatedAt,
        },
      });
    });
  }

  async addVersionAndPromote(input: { document: Document; version: DocumentVersion }): Promise<void> {
    const documentData = this.mapper.toPersistence(input.document);
    const versionData = toDocumentVersionPersistence(input.version);

    try {
      await this.prisma.$transaction(async (tx) => {
        // La contrainte unique (documentId, versionNumber) est le véritable garde-fou de
        // concurrence (conception §G) — une violation ici signale une course entre deux uploads.
        await tx.documentVersion.create({ data: versionData });
        await tx.document.update({
          where: { id: documentData.id },
          data: {
            currentVersionId: documentData.currentVersionId,
            currentVersionNumber: documentData.currentVersionNumber,
            updatedAt: documentData.updatedAt,
          },
        });
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConcurrentVersionCreationError();
      }
      throw error;
    }
  }

  async hardDeleteJustCreatedDocument(input: { organizationId: string; documentId: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Retire d'abord le pointeur currentVersionId (contrainte FK) avant de supprimer les
      // DocumentVersion, puis le Document — même ordre que le nettoyage déjà pratiqué par les
      // tests d'intégration (afterAll) pour cette même contrainte.
      await tx.document.updateMany({
        where: { id: input.documentId, organizationId: input.organizationId },
        data: { currentVersionId: null },
      });
      await tx.documentVersion.deleteMany({
        where: { documentId: input.documentId, organizationId: input.organizationId },
      });
      await tx.document.deleteMany({
        where: { id: input.documentId, organizationId: input.organizationId },
      });
    });
  }
}
