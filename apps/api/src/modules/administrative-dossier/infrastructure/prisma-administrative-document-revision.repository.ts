import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { AdministrativeDocumentRevisionRepository } from "../application/ports/administrative-document-revision.repository";
import type { AdministrativeDocumentRevision } from "../domain/administrative-document-revision.entity";
import { toAdministrativeDocumentRevisionRow, toDomainAdministrativeDocumentRevision } from "./administrative-document-revision.persistence-mapper";

@Injectable()
export class PrismaAdministrativeDocumentRevisionRepository implements AdministrativeDocumentRevisionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(revision: AdministrativeDocumentRevision): Promise<void> {
    await this.prisma.administrativeDocumentRevision.create({ data: toAdministrativeDocumentRevisionRow(revision) });
  }

  async findById(input: { organizationId: string; revisionId: string }): Promise<AdministrativeDocumentRevision | null> {
    const record = await this.prisma.administrativeDocumentRevision.findFirst({ where: { id: input.revisionId, organizationId: input.organizationId } });
    return record ? toDomainAdministrativeDocumentRevision(record) : null;
  }

  async listByDocument(input: { organizationId: string; administrativeDocumentId: string }): Promise<readonly AdministrativeDocumentRevision[]> {
    const records = await this.prisma.administrativeDocumentRevision.findMany({
      where: { organizationId: input.organizationId, administrativeDocumentId: input.administrativeDocumentId },
      orderBy: { revisionNumber: "asc" },
    });
    return records.map(toDomainAdministrativeDocumentRevision);
  }

  async save(revision: AdministrativeDocumentRevision): Promise<void> {
    await this.prisma.administrativeDocumentRevision.update({ where: { id: revision.id }, data: toAdministrativeDocumentRevisionRow(revision) });
  }
}
