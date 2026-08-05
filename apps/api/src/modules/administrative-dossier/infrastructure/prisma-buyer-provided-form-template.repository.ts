import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { BuyerProvidedFormTemplateRepository } from "../application/ports/buyer-provided-form-template.repository";
import type { BuyerProvidedFormTemplate } from "../domain/buyer-provided-form-template.aggregate";
import { toBuyerProvidedFormTemplateRow, toDomainBuyerProvidedFormTemplate } from "./buyer-provided-form-template.persistence-mapper";

@Injectable()
export class PrismaBuyerProvidedFormTemplateRepository implements BuyerProvidedFormTemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(template: BuyerProvidedFormTemplate): Promise<void> {
    await this.prisma.buyerProvidedFormTemplate.create({ data: toBuyerProvidedFormTemplateRow(template) });
  }

  async find(input: { organizationId: string; tenderId: string; documentType: string }): Promise<BuyerProvidedFormTemplate | null> {
    const record = await this.prisma.buyerProvidedFormTemplate.findFirst({
      where: { organizationId: input.organizationId, tenderId: input.tenderId, documentType: input.documentType },
    });
    return record ? toDomainBuyerProvidedFormTemplate(record) : null;
  }

  async save(template: BuyerProvidedFormTemplate): Promise<void> {
    await this.prisma.buyerProvidedFormTemplate.update({ where: { id: template.id }, data: toBuyerProvidedFormTemplateRow(template) });
  }
}
