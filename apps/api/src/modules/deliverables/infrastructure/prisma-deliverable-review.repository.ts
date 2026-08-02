import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { DeliverableReviewRepository } from "../application/ports/deliverable-review.repository";
import type { DeliverableReview } from "../domain/deliverable-review.entity";
import { toDomainReview, toReviewRow } from "./deliverable-review.persistence-mapper";

@Injectable()
export class PrismaDeliverableReviewRepository implements DeliverableReviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(review: DeliverableReview): Promise<void> {
    await this.prisma.deliverableReview.create({ data: toReviewRow(review) });
  }

  async listByRevision(input: { organizationId: string; deliverableRevisionId: string }): Promise<readonly DeliverableReview[]> {
    const records = await this.prisma.deliverableReview.findMany({
      where: { organizationId: input.organizationId, deliverableRevisionId: input.deliverableRevisionId },
      orderBy: { decidedAt: "desc" },
    });
    return records.map(toDomainReview);
  }
}
