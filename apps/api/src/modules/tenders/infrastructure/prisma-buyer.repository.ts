import { Injectable } from "@nestjs/common";
import type { Buyer as BuyerRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { BuyerRepository } from "../application/ports/buyer.repository";
import { Buyer } from "../domain/buyer.entity";

function toDomain(record: BuyerRecord): Buyer {
  return Buyer.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    name: record.name,
    legalName: record.legalName ?? undefined,
    identifier: record.identifier ?? undefined,
    siret: record.siret ?? undefined,
    addressLine: record.addressLine ?? undefined,
    postalCode: record.postalCode ?? undefined,
    city: record.city ?? undefined,
    country: record.country ?? undefined,
    buyerType: record.buyerType ?? undefined,
    contactName: record.contactName ?? undefined,
    contactEmail: record.contactEmail ?? undefined,
    contactPhone: record.contactPhone ?? undefined,
    profileUrl: record.profileUrl ?? undefined,
    notes: record.notes ?? undefined,
    createdBy: record.createdBy,
    updatedBy: record.updatedBy ?? undefined,
    archivedAt: record.archivedAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function toPersistence(buyer: Buyer) {
  return {
    id: buyer.id,
    organizationId: buyer.organizationId,
    name: buyer.name,
    legalName: buyer.legalName ?? null,
    identifier: buyer.identifier ?? null,
    siret: buyer.siret ?? null,
    addressLine: buyer.addressLine ?? null,
    postalCode: buyer.postalCode ?? null,
    city: buyer.city ?? null,
    country: buyer.country ?? null,
    buyerType: buyer.buyerType ?? null,
    contactName: buyer.contactName ?? null,
    contactEmail: buyer.contactEmail ?? null,
    contactPhone: buyer.contactPhone ?? null,
    profileUrl: buyer.profileUrl ?? null,
    notes: buyer.notes ?? null,
    createdBy: buyer.createdBy,
    updatedBy: buyer.updatedBy ?? null,
    archivedAt: buyer.archivedAt ?? null,
    createdAt: buyer.createdAt,
    updatedAt: buyer.updatedAt,
  };
}

@Injectable()
export class PrismaBuyerRepository implements BuyerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; buyerId: string }): Promise<Buyer | null> {
    const record = await this.prisma.currentClient().buyer.findFirst({ where: { id: input.buyerId, organizationId: input.organizationId } });
    return record ? toDomain(record) : null;
  }

  async list(input: { organizationId: string; search?: string | undefined; includeArchived?: boolean | undefined }): Promise<Buyer[]> {
    const records = await this.prisma.currentClient().buyer.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.includeArchived ? {} : { archivedAt: null }),
        ...(input.search ? { name: { contains: input.search, mode: "insensitive" } } : {}),
      },
      orderBy: { name: "asc" },
    });
    return records.map(toDomain);
  }

  async save(buyer: Buyer): Promise<void> {
    const data = toPersistence(buyer);
    await this.prisma.currentClient().buyer.upsert({ where: { id: data.id }, create: data, update: data });
  }
}
