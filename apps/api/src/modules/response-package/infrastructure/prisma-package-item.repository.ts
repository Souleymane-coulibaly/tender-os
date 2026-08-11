import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { PackageItemRepository } from "../application/ports/package-item.repository";
import type { PackageItem } from "../domain/package-item.entity";
import { toDomainPackageItem, toPackageItemRow } from "./package-item.persistence-mapper";

@Injectable()
export class PrismaPackageItemRepository implements PackageItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createMany(items: readonly PackageItem[]): Promise<void> {
    if (items.length === 0) return;
    await this.prisma.currentClient().packageItem.createMany({ data: items.map(toPackageItemRow) });
  }

  async save(item: PackageItem): Promise<void> {
    await this.prisma.currentClient().packageItem.update({
      where: { id_organizationId: { id: item.id, organizationId: item.organizationId } },
      data: toPackageItemRow(item),
    });
  }

  async findById(input: { organizationId: string; packageItemId: string }): Promise<PackageItem | null> {
    const record = await this.prisma.currentClient().packageItem.findFirst({ where: { id: input.packageItemId, organizationId: input.organizationId } });
    return record ? toDomainPackageItem(record) : null;
  }

  async listByVersion(input: { organizationId: string; responsePackageVersionId: string }): Promise<readonly PackageItem[]> {
    const records = await this.prisma.currentClient().packageItem.findMany({
      where: { organizationId: input.organizationId, responsePackageVersionId: input.responsePackageVersionId },
      orderBy: [{ category: "asc" }, { label: "asc" }],
    });
    return records.map(toDomainPackageItem);
  }
}
