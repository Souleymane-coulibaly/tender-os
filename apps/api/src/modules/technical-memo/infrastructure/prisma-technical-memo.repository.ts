import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { TechnicalMemoRepository } from "../application/ports/technical-memo.repository";
import type { TechnicalMemo } from "../domain/technical-memo.aggregate";
import { toDomainTechnicalMemo, toTechnicalMemoRow } from "./technical-memo.persistence-mapper";

@Injectable()
export class PrismaTechnicalMemoRepository implements TechnicalMemoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(memo: TechnicalMemo): Promise<void> {
    await this.prisma.currentClient().technicalMemo.create({ data: toTechnicalMemoRow(memo) });
  }

  async save(memo: TechnicalMemo): Promise<void> {
    await this.prisma.currentClient().technicalMemo.update({
      where: { id_organizationId: { id: memo.id, organizationId: memo.organizationId } },
      data: toTechnicalMemoRow(memo),
    });
  }

  async findById(input: { organizationId: string; technicalMemoId: string }): Promise<TechnicalMemo | null> {
    const record = await this.prisma.currentClient().technicalMemo.findFirst({ where: { id: input.technicalMemoId, organizationId: input.organizationId } });
    return record ? toDomainTechnicalMemo(record) : null;
  }

  async findByScope(input: { organizationId: string; tenderId: string; lotId: string | null }): Promise<TechnicalMemo | null> {
    const record = await this.prisma.currentClient().technicalMemo.findFirst({
      where: { organizationId: input.organizationId, tenderId: input.tenderId, lotId: input.lotId },
    });
    return record ? toDomainTechnicalMemo(record) : null;
  }

  async list(input: { organizationId: string; tenderId: string }): Promise<readonly TechnicalMemo[]> {
    const records = await this.prisma.currentClient().technicalMemo.findMany({
      where: { organizationId: input.organizationId, tenderId: input.tenderId },
      orderBy: { createdAt: "desc" },
    });
    return records.map(toDomainTechnicalMemo);
  }
}
