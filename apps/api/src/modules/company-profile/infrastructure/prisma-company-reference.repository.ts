import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { CompanyReferenceDocumentRecord, CompanyReferenceRecord } from "../application/dtos";
import type { CandidateEntityScope, CandidateScope, ClientScope, CompanyReferenceDocumentRepository, CompanyReferenceRepository, EntityScope } from "../application/ports/company-satellite.repository";

function toRecord(row: Omit<CompanyReferenceRecord, "amountValue"> & { amountValue: { toString(): string } | null }): CompanyReferenceRecord {
  return { ...row, amountValue: row.amountValue?.toString() ?? null };
}

@Injectable()
export class PrismaCompanyReferenceRepository implements CompanyReferenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: Omit<CompanyReferenceRecord, "createdAt" | "updatedAt">): Promise<CompanyReferenceRecord> {
    const row = await this.prisma.companyReference.create({ data: input });
    return toRecord(row);
  }

  async update(scope: EntityScope, patch: Partial<Omit<CompanyReferenceRecord, "id" | "organizationId" | "clientAccountId">>): Promise<CompanyReferenceRecord | null> {
    const { count } = await this.prisma.companyReference.updateMany({ where: { id: scope.id, organizationId: scope.organizationId, clientAccountId: scope.clientAccountId, candidateCompanyId: null }, data: patch });
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
  async findById(scope: EntityScope): Promise<CompanyReferenceRecord | null> {
    const row = await this.prisma.companyReference.findFirst({ where: { id: scope.id, organizationId: scope.organizationId, clientAccountId: scope.clientAccountId, candidateCompanyId: null } });
    return row ? toRecord(row) : null;
  }

  async list(scope: ClientScope): Promise<CompanyReferenceRecord[]> {
    const rows = await this.prisma.companyReference.findMany({
      where: { organizationId: scope.organizationId, clientAccountId: scope.clientAccountId, candidateCompanyId: null },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toRecord);
  }

  // ---- Checkpoint CCV2-C : même table, même ligne, bornée par la SOT V2 ----------------------
  async listByCandidate(scope: CandidateScope): Promise<CompanyReferenceRecord[]> {
    const rows = await this.prisma.companyReference.findMany({
      where: { organizationId: scope.organizationId, candidateCompanyId: scope.candidateCompanyId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toRecord);
  }

  async findByIdForCandidate(scope: CandidateEntityScope): Promise<CompanyReferenceRecord | null> {
    const row = await this.prisma.companyReference.findFirst({
      where: { id: scope.id, organizationId: scope.organizationId, candidateCompanyId: scope.candidateCompanyId },
    });
    return row ? toRecord(row) : null;
  }

  async updateForCandidate(scope: CandidateEntityScope, patch: Partial<Omit<CompanyReferenceRecord, "id" | "organizationId" | "clientAccountId" | "candidateCompanyId">>): Promise<CompanyReferenceRecord | null> {
    const { count } = await this.prisma.companyReference.updateMany({
      where: { id: scope.id, organizationId: scope.organizationId, candidateCompanyId: scope.candidateCompanyId },
      data: patch,
    });
    if (count === 0) return null;
    return this.findByIdForCandidate(scope);
  }

}

@Injectable()
export class PrismaCompanyReferenceDocumentRepository implements CompanyReferenceDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: Omit<CompanyReferenceDocumentRecord, "createdAt">): Promise<CompanyReferenceDocumentRecord> {
    return this.prisma.companyReferenceDocument.create({ data: input });
  }

  async list(input: { organizationId: string; companyReferenceId: string }): Promise<CompanyReferenceDocumentRecord[]> {
    return this.prisma.companyReferenceDocument.findMany({
      where: { organizationId: input.organizationId, companyReferenceId: input.companyReferenceId },
      orderBy: { createdAt: "asc" },
    });
  }

  
}
