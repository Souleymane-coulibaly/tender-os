import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { ConcurrentDocumentGenerationError } from "../domain/errors";
import type { GeneratedDocumentRevision } from "../domain/generated-document-revision.entity";
import type { GeneratedDocument } from "../domain/generated-document.aggregate";
import type { GeneratedDocumentRepository } from "../application/ports/generated-document.repository";
import { toDomainGeneratedDocument, toDomainRevision, toRevisionRow } from "./generated-document.persistence-mapper";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class PrismaGeneratedDocumentRepository implements GeneratedDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async lockGeneratedDocument(input: { organizationId: string; generatedDocumentId: string }): Promise<void> {
    await this.prisma.currentClient().$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${input.organizationId}:${input.generatedDocumentId}`}))`;
  }

  async lockGenerationScope(input: { organizationId: string; tenderId: string; documentTemplateId: string; subjectId: string | null }): Promise<void> {
    const key = `${input.organizationId}:${input.tenderId}:${input.documentTemplateId}:${input.subjectId ?? ""}`;
    await this.prisma.currentClient().$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }

  async create(generatedDocument: GeneratedDocument): Promise<void> {
    await this.prisma.currentClient().generatedDocument.create({
      data: {
        id: generatedDocument.id,
        organizationId: generatedDocument.organizationId,
        clientAccountId: generatedDocument.clientAccountId,
        tenderId: generatedDocument.tenderId,
        documentTemplateId: generatedDocument.documentTemplateId,
        title: generatedDocument.title,
        subjectId: generatedDocument.subjectId ?? null,
        createdBy: generatedDocument.createdBy,
        createdAt: generatedDocument.createdAt,
      },
    });
  }

  async findById(input: { organizationId: string; generatedDocumentId: string }): Promise<GeneratedDocument | null> {
    const record = await this.prisma.currentClient().generatedDocument.findFirst({ where: { id: input.generatedDocumentId, organizationId: input.organizationId } });
    return record ? toDomainGeneratedDocument(record) : null;
  }

  async findLatestByScope(input: { organizationId: string; tenderId: string; documentTemplateId: string; subjectId: string | null }): Promise<GeneratedDocument | null> {
    const record = await this.prisma.currentClient().generatedDocument.findFirst({
      where: { organizationId: input.organizationId, tenderId: input.tenderId, documentTemplateId: input.documentTemplateId, subjectId: input.subjectId },
      orderBy: { createdAt: "desc" },
    });
    return record ? toDomainGeneratedDocument(record) : null;
  }

  async list(input: { organizationId: string; tenderId: string }): Promise<readonly GeneratedDocument[]> {
    const records = await this.prisma.currentClient().generatedDocument.findMany({
      where: { organizationId: input.organizationId, tenderId: input.tenderId },
      orderBy: { createdAt: "desc" },
    });
    return records.map(toDomainGeneratedDocument);
  }

  async createRevision(revision: GeneratedDocumentRevision): Promise<void> {
    try {
      await this.prisma.currentClient().generatedDocumentRevision.create({ data: toRevisionRow(revision) });
    } catch (error) {
      // Sprint 21 — le rendu s'exécute désormais hors verrou/transaction (voir
      // GenerateDocumentUseCase/RegenerateDocumentUseCase) : la contrainte UNIQUE
      // [generatedDocumentId, revisionNumber] est le filet de sécurité pour une régénération
      // concurrente de la MÊME lignée, jamais une écriture silencieusement perdue/écrasée.
      if (isUniqueConstraintViolation(error)) {
        throw new ConcurrentDocumentGenerationError();
      }
      throw error;
    }
  }

  async findRevisionById(input: { organizationId: string; revisionId: string }): Promise<GeneratedDocumentRevision | null> {
    const record = await this.prisma.currentClient().generatedDocumentRevision.findFirst({ where: { id: input.revisionId, organizationId: input.organizationId } });
    return record ? toDomainRevision(record) : null;
  }

  async listRevisions(input: { organizationId: string; generatedDocumentId: string }): Promise<readonly GeneratedDocumentRevision[]> {
    const records = await this.prisma.currentClient().generatedDocumentRevision.findMany({
      where: { organizationId: input.organizationId, generatedDocumentId: input.generatedDocumentId },
      orderBy: { revisionNumber: "desc" },
    });
    return records.map(toDomainRevision);
  }

  async findLatestRevision(input: { organizationId: string; generatedDocumentId: string }): Promise<GeneratedDocumentRevision | null> {
    const record = await this.prisma.currentClient().generatedDocumentRevision.findFirst({
      where: { organizationId: input.organizationId, generatedDocumentId: input.generatedDocumentId },
      orderBy: { revisionNumber: "desc" },
    });
    return record ? toDomainRevision(record) : null;
  }

  async nextRevisionNumber(input: { organizationId: string; generatedDocumentId: string }): Promise<number> {
    const latest = await this.prisma.currentClient().generatedDocumentRevision.findFirst({
      where: { organizationId: input.organizationId, generatedDocumentId: input.generatedDocumentId },
      orderBy: { revisionNumber: "desc" },
    });
    return (latest?.revisionNumber ?? 0) + 1;
  }
}
