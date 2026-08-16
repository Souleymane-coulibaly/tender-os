import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { AdministrativeDocumentRepository } from "../application/ports/administrative-document.repository";
import type { AdministrativeDocument } from "../domain/administrative-document.aggregate";
import { toAdministrativeDocumentRow, toDomainAdministrativeDocument } from "./administrative-document.persistence-mapper";

@Injectable()
export class PrismaAdministrativeDocumentRepository implements AdministrativeDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(document: AdministrativeDocument): Promise<void> {
    await this.prisma.administrativeDocument.create({ data: toAdministrativeDocumentRow(document) });
  }

  async findById(input: { organizationId: string; documentId: string }): Promise<AdministrativeDocument | null> {
    const record = await this.prisma.administrativeDocument.findFirst({ where: { id: input.documentId, organizationId: input.organizationId } });
    return record ? toDomainAdministrativeDocument(record) : null;
  }

  async listByDossier(input: { organizationId: string; administrativeDossierId: string }): Promise<readonly AdministrativeDocument[]> {
    const records = await this.prisma.administrativeDocument.findMany({
      where: { organizationId: input.organizationId, administrativeDossierId: input.administrativeDossierId },
      orderBy: { createdAt: "asc" },
    });
    return records.map(toDomainAdministrativeDocument);
  }

  async findByRequirementId(input: { organizationId: string; requirementId: string }): Promise<AdministrativeDocument | null> {
    const record = await this.prisma.administrativeDocument.findFirst({ where: { organizationId: input.organizationId, requirementId: input.requirementId } });
    return record ? toDomainAdministrativeDocument(record) : null;
  }

  async save(document: AdministrativeDocument): Promise<void> {
    await this.prisma.administrativeDocument.update({ where: { id: document.id }, data: toAdministrativeDocumentRow(document) });
  }

  async existsForOrganization(organizationId: string): Promise<boolean> {
    const record = await this.prisma.administrativeDocument.findFirst({ where: { organizationId }, select: { id: true } });
    return record !== null;
  }
}
