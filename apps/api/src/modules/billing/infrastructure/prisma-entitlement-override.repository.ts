import { Injectable } from "@nestjs/common";
import type { EntitlementOverride as PrismaEntitlementOverride } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { EntitlementFeature } from "../domain/entitlement-feature";
import { EntitlementOverride } from "../domain/entitlement-override.aggregate";
import { UNLIMITED, type QuotaType } from "../domain/quota-type";
import type { EntitlementOverridePage, EntitlementOverrideRepository } from "../application/ports/entitlement-override.repository";

function toDomain(row: PrismaEntitlementOverride): EntitlementOverride {
  return EntitlementOverride.reconstitute({
    id: row.id,
    organizationId: row.organizationId,
    feature: (row.feature as EntitlementFeature | null) ?? undefined,
    featureEnabled: row.featureEnabled ?? undefined,
    quota: (row.quota as QuotaType | null) ?? undefined,
    quotaLimit: row.quota === null ? undefined : row.quotaUnlimited ? UNLIMITED : (row.quotaLimitValue ?? undefined),
    reason: row.reason,
    createdByPlatformAdministratorId: row.createdByPlatformAdministratorId,
    expiresAt: row.expiresAt ?? undefined,
    revokedAt: row.revokedAt ?? undefined,
    revokedByPlatformAdministratorId: row.revokedByPlatformAdministratorId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

@Injectable()
export class PrismaEntitlementOverrideRepository implements EntitlementOverrideRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(organizationId: string, id: string): Promise<EntitlementOverride | null> {
    const row = await this.prisma.currentClient().entitlementOverride.findFirst({ where: { id, organizationId } });
    return row ? toDomain(row) : null;
  }

  async findActiveFeatureOverride(organizationId: string, feature: EntitlementFeature, now: Date): Promise<EntitlementOverride | null> {
    const row = await this.prisma.currentClient().entitlementOverride.findFirst({
      where: { organizationId, feature, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: { createdAt: "desc" },
    });
    return row ? toDomain(row) : null;
  }

  async findActiveQuotaOverride(organizationId: string, quota: QuotaType, now: Date): Promise<EntitlementOverride | null> {
    const row = await this.prisma.currentClient().entitlementOverride.findFirst({
      where: { organizationId, quota, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: { createdAt: "desc" },
    });
    return row ? toDomain(row) : null;
  }

  async list(organizationId: string, options: { cursor?: string | undefined; limit: number }): Promise<EntitlementOverridePage> {
    const rows = await this.prisma.currentClient().entitlementOverride.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: options.limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });

    const hasNextPage = rows.length > options.limit;
    const page = hasNextPage ? rows.slice(0, options.limit) : rows;

    return { items: page.map(toDomain), nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null };
  }

  async save(override: EntitlementOverride): Promise<void> {
    const props = override.toProps();
    const data = {
      organizationId: props.organizationId,
      feature: props.feature ?? null,
      featureEnabled: props.featureEnabled ?? null,
      quota: props.quota ?? null,
      quotaLimitValue: props.quotaLimit !== undefined && props.quotaLimit !== UNLIMITED ? props.quotaLimit : null,
      quotaUnlimited: props.quota !== undefined ? props.quotaLimit === UNLIMITED : null,
      reason: props.reason,
      createdByPlatformAdministratorId: props.createdByPlatformAdministratorId,
      expiresAt: props.expiresAt ?? null,
      revokedAt: props.revokedAt ?? null,
      revokedByPlatformAdministratorId: props.revokedByPlatformAdministratorId ?? null,
    };

    await this.prisma.currentClient().entitlementOverride.upsert({
      where: { id: props.id },
      create: { id: props.id, ...data },
      update: data,
    });
  }
}
