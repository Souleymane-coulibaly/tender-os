import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { DumeDeclarationRepository, DumeDeclarationVersionRepository } from "../application/ports/dume-declaration.repository";
import type { DumeDeclaration } from "../domain/dume-declaration.aggregate";
import type { DumeDeclarationVersion } from "../domain/dume-declaration-version.entity";
import { DuplicateDumeDeclarationError } from "../domain/errors";
import { toDomainDumeDeclaration, toDomainDumeDeclarationVersion, toDumeDeclarationRow, toDumeDeclarationVersionRow } from "./dume-declaration.persistence-mapper";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class PrismaDumeDeclarationRepository implements DumeDeclarationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(declaration: DumeDeclaration): Promise<void> {
    try {
      await this.prisma.dumeDeclaration.create({ data: toDumeDeclarationRow(declaration) });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new DuplicateDumeDeclarationError();
      }
      throw error;
    }
  }

  async findById(input: { organizationId: string; dumeDeclarationId: string }): Promise<DumeDeclaration | null> {
    const record = await this.prisma.dumeDeclaration.findFirst({ where: { id: input.dumeDeclarationId, organizationId: input.organizationId } });
    return record ? toDomainDumeDeclaration(record) : null;
  }

  async findByTenderId(input: { organizationId: string; tenderId: string }): Promise<DumeDeclaration | null> {
    const record = await this.prisma.dumeDeclaration.findFirst({ where: { organizationId: input.organizationId, tenderId: input.tenderId } });
    return record ? toDomainDumeDeclaration(record) : null;
  }

  async save(declaration: DumeDeclaration): Promise<void> {
    await this.prisma.dumeDeclaration.update({ where: { id: declaration.id }, data: toDumeDeclarationRow(declaration) });
  }
}

@Injectable()
export class PrismaDumeDeclarationVersionRepository implements DumeDeclarationVersionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(version: DumeDeclarationVersion): Promise<void> {
    await this.prisma.dumeDeclarationVersion.create({ data: toDumeDeclarationVersionRow(version) });
  }

  async findById(input: { organizationId: string; versionId: string }): Promise<DumeDeclarationVersion | null> {
    const record = await this.prisma.dumeDeclarationVersion.findFirst({ where: { id: input.versionId, organizationId: input.organizationId } });
    return record ? toDomainDumeDeclarationVersion(record) : null;
  }

  async listByDeclaration(input: { organizationId: string; dumeDeclarationId: string }): Promise<readonly DumeDeclarationVersion[]> {
    const records = await this.prisma.dumeDeclarationVersion.findMany({
      where: { organizationId: input.organizationId, dumeDeclarationId: input.dumeDeclarationId },
      orderBy: { version: "asc" },
    });
    return records.map(toDomainDumeDeclarationVersion);
  }
}
