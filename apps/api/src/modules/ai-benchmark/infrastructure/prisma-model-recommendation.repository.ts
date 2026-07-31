import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { ModelRecommendationRepository } from "../application/ports/model-recommendation.repository";
import type { ModelRecommendation } from "../domain/model-recommendation.aggregate";
import { toDomain, toPersistence } from "./model-recommendation.persistence-mapper";

@Injectable()
export class PrismaModelRecommendationRepository implements ModelRecommendationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; recommendationId: string }): Promise<ModelRecommendation | null> {
    const record = await this.prisma.modelRecommendation.findFirst({
      where: { id: input.recommendationId, organizationId: input.organizationId },
    });
    return record ? toDomain(record) : null;
  }

  async list(input: { organizationId: string }): Promise<readonly ModelRecommendation[]> {
    const records = await this.prisma.modelRecommendation.findMany({
      where: { organizationId: input.organizationId },
      orderBy: { generatedAt: "desc" },
    });
    return records.map(toDomain);
  }

  async create(recommendation: ModelRecommendation): Promise<void> {
    await this.prisma.modelRecommendation.create({ data: toPersistence(recommendation) });
  }

  async save(recommendation: ModelRecommendation): Promise<void> {
    await this.prisma.modelRecommendation.update({ where: { id: recommendation.id }, data: toPersistence(recommendation) });
  }
}
