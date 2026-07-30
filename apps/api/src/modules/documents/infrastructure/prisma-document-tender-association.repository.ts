import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { DocumentTenderAssociationRepository } from "../application/ports/document-tender-association.repository";
import type { DocumentTenderAssociation } from "../domain/document-tender-association.entity";

@Injectable()
export class PrismaDocumentTenderAssociationRepository implements DocumentTenderAssociationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async exists(input: { organizationId: string; documentId: string; tenderId: string }): Promise<boolean> {
    const record = await this.prisma.documentTenderAssociation.findFirst({
      where: { documentId: input.documentId, tenderId: input.tenderId, organizationId: input.organizationId },
      select: { documentId: true },
    });
    return !!record;
  }

  async create(association: DocumentTenderAssociation): Promise<void> {
    await this.prisma.documentTenderAssociation.create({
      data: {
        documentId: association.documentId,
        tenderId: association.tenderId,
        organizationId: association.organizationId,
        createdByUserId: association.createdByUserId,
        createdAt: association.createdAt,
      },
    });
  }

  async delete(input: { organizationId: string; documentId: string; tenderId: string }): Promise<void> {
    await this.prisma.documentTenderAssociation.deleteMany({
      where: { documentId: input.documentId, tenderId: input.tenderId, organizationId: input.organizationId },
    });
  }

  async listTenderIdsByDocument(input: { organizationId: string; documentId: string }): Promise<readonly string[]> {
    const records = await this.prisma.documentTenderAssociation.findMany({
      where: { documentId: input.documentId, organizationId: input.organizationId },
      select: { tenderId: true },
    });
    return records.map((record) => record.tenderId);
  }
}
