import { Injectable } from "@nestjs/common";
import type { TenderParticipant as TenderParticipantRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { TenderParticipantRepository } from "../application/ports/tender-participant.repository";
import { TenderParticipant, type TenderCollaborativeRole } from "../domain/tender-participant.entity";

function toDomain(record: TenderParticipantRecord): TenderParticipant {
  return TenderParticipant.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    userId: record.userId,
    role: record.role as TenderCollaborativeRole,
    addedBy: record.addedBy,
    addedAt: record.addedAt,
    removedBy: record.removedBy ?? undefined,
    removedAt: record.removedAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function toPersistence(participant: TenderParticipant) {
  return {
    id: participant.id,
    organizationId: participant.organizationId,
    tenderId: participant.tenderId,
    userId: participant.userId,
    role: participant.role,
    addedBy: participant.addedBy,
    addedAt: participant.addedAt,
    removedBy: participant.removedBy ?? null,
    removedAt: participant.removedAt ?? null,
    updatedAt: participant.updatedAt,
  };
}

@Injectable()
export class PrismaTenderParticipantRepository implements TenderParticipantRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; tenderId: string; participantId: string }): Promise<TenderParticipant | null> {
    const record = await this.prisma.currentClient().tenderParticipant.findFirst({
      where: { id: input.participantId, tenderId: input.tenderId, organizationId: input.organizationId },
    });
    return record ? toDomain(record) : null;
  }

  async findActiveByUser(input: { organizationId: string; tenderId: string; userId: string }): Promise<TenderParticipant | null> {
    const record = await this.prisma.currentClient().tenderParticipant.findFirst({
      where: { organizationId: input.organizationId, tenderId: input.tenderId, userId: input.userId, removedAt: null },
    });
    return record ? toDomain(record) : null;
  }

  async listActiveByTender(input: { organizationId: string; tenderId: string }): Promise<TenderParticipant[]> {
    const records = await this.prisma.currentClient().tenderParticipant.findMany({
      where: { organizationId: input.organizationId, tenderId: input.tenderId, removedAt: null },
      orderBy: { addedAt: "asc" },
    });
    return records.map(toDomain);
  }

  async save(participant: TenderParticipant): Promise<void> {
    const data = toPersistence(participant);
    await this.prisma.currentClient().tenderParticipant.upsert({ where: { id: data.id }, create: data, update: data });
  }
}
