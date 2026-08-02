import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { DeliverableCommentRepository } from "../application/ports/deliverable-comment.repository";
import type { DeliverableComment } from "../domain/deliverable-comment.entity";
import { toCommentRow, toDomainComment } from "./deliverable-comment.persistence-mapper";

@Injectable()
export class PrismaDeliverableCommentRepository implements DeliverableCommentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(comment: DeliverableComment): Promise<void> {
    await this.prisma.deliverableComment.create({ data: toCommentRow(comment) });
  }

  async findById(input: { organizationId: string; commentId: string }): Promise<DeliverableComment | null> {
    const record = await this.prisma.deliverableComment.findFirst({ where: { id: input.commentId, organizationId: input.organizationId } });
    return record ? toDomainComment(record) : null;
  }

  async listByDeliverable(input: { organizationId: string; deliverableId: string }): Promise<readonly DeliverableComment[]> {
    const records = await this.prisma.deliverableComment.findMany({
      where: { organizationId: input.organizationId, deliverableId: input.deliverableId },
      orderBy: { createdAt: "desc" },
    });
    return records.map(toDomainComment);
  }

  async save(comment: DeliverableComment): Promise<void> {
    await this.prisma.deliverableComment.update({ where: { id: comment.id }, data: toCommentRow(comment) });
  }
}
