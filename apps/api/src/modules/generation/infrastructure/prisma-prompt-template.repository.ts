import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { PromptTemplateRepository } from "../application/ports/prompt-template.repository";
import type { PromptTemplate } from "../domain/prompt-template.aggregate";
import type { GenerationTaskType } from "../domain/generation-task-type";
import { toDomain, toPersistence } from "./prompt-template.persistence-mapper";

@Injectable()
export class PrismaPromptTemplateRepository implements PromptTemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; templateId: string }): Promise<PromptTemplate | null> {
    const record = await this.prisma.promptTemplate.findFirst({
      where: { id: input.templateId, organizationId: input.organizationId },
    });
    return record ? toDomain(record) : null;
  }

  async findByTaskType(input: { organizationId: string; taskType: GenerationTaskType }): Promise<PromptTemplate | null> {
    const record = await this.prisma.promptTemplate.findFirst({
      where: { organizationId: input.organizationId, taskType: input.taskType },
    });
    return record ? toDomain(record) : null;
  }

  async list(input: { organizationId: string; includeArchived: boolean }): Promise<readonly PromptTemplate[]> {
    const records = await this.prisma.promptTemplate.findMany({
      where: { organizationId: input.organizationId, ...(input.includeArchived ? {} : { archivedAt: null }) },
      orderBy: { name: "asc" },
    });
    return records.map(toDomain);
  }

  async create(template: PromptTemplate): Promise<void> {
    await this.prisma.promptTemplate.create({ data: toPersistence(template) });
  }

  async save(template: PromptTemplate): Promise<void> {
    const data = toPersistence(template);
    await this.prisma.promptTemplate.update({ where: { id: data.id }, data });
  }
}
