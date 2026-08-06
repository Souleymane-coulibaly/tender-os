import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { SubcontractorProfileRecord } from "../application/dtos";
import type { EntityScope, OrgScope, Patch, SubcontractorProfileRepository } from "../application/ports/subcontractor.repository";

@Injectable()
export class PrismaSubcontractorProfileRepository implements SubcontractorProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: Omit<SubcontractorProfileRecord, "createdAt" | "updatedAt">): Promise<SubcontractorProfileRecord> {
    return this.prisma.subcontractorProfile.create({ data: input });
  }

  async update(scope: EntityScope, patch: Patch<Omit<SubcontractorProfileRecord, "id" | "organizationId">>): Promise<SubcontractorProfileRecord | null> {
    // `legalName` (String non-nullable) rend le patch incompatible avec le type Prisma généré sous
    // `exactOptionalPropertyTypes` (une clé absente vs `undefined` explicite) — cast sûr : `patch` ne
    // contient jamais `undefined` en valeur réelle pour une clé PRÉSENTE (seulement des clés absentes).
    const data = patch as Prisma.SubcontractorProfileUpdateManyMutationInput;
    const { count } = await this.prisma.subcontractorProfile.updateMany({ where: { id: scope.id, organizationId: scope.organizationId }, data });
    if (count === 0) return null;
    return this.findById(scope);
  }

  async findById(scope: EntityScope): Promise<SubcontractorProfileRecord | null> {
    return this.prisma.subcontractorProfile.findFirst({ where: { id: scope.id, organizationId: scope.organizationId } });
  }

  async list(scope: OrgScope & { status?: string | undefined; search?: string | undefined }): Promise<SubcontractorProfileRecord[]> {
    return this.prisma.subcontractorProfile.findMany({
      where: {
        organizationId: scope.organizationId,
        ...(scope.status ? { status: scope.status } : {}),
        ...(scope.search ? { legalName: { contains: scope.search, mode: "insensitive" } } : {}),
      },
      orderBy: { legalName: "asc" },
    });
  }

  async findDuplicateSiretInOrganization(input: { organizationId: string; siret: string; excludeProfileId?: string | undefined }): Promise<SubcontractorProfileRecord | null> {
    return this.prisma.subcontractorProfile.findFirst({
      where: { organizationId: input.organizationId, siret: input.siret, ...(input.excludeProfileId ? { id: { not: input.excludeProfileId } } : {}) },
    });
  }
}
