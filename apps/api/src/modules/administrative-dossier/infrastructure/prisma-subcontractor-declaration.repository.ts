import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { SubcontractorDeclarationRepository } from "../application/ports/subcontractor-declaration.repository";
import type { SubcontractorDeclaration } from "../domain/subcontractor-declaration.aggregate";
import { toDomainSubcontractorDeclaration, toSubcontractorDeclarationRow } from "./subcontractor-declaration.persistence-mapper";

@Injectable()
export class PrismaSubcontractorDeclarationRepository implements SubcontractorDeclarationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(declaration: SubcontractorDeclaration): Promise<void> {
    await this.prisma.subcontractorDeclaration.create({ data: toSubcontractorDeclarationRow(declaration) });
  }

  async findById(input: { organizationId: string; subcontractorDeclarationId: string }): Promise<SubcontractorDeclaration | null> {
    const record = await this.prisma.subcontractorDeclaration.findFirst({ where: { id: input.subcontractorDeclarationId, organizationId: input.organizationId } });
    return record ? toDomainSubcontractorDeclaration(record) : null;
  }

  async listByTenderId(input: { organizationId: string; tenderId: string }): Promise<readonly SubcontractorDeclaration[]> {
    const records = await this.prisma.subcontractorDeclaration.findMany({
      where: { organizationId: input.organizationId, tenderId: input.tenderId },
      orderBy: { createdAt: "asc" },
    });
    return records.map(toDomainSubcontractorDeclaration);
  }

  async save(declaration: SubcontractorDeclaration): Promise<void> {
    await this.prisma.subcontractorDeclaration.update({ where: { id: declaration.id }, data: toSubcontractorDeclarationRow(declaration) });
  }
}
