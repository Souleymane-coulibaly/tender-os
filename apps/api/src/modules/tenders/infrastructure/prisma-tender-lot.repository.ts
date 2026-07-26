import { Injectable } from "@nestjs/common";
import type { TenderLot as TenderLotRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { TenderLotRepository } from "../application/ports/tender-lot.repository";
import { TenderLot } from "../domain/tender-lot.entity";

function toDomain(record: TenderLotRecord): TenderLot {
  return TenderLot.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    lotNumber: record.lotNumber,
    title: record.title,
    description: record.description ?? undefined,
    estimatedAmount: record.estimatedAmount?.toString(),
    currency: record.currency ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function toPersistence(lot: TenderLot) {
  return {
    id: lot.id,
    organizationId: lot.organizationId,
    tenderId: lot.tenderId,
    lotNumber: lot.lotNumber,
    title: lot.title,
    description: lot.description ?? null,
    estimatedAmount: lot.estimatedAmount ?? null,
    currency: lot.currency ?? null,
    createdAt: lot.createdAt,
    updatedAt: lot.updatedAt,
  };
}

@Injectable()
export class PrismaTenderLotRepository implements TenderLotRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; tenderId: string; lotId: string }): Promise<TenderLot | null> {
    const record = await this.prisma.tenderLot.findFirst({
      where: { id: input.lotId, tenderId: input.tenderId, organizationId: input.organizationId },
    });
    return record ? toDomain(record) : null;
  }

  async listByTender(input: { organizationId: string; tenderId: string }): Promise<TenderLot[]> {
    const records = await this.prisma.tenderLot.findMany({
      where: { tenderId: input.tenderId, organizationId: input.organizationId },
      orderBy: { lotNumber: "asc" },
    });
    return records.map(toDomain);
  }

  async save(lot: TenderLot): Promise<void> {
    const data = toPersistence(lot);
    await this.prisma.tenderLot.upsert({ where: { id: data.id }, create: data, update: data });
  }

  async delete(input: { organizationId: string; tenderId: string; lotId: string }): Promise<void> {
    await this.prisma.tenderLot.deleteMany({
      where: { id: input.lotId, tenderId: input.tenderId, organizationId: input.organizationId },
    });
  }
}
