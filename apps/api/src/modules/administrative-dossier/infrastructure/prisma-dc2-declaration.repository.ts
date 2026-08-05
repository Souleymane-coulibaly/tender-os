import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { Dc2DeclarationRepository, Dc2DeclarationVersionRepository } from "../application/ports/dc2-declaration.repository";
import type { Dc2Declaration } from "../domain/dc2-declaration.aggregate";
import type { Dc2DeclarationVersion } from "../domain/dc2-declaration-version.entity";
import { DuplicateDc2DeclarationError } from "../domain/errors";
import { toDc2DeclarationRow, toDc2DeclarationVersionRow, toDomainDc2Declaration, toDomainDc2DeclarationVersion } from "./dc2-declaration.persistence-mapper";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class PrismaDc2DeclarationRepository implements Dc2DeclarationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(declaration: Dc2Declaration): Promise<void> {
    try {
      await this.prisma.dc2Declaration.create({ data: toDc2DeclarationRow(declaration) });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new DuplicateDc2DeclarationError();
      }
      throw error;
    }
  }

  async findById(input: { organizationId: string; dc2DeclarationId: string }): Promise<Dc2Declaration | null> {
    const record = await this.prisma.dc2Declaration.findFirst({ where: { id: input.dc2DeclarationId, organizationId: input.organizationId } });
    return record ? toDomainDc2Declaration(record) : null;
  }

  async findByTenderId(input: { organizationId: string; tenderId: string }): Promise<Dc2Declaration | null> {
    const record = await this.prisma.dc2Declaration.findFirst({ where: { organizationId: input.organizationId, tenderId: input.tenderId } });
    return record ? toDomainDc2Declaration(record) : null;
  }

  async save(declaration: Dc2Declaration): Promise<void> {
    await this.prisma.dc2Declaration.update({ where: { id: declaration.id }, data: toDc2DeclarationRow(declaration) });
  }
}

@Injectable()
export class PrismaDc2DeclarationVersionRepository implements Dc2DeclarationVersionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(version: Dc2DeclarationVersion): Promise<void> {
    await this.prisma.dc2DeclarationVersion.create({ data: toDc2DeclarationVersionRow(version) });
  }

  async findById(input: { organizationId: string; versionId: string }): Promise<Dc2DeclarationVersion | null> {
    const record = await this.prisma.dc2DeclarationVersion.findFirst({ where: { id: input.versionId, organizationId: input.organizationId } });
    return record ? toDomainDc2DeclarationVersion(record) : null;
  }

  async listByDeclaration(input: { organizationId: string; dc2DeclarationId: string }): Promise<readonly Dc2DeclarationVersion[]> {
    const records = await this.prisma.dc2DeclarationVersion.findMany({
      where: { organizationId: input.organizationId, dc2DeclarationId: input.dc2DeclarationId },
      orderBy: { version: "asc" },
    });
    return records.map(toDomainDc2DeclarationVersion);
  }
}
