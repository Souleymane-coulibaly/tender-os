import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { DocumentClientAccountAssociationRecord } from "../application/dtos";
import type { ClientScope, DocumentClientAccountAssociationRepository, EntityScope } from "../application/ports/company-satellite.repository";

@Injectable()
export class PrismaDocumentClientAccountAssociationRepository implements DocumentClientAccountAssociationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: Omit<DocumentClientAccountAssociationRecord, "createdAt">): Promise<DocumentClientAccountAssociationRecord> {
    return this.prisma.documentClientAccountAssociation.create({ data: input });
  }

  async list(scope: ClientScope): Promise<DocumentClientAccountAssociationRecord[]> {
    return this.prisma.documentClientAccountAssociation.findMany({
      where: { organizationId: scope.organizationId, clientAccountId: scope.clientAccountId },
      orderBy: { createdAt: "asc" },
    });
  }

  async findById(scope: EntityScope): Promise<DocumentClientAccountAssociationRecord | null> {
    return this.prisma.documentClientAccountAssociation.findFirst({ where: { id: scope.id, organizationId: scope.organizationId, clientAccountId: scope.clientAccountId } });
  }
}
