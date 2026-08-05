import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { OfficialAdministrativeTemplateRepository } from "../application/ports/official-administrative-template.repository";
import type { OfficialAdministrativeTemplate } from "../domain/official-administrative-template.aggregate";
import { toDomainOfficialAdministrativeTemplate, toOfficialAdministrativeTemplateRow } from "./official-administrative-template.persistence-mapper";

@Injectable()
export class PrismaOfficialAdministrativeTemplateRepository implements OfficialAdministrativeTemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(template: OfficialAdministrativeTemplate): Promise<void> {
    await this.prisma.officialAdministrativeTemplate.create({ data: toOfficialAdministrativeTemplateRow(template) });
  }

  async findById(input: { id: string }): Promise<OfficialAdministrativeTemplate | null> {
    const record = await this.prisma.officialAdministrativeTemplate.findUnique({ where: { id: input.id } });
    return record ? toDomainOfficialAdministrativeTemplate(record) : null;
  }

  async findActiveForOrganization(input: { organizationId: string; documentType: string }): Promise<OfficialAdministrativeTemplate | null> {
    const record = await this.prisma.officialAdministrativeTemplate.findFirst({ where: { organizationId: input.organizationId, documentType: input.documentType, active: true } });
    return record ? toDomainOfficialAdministrativeTemplate(record) : null;
  }

  async findActiveSystemWide(input: { documentType: string }): Promise<OfficialAdministrativeTemplate | null> {
    const record = await this.prisma.officialAdministrativeTemplate.findFirst({ where: { organizationId: null, documentType: input.documentType, active: true } });
    return record ? toDomainOfficialAdministrativeTemplate(record) : null;
  }

  async save(template: OfficialAdministrativeTemplate): Promise<void> {
    await this.prisma.officialAdministrativeTemplate.update({ where: { id: template.id }, data: toOfficialAdministrativeTemplateRow(template) });
  }
}
