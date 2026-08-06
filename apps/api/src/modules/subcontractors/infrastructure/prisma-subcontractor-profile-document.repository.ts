import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { SubcontractorProfileDocumentRecord } from "../application/dtos";
import type { SubcontractorProfileDocumentRepository } from "../application/ports/subcontractor.repository";

@Injectable()
export class PrismaSubcontractorProfileDocumentRepository implements SubcontractorProfileDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: Omit<SubcontractorProfileDocumentRecord, "createdAt">): Promise<SubcontractorProfileDocumentRecord> {
    return this.prisma.subcontractorProfileDocument.create({ data: input });
  }

  async list(input: { organizationId: string; subcontractorProfileId: string }): Promise<SubcontractorProfileDocumentRecord[]> {
    return this.prisma.subcontractorProfileDocument.findMany({
      where: { organizationId: input.organizationId, subcontractorProfileId: input.subcontractorProfileId },
      orderBy: { createdAt: "asc" },
    });
  }
}
