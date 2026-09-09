import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { CompanyMaterialResourceRecord } from "../application/dtos";
import type { CandidateEntityScope, CandidateScope, ClientScope, CompanyMaterialResourceRepository, EntityScope } from "../application/ports/company-satellite.repository";

@Injectable()
export class PrismaCompanyMaterialResourceRepository implements CompanyMaterialResourceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: Omit<CompanyMaterialResourceRecord, "createdAt" | "updatedAt">): Promise<CompanyMaterialResourceRecord> {
    return this.prisma.companyMaterialResource.create({ data: input });
  }

  async update(scope: EntityScope, patch: Partial<Omit<CompanyMaterialResourceRecord, "id" | "organizationId" | "clientAccountId">>): Promise<CompanyMaterialResourceRecord | null> {
    const { count } = await this.prisma.companyMaterialResource.updateMany({ where: { id: scope.id, organizationId: scope.organizationId, clientAccountId: scope.clientAccountId, candidateCompanyId: null }, data: patch });
    if (count === 0) return null;
    return this.findById(scope);
  }

  // ---- Checkpoint TENDEROS-2.1-CCV2-I.2 : le scope CLIENT s'arrête au périmètre Legacy ---------
  //
  // `candidateCompanyId: null` sur les trois accès de scope client. Une ligne dont
  // `candidateCompanyId` est renseigné appartient à `CandidateCompany` (modèle par association,
  // CCV2-B) et son `clientAccountId` n'est plus qu'un pointeur de LIGNAGE : la servir ici
  // présenterait le `ClientAccount` comme sa source de vérité, ce que la §17 interdit.
  //
  // NATURE DU DÉFAUT, à ne pas surclasser : contrairement au bancaire — où la route client
  // (`ReadCompanyBanking`, rang client, obtenue par affectation) court-circuitait
  // `candidate:read_banking` (rang organisation) et constituait donc une élévation de privilège —
  // ces familles sont gardées des DEUX côtés par une lecture de base de rang équivalent
  // (`ReadCompanyProfile` / `candidate:read`). C'est une fuite SÉMANTIQUE : la donnée est présentée
  // sous le mauvais propriétaire, sans franchissement de palier de confidentialité.
  //
  // Aucune donnée n'est perdue : ces lignes restent intégralement lisibles par leur route légitime,
  // `/candidate-companies/:id/*`, et les lignes purement historiques continuent d'être servies ici.
  async findById(scope: EntityScope): Promise<CompanyMaterialResourceRecord | null> {
    return this.prisma.companyMaterialResource.findFirst({ where: { id: scope.id, organizationId: scope.organizationId, clientAccountId: scope.clientAccountId, candidateCompanyId: null } });
  }

  async list(scope: ClientScope): Promise<CompanyMaterialResourceRecord[]> {
    return this.prisma.companyMaterialResource.findMany({
      where: { organizationId: scope.organizationId, clientAccountId: scope.clientAccountId, candidateCompanyId: null },
      orderBy: { createdAt: "asc" },
    });
  }

  // ---- Checkpoint CCV2-C : même table, même ligne, bornée par la SOT V2 ----------------------
  async listByCandidate(scope: CandidateScope): Promise<CompanyMaterialResourceRecord[]> {
    return this.prisma.companyMaterialResource.findMany({
      where: { organizationId: scope.organizationId, candidateCompanyId: scope.candidateCompanyId },
      orderBy: { createdAt: "asc" },
    });
  }

  async findByIdForCandidate(scope: CandidateEntityScope): Promise<CompanyMaterialResourceRecord | null> {
    return this.prisma.companyMaterialResource.findFirst({
      where: { id: scope.id, organizationId: scope.organizationId, candidateCompanyId: scope.candidateCompanyId },
    });
  }

  async updateForCandidate(scope: CandidateEntityScope, patch: Partial<Omit<CompanyMaterialResourceRecord, "id" | "organizationId" | "clientAccountId" | "candidateCompanyId">>): Promise<CompanyMaterialResourceRecord | null> {
    const { count } = await this.prisma.companyMaterialResource.updateMany({
      where: { id: scope.id, organizationId: scope.organizationId, candidateCompanyId: scope.candidateCompanyId },
      data: patch,
    });
    if (count === 0) return null;
    return this.findByIdForCandidate(scope);
  }

}
