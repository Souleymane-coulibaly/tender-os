import { Injectable } from "@nestjs/common";
import { Prisma, type TenderLot as TenderLotRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { TenderLotRepository } from "../application/ports/tender-lot.repository";
import { DuplicateTenderLotNumberError } from "../domain/errors";
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
    displayOrder: record.displayOrder,
    code: record.code ?? undefined,
    cpvMain: record.cpvMain ?? undefined,
    cpvSecondary: record.cpvSecondary,
    executionLocation: record.executionLocation ?? undefined,
    durationMonths: record.durationMonths ?? undefined,
    estimatedStartDate: record.estimatedStartDate ?? undefined,
    minimumAmount: record.minimumAmount?.toString(),
    maximumAmount: record.maximumAmount?.toString(),
    selectedForResponse: record.selectedForResponse,
    soloAllowed: record.soloAllowed,
    groupAllowed: record.groupAllowed,
    variantsAllowed: record.variantsAllowed ?? undefined,
    pseAllowed: record.pseAllowed ?? undefined,
    specificVisitRequired: record.specificVisitRequired ?? undefined,
    specificVisitDate: record.specificVisitDate ?? undefined,
    internalNotes: record.internalNotes ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt ?? undefined,
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
    displayOrder: lot.displayOrder,
    code: lot.code ?? null,
    cpvMain: lot.cpvMain ?? null,
    cpvSecondary: lot.cpvSecondary,
    executionLocation: lot.executionLocation ?? null,
    durationMonths: lot.durationMonths ?? null,
    estimatedStartDate: lot.estimatedStartDate ?? null,
    minimumAmount: lot.minimumAmount ?? null,
    maximumAmount: lot.maximumAmount ?? null,
    selectedForResponse: lot.selectedForResponse,
    soloAllowed: lot.soloAllowed,
    groupAllowed: lot.groupAllowed,
    variantsAllowed: lot.variantsAllowed ?? null,
    pseAllowed: lot.pseAllowed ?? null,
    specificVisitRequired: lot.specificVisitRequired ?? null,
    specificVisitDate: lot.specificVisitDate ?? null,
    internalNotes: lot.internalNotes ?? null,
    createdAt: lot.createdAt,
    updatedAt: lot.updatedAt,
    deletedAt: lot.deletedAt ?? null,
  };
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class PrismaTenderLotRepository implements TenderLotRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; tenderId: string; lotId: string }): Promise<TenderLot | null> {
    const record = await this.prisma.tenderLot.findFirst({
      where: { id: input.lotId, tenderId: input.tenderId, organizationId: input.organizationId, deletedAt: null },
    });
    return record ? toDomain(record) : null;
  }

  async findByIdIncludingDeleted(input: {
    organizationId: string;
    tenderId: string;
    lotId: string;
  }): Promise<TenderLot | null> {
    const record = await this.prisma.tenderLot.findFirst({
      where: { id: input.lotId, tenderId: input.tenderId, organizationId: input.organizationId },
    });
    return record ? toDomain(record) : null;
  }

  async listByTender(input: { organizationId: string; tenderId: string }): Promise<TenderLot[]> {
    const records = await this.prisma.tenderLot.findMany({
      where: { tenderId: input.tenderId, organizationId: input.organizationId, deletedAt: null },
      orderBy: { displayOrder: "asc" },
    });
    return records.map(toDomain);
  }

  async save(lot: TenderLot): Promise<void> {
    const data = toPersistence(lot);
    try {
      await this.prisma.tenderLot.upsert({ where: { id: data.id }, create: data, update: data });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new DuplicateTenderLotNumberError();
      }
      throw error;
    }
  }

  async createAppendedAtEnd(lot: TenderLot): Promise<TenderLot> {
    return this.prisma.$transaction(async (tx) => {
      // Verrou consultatif Postgres scopé au tenderId (AUDIT-002) : sérialise les créations
      // concurrentes du même Tender le temps de calculer puis d'écrire displayOrder, sans
      // affecter les autres Tenders. Auto-libéré à la fin de la transaction (variante "xact").
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lot.tenderId}))`;

      const aggregate = await tx.tenderLot.aggregate({
        where: { tenderId: lot.tenderId, organizationId: lot.organizationId, deletedAt: null },
        _max: { displayOrder: true },
      });
      lot.reorder((aggregate._max.displayOrder ?? -1) + 1, lot.updatedAt);

      const data = toPersistence(lot);
      try {
        await tx.tenderLot.create({ data });
      } catch (error) {
        if (isUniqueConstraintViolation(error)) {
          throw new DuplicateTenderLotNumberError();
        }
        throw error;
      }
      return lot;
    });
  }

  async restoreAppendedAtEnd(input: { lot: TenderLot; occurredAt: Date }): Promise<TenderLot> {
    const { lot, occurredAt } = input;
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lot.tenderId}))`;

      const aggregate = await tx.tenderLot.aggregate({
        where: { tenderId: lot.tenderId, organizationId: lot.organizationId, deletedAt: null },
        _max: { displayOrder: true },
      });
      // lot.restore() applique aussi l'invariant "doit être actuellement supprimé"
      // (TenderLotNotDeletedError) — vérifié à l'intérieur du verrou, avant toute écriture.
      lot.restore((aggregate._max.displayOrder ?? -1) + 1, occurredAt);

      const data = toPersistence(lot);
      await tx.tenderLot.update({ where: { id: data.id }, data });
      return lot;
    });
  }

  async saveReordered(lots: readonly TenderLot[]): Promise<void> {
    await this.prisma.$transaction(
      lots.map((lot) => {
        const data = toPersistence(lot);
        return this.prisma.tenderLot.update({
          where: { id: data.id },
          data: { displayOrder: data.displayOrder, updatedAt: data.updatedAt },
        });
      }),
    );
  }
}
