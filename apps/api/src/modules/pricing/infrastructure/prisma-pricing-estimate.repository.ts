import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type {
  ListPricingEstimatesQuery,
  ListPricingEstimatesResult,
  PricingEstimateRepository,
  PricingEstimateWithVersion,
} from "../application/ports/pricing-estimate.repository";
import { PricingEstimateConcurrentRecalculationError } from "../domain/errors";
import type { PricingEstimate } from "../domain/pricing-estimate.aggregate";
import type { PricingEstimateVersion } from "../domain/pricing-estimate-version.entity";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
import {
  toBreakdownLinesPersistence,
  toDomainEstimate,
  toDomainVersion,
  toEstimatePersistence,
  toVersionPersistence,
} from "./pricing-estimate.persistence-mapper";

const SHORT_TX_OPTIONS = { timeout: 10_000, maxWait: 10_000 } as const;

/** Mission Sprint 7 §"Atomicité" — courtes transactions pour la création/le recalcul, jamais un
 *  appel provider ni une agrégation lourde dans une transaction (aucun des deux n'a lieu ici). */
@Injectable()
export class PrismaPricingEstimateRepository implements PricingEstimateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; estimateId: string }): Promise<PricingEstimateWithVersion | null> {
    const record = await this.prisma.pricingEstimate.findFirst({
      where: { id: input.estimateId, organizationId: input.organizationId },
    });
    if (!record || !record.currentVersionId) return null;

    const versionRecord = await this.prisma.pricingEstimateVersion.findUnique({
      where: { id: record.currentVersionId },
      include: { breakdownLines: true },
    });
    if (!versionRecord) return null;

    return { estimate: toDomainEstimate(record), version: toDomainVersion(versionRecord) };
  }

  async findVersion(input: { organizationId: string; estimateId: string; version: number }): Promise<PricingEstimateVersion | null> {
    const record = await this.prisma.pricingEstimateVersion.findFirst({
      where: { estimateId: input.estimateId, organizationId: input.organizationId, version: input.version },
      include: { breakdownLines: true },
    });
    return record ? toDomainVersion(record) : null;
  }

  async listVersions(input: { organizationId: string; estimateId: string }): Promise<readonly PricingEstimateVersion[]> {
    const records = await this.prisma.pricingEstimateVersion.findMany({
      where: { estimateId: input.estimateId, organizationId: input.organizationId },
      include: { breakdownLines: true },
      orderBy: { version: "asc" },
    });
    return records.map(toDomainVersion);
  }

  async list(query: ListPricingEstimatesQuery): Promise<ListPricingEstimatesResult> {
    const where = {
      organizationId: query.organizationId,
      ...(query.tenderId ? { tenderId: query.tenderId } : {}),
      ...(query.clientAccountId ? { clientAccountId: query.clientAccountId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.includeArchived ? {} : { status: { not: "ARCHIVED" } }),
    };

    const [records, total] = await Promise.all([
      this.prisma.pricingEstimate.findMany({ where, orderBy: { createdAt: "desc" }, take: query.limit, skip: query.offset }),
      this.prisma.pricingEstimate.count({ where }),
    ]);

    const items: PricingEstimateWithVersion[] = [];
    for (const record of records) {
      if (!record.currentVersionId) continue;
      const versionRecord = await this.prisma.pricingEstimateVersion.findUnique({
        where: { id: record.currentVersionId },
        include: { breakdownLines: true },
      });
      if (!versionRecord) continue;
      items.push({ estimate: toDomainEstimate(record), version: toDomainVersion(versionRecord) });
    }

    return { items, total };
  }

  async createWithFirstVersion(input: { estimate: PricingEstimate; version: PricingEstimateVersion }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.pricingEstimate.create({ data: { ...toEstimatePersistence(input.estimate), currentVersionId: null } });
      await tx.pricingEstimateVersion.create({ data: toVersionPersistence(input.version) });
      if (input.version.breakdown.length > 0) {
        await tx.pricingBreakdownLine.createMany({ data: toBreakdownLinesPersistence(input.version) });
      }
      await tx.pricingEstimate.update({ where: { id: input.estimate.id }, data: { currentVersionId: input.version.id } });
    }, SHORT_TX_OPTIONS);
  }

  async addVersion(input: {
    estimate: PricingEstimate;
    previousVersion: PricingEstimateVersion;
    newVersion: PricingEstimateVersion;
  }): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.pricingEstimateVersion.update({
          where: { id: input.previousVersion.id },
          data: { status: input.previousVersion.status, supersededAt: input.previousVersion.supersededAt ?? null },
        });
        await tx.pricingEstimateVersion.create({ data: toVersionPersistence(input.newVersion) });
        if (input.newVersion.breakdown.length > 0) {
          await tx.pricingBreakdownLine.createMany({ data: toBreakdownLinesPersistence(input.newVersion) });
        }
        await tx.pricingEstimate.update({
          where: { id: input.estimate.id },
          data: {
            currentVersionId: input.newVersion.id,
            currentVersionNumber: input.newVersion.version,
            status: input.estimate.status,
          },
        });
      }, SHORT_TX_OPTIONS);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new PricingEstimateConcurrentRecalculationError();
      }
      throw error;
    }
  }

  async save(estimate: PricingEstimate): Promise<void> {
    await this.prisma.pricingEstimate.update({ where: { id: estimate.id }, data: toEstimatePersistence(estimate) });
  }
}
