import type { PackageItem } from "../../domain/package-item.entity";

export interface PackageItemRepository {
  createMany(items: readonly PackageItem[]): Promise<void>;
  save(item: PackageItem): Promise<void>;
  findById(input: { organizationId: string; packageItemId: string }): Promise<PackageItem | null>;
  listByVersion(input: { organizationId: string; responsePackageVersionId: string }): Promise<readonly PackageItem[]>;
}

export const PACKAGE_ITEM_REPOSITORY = Symbol("PACKAGE_ITEM_REPOSITORY");
