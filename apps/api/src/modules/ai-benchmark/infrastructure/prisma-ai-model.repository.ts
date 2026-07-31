import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { AiModelRepository, ListAiModelsFilter } from "../application/ports/ai-model.repository";
import { DuplicateAiModelError } from "../domain/errors";
import type { AiModel } from "../domain/ai-model.aggregate";
import { toDomain, toPersistence } from "./ai-model.persistence-mapper";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class PrismaAiModelRepository implements AiModelRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { id: string }): Promise<AiModel | null> {
    const record = await this.prisma.aiModel.findUnique({ where: { id: input.id } });
    return record ? toDomain(record) : null;
  }

  async findByProviderAndModelKey(input: { provider: string; modelKey: string }): Promise<AiModel | null> {
    const record = await this.prisma.aiModel.findUnique({
      where: { provider_modelKey: { provider: input.provider, modelKey: input.modelKey } },
    });
    return record ? toDomain(record) : null;
  }

  async list(filter?: ListAiModelsFilter): Promise<readonly AiModel[]> {
    const where: Prisma.AiModelWhereInput = {};
    if (filter?.enabledForBenchmark !== undefined) where.enabledForBenchmark = filter.enabledForBenchmark;
    if (filter?.enabledForProduction !== undefined) where.enabledForProduction = filter.enabledForProduction;

    const records = await this.prisma.aiModel.findMany({ where, orderBy: [{ provider: "asc" }, { modelKey: "asc" }] });
    return records.map(toDomain);
  }

  async create(model: AiModel): Promise<void> {
    try {
      await this.prisma.aiModel.create({ data: toPersistence(model) });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new DuplicateAiModelError();
      }
      throw error;
    }
  }

  async save(model: AiModel): Promise<void> {
    await this.prisma.aiModel.update({ where: { id: model.id }, data: toPersistence(model) });
  }
}
