import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { KnowledgeTag } from "../domain/knowledge-tag.entity";
import type { KnowledgeTagRepository } from "../application/ports/knowledge-tag.repository";
import { attachTagToEntryTx, resolveOrCreateTagTx, toKnowledgeTagDomain as toDomain } from "./knowledge-tag.tx-helpers";

@Injectable()
export class PrismaKnowledgeTagRepository implements KnowledgeTagRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; tagId: string }): Promise<KnowledgeTag | null> {
    const record = await this.prisma.knowledgeTag.findFirst({ where: { id: input.tagId, organizationId: input.organizationId } });
    return record ? toDomain(record) : null;
  }

  async findByLabel(input: { organizationId: string; label: string }): Promise<KnowledgeTag | null> {
    const record = await this.prisma.knowledgeTag.findFirst({ where: { organizationId: input.organizationId, label: input.label } });
    return record ? toDomain(record) : null;
  }

  /** Délègue à `resolveOrCreateTagTx` (voir `knowledge-tag.tx-helpers.ts`) — même logique que le
   *  chemin atomique utilisé par `createWithVersionAndTags`/`createForEntry`, jamais deux
   *  implémentations divergentes. */
  async findOrCreate(input: { organizationId: string; label: string; displayLabel: string; occurredAt: Date }): Promise<KnowledgeTag> {
    return resolveOrCreateTagTx(this.prisma, input);
  }

  async listByOrganization(input: { organizationId: string }): Promise<readonly KnowledgeTag[]> {
    const records = await this.prisma.knowledgeTag.findMany({ where: { organizationId: input.organizationId }, orderBy: { displayLabel: "asc" } });
    return records.map(toDomain);
  }

  async listByEntryId(input: { organizationId: string; knowledgeEntryId: string }): Promise<readonly KnowledgeTag[]> {
    const records = await this.prisma.knowledgeTag.findMany({
      where: { organizationId: input.organizationId, entryTags: { some: { knowledgeEntryId: input.knowledgeEntryId, organizationId: input.organizationId } } },
      orderBy: { displayLabel: "asc" },
    });
    return records.map(toDomain);
  }

  async attachToEntry(input: { organizationId: string; knowledgeEntryId: string; tagId: string; occurredAt: Date }): Promise<void> {
    await attachTagToEntryTx(this.prisma, input);
  }

  async detachFromEntry(input: { organizationId: string; knowledgeEntryId: string; tagId: string }): Promise<void> {
    await this.prisma.knowledgeEntryTag.deleteMany({ where: { organizationId: input.organizationId, knowledgeEntryId: input.knowledgeEntryId, tagId: input.tagId } });
  }

  async delete(input: { organizationId: string; tagId: string }): Promise<void> {
    // Cascade DB (onDelete: Cascade sur KnowledgeEntryTag) — retire aussi toutes les associations,
    // jamais les entrées elles-mêmes (mission §4 "suppression sans casser les entrées").
    await this.prisma.knowledgeTag.delete({ where: { id: input.tagId, organizationId: input.organizationId } });
  }
}
