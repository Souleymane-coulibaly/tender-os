import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { Dc1DeclarationRepository } from "../application/ports/dc1-declaration.repository";
import type { Dc1Declaration } from "../domain/dc1-declaration.aggregate";
import { DuplicateDc1DeclarationError } from "../domain/errors";
import { toDc1DeclarationRow, toDomainDc1Declaration } from "./dc1-declaration.persistence-mapper";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class PrismaDc1DeclarationRepository implements Dc1DeclarationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(declaration: Dc1Declaration): Promise<void> {
    try {
      await this.prisma.dc1Declaration.create({ data: toDc1DeclarationRow(declaration) });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new DuplicateDc1DeclarationError();
      }
      throw error;
    }
  }

  async findById(input: { organizationId: string; dc1DeclarationId: string }): Promise<Dc1Declaration | null> {
    const record = await this.prisma.dc1Declaration.findFirst({ where: { id: input.dc1DeclarationId, organizationId: input.organizationId } });
    return record ? toDomainDc1Declaration(record) : null;
  }

  async findByTenderId(input: { organizationId: string; tenderId: string }): Promise<Dc1Declaration | null> {
    const record = await this.prisma.dc1Declaration.findFirst({ where: { organizationId: input.organizationId, tenderId: input.tenderId } });
    return record ? toDomainDc1Declaration(record) : null;
  }

  async save(declaration: Dc1Declaration): Promise<void> {
    await this.prisma.dc1Declaration.update({ where: { id: declaration.id }, data: toDc1DeclarationRow(declaration) });
  }
}
