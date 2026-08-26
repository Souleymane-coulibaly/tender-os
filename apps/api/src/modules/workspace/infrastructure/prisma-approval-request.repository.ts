import { Injectable } from "@nestjs/common";
import type { ApprovalRequest as ApprovalRequestRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { ApprovalRequestRepository } from "../application/ports/approval-request.repository";
import { ApprovalRequest, type ApprovalEntityType, type ApprovalStatus } from "../domain/approval-request.entity";
import { ApprovalRequestNotFoundError } from "../domain/errors";

function toDomain(record: ApprovalRequestRecord): ApprovalRequest {
  return ApprovalRequest.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    entityType: record.entityType as ApprovalEntityType,
    entityId: record.entityId,
    requestedBy: record.requestedBy,
    reviewerId: record.reviewerId,
    status: record.status as ApprovalStatus,
    comment: record.comment ?? undefined,
    requestedAt: record.requestedAt,
    reviewedAt: record.reviewedAt ?? undefined,
  });
}

function toPersistence(approval: ApprovalRequest) {
  return {
    id: approval.id,
    organizationId: approval.organizationId,
    tenderId: approval.tenderId,
    entityType: approval.entityType,
    entityId: approval.entityId,
    requestedBy: approval.requestedBy,
    reviewerId: approval.reviewerId,
    status: approval.status,
    comment: approval.comment ?? null,
    requestedAt: approval.requestedAt,
    reviewedAt: approval.reviewedAt ?? null,
  };
}

@Injectable()
export class PrismaApprovalRequestRepository implements ApprovalRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; tenderId: string; approvalId: string }): Promise<ApprovalRequest | null> {
    const record = await this.prisma.currentClient().approvalRequest.findFirst({
      where: { id: input.approvalId, tenderId: input.tenderId, organizationId: input.organizationId },
    });
    return record ? toDomain(record) : null;
  }

  async listByTender(input: { organizationId: string; tenderId: string; status?: string | undefined }): Promise<ApprovalRequest[]> {
    const records = await this.prisma.currentClient().approvalRequest.findMany({
      where: { organizationId: input.organizationId, tenderId: input.tenderId, ...(input.status ? { status: input.status } : {}) },
      orderBy: { requestedAt: "desc" },
    });
    return records.map(toDomain);
  }

  async listByReviewer(input: {
    organizationId: string;
    reviewerId: string;
    restrictToClientAccountIds?: readonly string[] | undefined;
    status?: string | undefined;
  }): Promise<ApprovalRequest[]> {
    const records = await this.prisma.currentClient().approvalRequest.findMany({
      where: {
        organizationId: input.organizationId,
        reviewerId: input.reviewerId,
        ...(input.status ? { status: input.status } : {}),
        ...(input.restrictToClientAccountIds !== undefined ? { tender: { clientAccountId: { in: [...input.restrictToClientAccountIds] } } } : {}),
      },
      orderBy: { requestedAt: "desc" },
    });
    return records.map(toDomain);
  }

  async countByReviewer(input: {
    organizationId: string;
    reviewerId: string;
    restrictToClientAccountIds?: readonly string[] | undefined;
    status?: string | undefined;
  }): Promise<number> {
    // Checkpoint TENDEROS-2.1-P2.3-E12.1 — prédicats STRICTEMENT identiques à `listByReviewer`
    // ci-dessus : le compteur et la liste ne peuvent jamais diverger.
    return this.prisma.currentClient().approvalRequest.count({
      where: {
        organizationId: input.organizationId,
        reviewerId: input.reviewerId,
        ...(input.status ? { status: input.status } : {}),
        ...(input.restrictToClientAccountIds !== undefined ? { tender: { clientAccountId: { in: [...input.restrictToClientAccountIds] } } } : {}),
      },
    });
  }

  async save(approval: ApprovalRequest): Promise<void> {
    const data = toPersistence(approval);
    await this.prisma.currentClient().approvalRequest.upsert({ where: { id: data.id }, create: data, update: data });
  }

  async reviewLocked(input: { organizationId: string; tenderId: string; approvalId: string }, decide: (approval: ApprovalRequest) => void): Promise<ApprovalRequest> {
    return this.prisma.withTransaction(async (tx) => {
      // Verrou consultatif Postgres scopé à l'approbation (même motif que
      // PrismaTenderLotRepository.createAppendedAtEnd) : sérialise les revues concurrentes de LA
      // MÊME demande, sans affecter les autres. Auto-libéré à la fin de la transaction.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.approvalId}))`;

      const record = await tx.approvalRequest.findFirst({
        where: { id: input.approvalId, tenderId: input.tenderId, organizationId: input.organizationId },
      });
      if (!record) {
        throw new ApprovalRequestNotFoundError();
      }

      const approval = toDomain(record);
      decide(approval);

      const data = toPersistence(approval);
      await tx.approvalRequest.update({ where: { id: data.id }, data });
      return approval;
    });
  }
}
