import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { KnowledgeSpace, type KnowledgeSpaceStatus } from "../domain/knowledge-space.aggregate";
import type { KnowledgeSpaceRepository } from "../application/ports/knowledge-space.repository";

function toDomain(record: { id: string; organizationId: string; name: string; description: string | null; status: string; createdAt: Date; updatedAt: Date }): KnowledgeSpace {
  return KnowledgeSpace.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    name: record.name,
    description: record.description ?? undefined,
    status: record.status as KnowledgeSpaceStatus,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

@Injectable()
export class PrismaKnowledgeSpaceRepository implements KnowledgeSpaceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; knowledgeSpaceId: string }): Promise<KnowledgeSpace | null> {
    const record = await this.prisma.knowledgeSpace.findFirst({ where: { id: input.knowledgeSpaceId, organizationId: input.organizationId } });
    return record ? toDomain(record) : null;
  }

  async findByOrganizationAndName(input: { organizationId: string; name: string }): Promise<KnowledgeSpace | null> {
    const record = await this.prisma.knowledgeSpace.findFirst({ where: { organizationId: input.organizationId, name: input.name } });
    return record ? toDomain(record) : null;
  }

  async create(space: KnowledgeSpace): Promise<void> {
    await this.prisma.knowledgeSpace.create({
      data: {
        id: space.id,
        organizationId: space.organizationId,
        name: space.name,
        description: space.description ?? null,
        status: space.status,
        createdAt: space.createdAt,
        updatedAt: space.updatedAt,
      },
    });
  }
}
