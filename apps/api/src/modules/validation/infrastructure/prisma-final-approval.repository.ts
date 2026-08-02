import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { FinalApproval, FinalApprovalStatus } from "../domain/final-approval.aggregate";
import type { FinalApprovalRepository } from "../application/ports/final-approval.repository";
import { toDomainApproval } from "./validation.persistence-mapper";

@Injectable()
export class PrismaFinalApprovalRepository implements FinalApprovalRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(approval: FinalApproval): Promise<void> {
    await this.prisma.finalApproval.create({ data: toRow(approval) });
  }

  async findById(input: { organizationId: string; approvalId: string }): Promise<FinalApproval | null> {
    const record = await this.prisma.finalApproval.findFirst({ where: { id: input.approvalId, organizationId: input.organizationId } });
    return record ? toDomainApproval(record) : null;
  }

  async findActiveForTender(input: { organizationId: string; tenderId: string }): Promise<FinalApproval | null> {
    const record = await this.prisma.finalApproval.findFirst({
      where: { organizationId: input.organizationId, tenderId: input.tenderId, status: FinalApprovalStatus.Active },
      orderBy: { approvedAt: "desc" },
    });
    return record ? toDomainApproval(record) : null;
  }

  async save(approval: FinalApproval): Promise<void> {
    await this.prisma.finalApproval.update({ where: { id: approval.id }, data: toRow(approval) });
  }
}

function toRow(approval: FinalApproval) {
  return {
    id: approval.id,
    organizationId: approval.organizationId,
    clientAccountId: approval.clientAccountId,
    tenderId: approval.tenderId,
    exportJobId: approval.exportJobId,
    validationRunId: approval.validationRunId,
    manifestHash: approval.manifestHash,
    approvedBy: approval.approvedBy,
    approverRole: approval.approverRole,
    approvedAt: approval.approvedAt,
    comment: approval.comment ?? null,
    previousStatus: approval.previousStatus ?? null,
    nextStatus: approval.nextStatus ?? null,
    status: approval.status,
    invalidatedAt: approval.invalidatedAt ?? null,
    invalidatedReason: approval.invalidatedReason ?? null,
  };
}
