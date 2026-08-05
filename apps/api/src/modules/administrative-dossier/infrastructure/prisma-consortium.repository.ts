import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { ConsortiumRepository } from "../application/ports/consortium.repository";
import type { Consortium } from "../domain/consortium.aggregate";
import { DuplicateConsortiumError } from "../domain/errors";
import { toConsortiumRow, toDomainConsortium } from "./consortium.persistence-mapper";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class PrismaConsortiumRepository implements ConsortiumRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(consortium: Consortium): Promise<void> {
    try {
      await this.prisma.consortium.create({ data: toConsortiumRow(consortium) });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new DuplicateConsortiumError();
      }
      throw error;
    }
  }

  async findById(input: { organizationId: string; consortiumId: string }): Promise<Consortium | null> {
    const record = await this.prisma.consortium.findFirst({ where: { id: input.consortiumId, organizationId: input.organizationId } });
    return record ? toDomainConsortium(record) : null;
  }

  async findByTenderId(input: { organizationId: string; tenderId: string }): Promise<Consortium | null> {
    const record = await this.prisma.consortium.findFirst({ where: { organizationId: input.organizationId, tenderId: input.tenderId } });
    return record ? toDomainConsortium(record) : null;
  }

  async save(consortium: Consortium): Promise<void> {
    await this.prisma.consortium.update({ where: { id: consortium.id }, data: toConsortiumRow(consortium) });
  }
}
