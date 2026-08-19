import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { CandidateCompanyRepository, ListCandidateCompaniesFilter, ListCandidateCompaniesResult } from "../application/ports/candidate-company.repository";
import type { CandidateCompany } from "../domain/candidate-company.aggregate";
import type { CandidateEstablishment } from "../domain/candidate-establishment.entity";
import { DuplicateCandidateCompanyNameError, DuplicateCandidateEstablishmentSiretError } from "../domain/errors";
import { toDomain as companyToDomain, toPersistence as companyToPersistence } from "./candidate-company.persistence-mapper";
import { toDomain as establishmentToDomain, toPersistence as establishmentToPersistence } from "./candidate-establishment.persistence-mapper";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

@Injectable()
export class PrismaCandidateCompanyRepository implements CandidateCompanyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; candidateCompanyId: string }): Promise<CandidateCompany | null> {
    const record = await this.prisma.candidateCompany.findFirst({ where: { id: input.candidateCompanyId, organizationId: input.organizationId } });
    return record ? companyToDomain(record) : null;
  }

  async findByNormalizedName(input: { organizationId: string; nameNormalized: string }): Promise<CandidateCompany | null> {
    const record = await this.prisma.candidateCompany.findFirst({ where: { organizationId: input.organizationId, nameNormalized: input.nameNormalized } });
    return record ? companyToDomain(record) : null;
  }

  async findBySourceClientAccountId(input: { organizationId: string; sourceClientAccountId: string }): Promise<CandidateCompany | null> {
    const record = await this.prisma.candidateCompany.findFirst({ where: { organizationId: input.organizationId, sourceClientAccountId: input.sourceClientAccountId } });
    return record ? companyToDomain(record) : null;
  }

  async create(company: CandidateCompany): Promise<void> {
    try {
      await this.prisma.candidateCompany.create({ data: companyToPersistence(company) });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new DuplicateCandidateCompanyNameError();
      }
      throw error;
    }
  }

  async save(company: CandidateCompany): Promise<void> {
    const data = companyToPersistence(company);
    try {
      // Tenant-scopé (audit round 2, FIX-A2-02) — `id` seul suffirait déjà en pratique (UUID non
      // devinable) mais la clé composite ferme structurellement la possibilité qu'un appelant
      // fournisse un `organizationId` incohérent avec l'agrégat sans que ce soit détecté.
      await this.prisma.candidateCompany.update({ where: { id_organizationId: { id: data.id, organizationId: data.organizationId } }, data });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new DuplicateCandidateCompanyNameError();
      }
      throw error;
    }
  }

  async list(filter: ListCandidateCompaniesFilter): Promise<ListCandidateCompaniesResult> {
    const where: Prisma.CandidateCompanyWhereInput = {
      organizationId: filter.organizationId,
      ...(filter.includeArchived ? {} : { archivedAt: null }),
    };
    const orderBy: Prisma.CandidateCompanyOrderByWithRelationInput[] = [{ name: "asc" }, { id: "asc" }];

    const [records, total] = await Promise.all([
      this.prisma.candidateCompany.findMany({
        where,
        orderBy,
        take: filter.limit + 1,
        ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      }),
      this.prisma.candidateCompany.count({ where }),
    ]);

    const hasNextPage = records.length > filter.limit;
    const page = hasNextPage ? records.slice(0, filter.limit) : records;

    return {
      items: page.map(companyToDomain),
      nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null,
      total,
    };
  }

  async findEstablishmentBySiret(input: { organizationId: string; siret: string }): Promise<CandidateEstablishment | null> {
    const record = await this.prisma.candidateEstablishment.findFirst({ where: { organizationId: input.organizationId, siret: input.siret } });
    return record ? establishmentToDomain(record) : null;
  }

  async createEstablishment(establishment: CandidateEstablishment): Promise<void> {
    try {
      await this.prisma.candidateEstablishment.create({ data: establishmentToPersistence(establishment) });
    } catch (error) {
      // Filet de sécurité base de données — le SIRET dupliqué est déjà écarté en amont par le use
      // case (`findEstablishmentBySiret`) ; ce catch ne couvre qu'une course concurrente réelle
      // (ou l'index unique partiel "un seul principal" — mission §8, non exprimable dans le DSL
      // Prisma) et retombe volontairement sur la même erreur métier que le cas SIRET, l'API HTTP
      // exposant déjà un statut CONFLICT identique dans les deux cas.
      if (isUniqueConstraintViolation(error)) {
        throw new DuplicateCandidateEstablishmentSiretError();
      }
      throw error;
    }
  }

  async listEstablishmentsByCompany(input: { organizationId: string; candidateCompanyId: string }): Promise<readonly CandidateEstablishment[]> {
    // Checkpoint 2.1-A6.4 (mission §9) — ordre déterministe : l'établissement principal déclaré
    // d'abord (au plus un, index unique partiel), puis un tri stable existant (`createdAt asc`),
    // jamais une priorité métier inventée.
    const records = await this.prisma.candidateEstablishment.findMany({
      where: { organizationId: input.organizationId, candidateCompanyId: input.candidateCompanyId },
      orderBy: [{ isPrincipal: "desc" }, { createdAt: "asc" }],
    });
    return records.map(establishmentToDomain);
  }
}
