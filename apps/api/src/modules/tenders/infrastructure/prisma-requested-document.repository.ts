import { Injectable } from "@nestjs/common";
import type { TenderRequestedDocument as RequestedDocumentRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { RequestedDocumentRepository } from "../application/ports/requested-document.repository";
import { RequestedDocument, type RequestedDocumentStatus } from "../domain/requested-document.entity";

function toDomain(record: RequestedDocumentRecord): RequestedDocument {
  return RequestedDocument.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    name: record.name,
    category: record.category ?? undefined,
    documentType: record.documentType ?? undefined,
    required: record.required,
    description: record.description ?? undefined,
    expirationDate: record.expirationDate ?? undefined,
    status: record.status as RequestedDocumentStatus,
    documentId: record.documentId ?? undefined,
    displayOrder: record.displayOrder,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function toPersistence(document: RequestedDocument) {
  return {
    id: document.id,
    organizationId: document.organizationId,
    tenderId: document.tenderId,
    name: document.name,
    category: document.category ?? null,
    documentType: document.documentType ?? null,
    required: document.required,
    description: document.description ?? null,
    expirationDate: document.expirationDate ?? null,
    status: document.status,
    documentId: document.documentId ?? null,
    displayOrder: document.displayOrder,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

@Injectable()
export class PrismaRequestedDocumentRepository implements RequestedDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: {
    organizationId: string;
    tenderId: string;
    documentId: string;
  }): Promise<RequestedDocument | null> {
    const record = await this.prisma.tenderRequestedDocument.findFirst({
      where: { id: input.documentId, tenderId: input.tenderId, organizationId: input.organizationId },
    });
    return record ? toDomain(record) : null;
  }

  async listByTender(input: { organizationId: string; tenderId: string }): Promise<RequestedDocument[]> {
    const records = await this.prisma.tenderRequestedDocument.findMany({
      where: { tenderId: input.tenderId, organizationId: input.organizationId },
      orderBy: { displayOrder: "asc" },
    });
    return records.map(toDomain);
  }

  async save(document: RequestedDocument): Promise<void> {
    const data = toPersistence(document);
    await this.prisma.tenderRequestedDocument.upsert({ where: { id: data.id }, create: data, update: data });
  }

  async delete(input: { organizationId: string; tenderId: string; documentId: string }): Promise<void> {
    await this.prisma.tenderRequestedDocument.deleteMany({
      where: { id: input.documentId, tenderId: input.tenderId, organizationId: input.organizationId },
    });
  }
}
