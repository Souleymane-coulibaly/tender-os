import { Injectable } from "@nestjs/common";
import { Prisma, type Dce as DceRecord } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { DceRepository } from "../application/ports/dce.repository";
import { DceId } from "../domain/dce-id.value-object";
import { DceAlreadyExistsError } from "../domain/errors";
import { parseDceStatus } from "../domain/dce-status";
import { Dce } from "../domain/dce.aggregate";

function toDomain(record: DceRecord): Dce {
  return Dce.rehydrate({
    id: DceId.from(record.id),
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    status: parseDceStatus(record.status),
    revision: record.revision,
    createdByUserId: record.createdByUserId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class PrismaDceRepository implements DceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; dceId: string }): Promise<Dce | null> {
    const record = await this.prisma.dce.findFirst({
      where: { id: input.dceId, organizationId: input.organizationId },
    });
    return record ? toDomain(record) : null;
  }

  async findByTenderId(input: { organizationId: string; tenderId: string }): Promise<Dce | null> {
    const record = await this.prisma.dce.findFirst({
      where: { tenderId: input.tenderId, organizationId: input.organizationId },
    });
    return record ? toDomain(record) : null;
  }

  async create(dce: Dce): Promise<Dce> {
    try {
      await this.prisma.dce.create({
        data: {
          id: dce.id.value,
          organizationId: dce.organizationId,
          tenderId: dce.tenderId,
          status: dce.status,
          revision: dce.revision,
          createdByUserId: dce.createdByUserId,
          createdAt: dce.createdAt,
          updatedAt: dce.updatedAt,
        },
      });
      return dce;
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new DceAlreadyExistsError();
      }
      throw error;
    }
  }

  async save(dce: Dce): Promise<void> {
    await this.prisma.dce.update({
      where: { id: dce.id.value },
      data: { status: dce.status, updatedAt: dce.updatedAt },
    });
  }

  async incrementRevision(input: { organizationId: string; dceId: string }): Promise<void> {
    // Atomique côté base (`SET revision = revision + 1`, jamais un read-then-write applicatif) —
    // le verrou de ligne Postgres implicite d'un UPDATE garantit qu'aucune incrémentation
    // concurrente n'est jamais perdue (mission FIX-A §11).
    await this.prisma.dce.update({
      where: { id_organizationId: { id: input.dceId, organizationId: input.organizationId } },
      data: { revision: { increment: 1 } },
    });
  }
}
