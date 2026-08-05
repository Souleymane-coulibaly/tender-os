import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { AdministrativeDossierRepository } from "../application/ports/administrative-dossier.repository";
import type { AdministrativeDossier } from "../domain/administrative-dossier.aggregate";
import { DuplicateAdministrativeDossierError } from "../domain/errors";
import { toAdministrativeDossierRow, toDomainAdministrativeDossier } from "./administrative-dossier.persistence-mapper";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class PrismaAdministrativeDossierRepository implements AdministrativeDossierRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(dossier: AdministrativeDossier): Promise<void> {
    try {
      await this.prisma.administrativeDossier.create({ data: toAdministrativeDossierRow(dossier) });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new DuplicateAdministrativeDossierError();
      }
      throw error;
    }
  }

  async findById(input: { organizationId: string; dossierId: string }): Promise<AdministrativeDossier | null> {
    const record = await this.prisma.administrativeDossier.findFirst({ where: { id: input.dossierId, organizationId: input.organizationId } });
    return record ? toDomainAdministrativeDossier(record) : null;
  }

  async findByTenderId(input: { organizationId: string; tenderId: string }): Promise<AdministrativeDossier | null> {
    const record = await this.prisma.administrativeDossier.findFirst({ where: { organizationId: input.organizationId, tenderId: input.tenderId } });
    return record ? toDomainAdministrativeDossier(record) : null;
  }

  async save(dossier: AdministrativeDossier): Promise<void> {
    await this.prisma.administrativeDossier.update({ where: { id: dossier.id }, data: toAdministrativeDossierRow(dossier) });
  }
}
