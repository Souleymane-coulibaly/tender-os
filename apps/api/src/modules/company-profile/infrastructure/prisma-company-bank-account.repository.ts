import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrimaryBankAccountConflictError } from "../domain/errors";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { CompanyBankAccountRecord } from "../application/dtos";
import type { CandidateEntityScope, CandidateScope, ClientScope, CompanyBankAccountRepository, EntityScope } from "../application/ports/company-satellite.repository";


/** Traduit la violation de l'index unique partiel du compte principal en erreur MÉTIER. C'est le
 *  rôle de l'infrastructure : le domaine ne doit jamais connaître les codes d'erreur Prisma, et
 *  l'API ne doit jamais renvoyer un 500 pour une course entre deux promotions légitimes. */
/** Prisma remonte la colonne visée, pas le nom de l'index : pour l'index unique PARTIEL
 *  `company_bank_accounts_one_primary_per_candidate`, `meta.target` vaut `["candidate_company_id"]`.
 *  C'est la seule contrainte d'unicité de cette table portant sur cette colonne seule — la
 *  correspondance est donc exacte, jamais approximative. */
function isPrimaryPromotionConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  const columns = Array.isArray(target) ? target.map(String) : [String(target ?? "")];
  return columns.length === 1 && columns[0] === "candidate_company_id";
}

function translatePrimaryConflict(error: unknown): never {
  if (isPrimaryPromotionConflict(error)) {
    throw new PrimaryBankAccountConflictError();
  }
  throw error;
}

@Injectable()
export class PrismaCompanyBankAccountRepository implements CompanyBankAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: Omit<CompanyBankAccountRecord, "createdAt" | "updatedAt">): Promise<CompanyBankAccountRecord> {
    return this.prisma.companyBankAccount.create({ data: input });
  }

  // ---- Checkpoint TENDEROS-2.1-CCV2-I.1 : le scope CLIENT s'arrête au périmètre Legacy ---------
  //
  // `candidateCompanyId: null` sur les TROIS accès de scope client ci-dessous. Une ligne dont
  // `candidateCompanyId` est renseigné appartient à `CandidateCompany` (schéma CCV2-B) et son
  // `clientAccountId` n'est plus qu'un pointeur de LIGNAGE — la servir ici en ferait une donnée à
  // deux propriétaires.
  //
  // L'enjeu est une ÉLÉVATION DE PRIVILÈGE, pas seulement une question de sémantique : le RIB d'une
  // entreprise candidate est gardé depuis CCV2-C.1 par `candidate:read_banking`/`manage_banking`,
  // permissions de rang ORGANISATION. La route `/clients/:id/bank-accounts` est gardée par
  // `ClientPermission.ReadCompanyBanking`/`ManageCompanyBanking`, de rang CLIENT, obtenues par simple
  // affectation. Tant que la même ligne répondait aux deux, c'est la permission la plus facile à
  // obtenir qui déterminait l'accès au RIB : la garde forte de C.1 était contournable sans jamais
  // être violée. Vérifié comme reproductible avant correction, pas déduit du code.
  //
  // Aucune donnée n'est perdue : ces lignes restent intégralement lisibles et modifiables par leur
  // route légitime, `/candidate-companies/:id/bank-accounts`, sous la permission qui leur correspond.
  // La restriction est volontairement BORNÉE au bancaire : c'est le seul domaine où la mission fixe
  // un invariant de sécurité explicite, et le chemin de lecture Legacy promis par CCV2-B §9 pour les
  // autres satellites reste donc inchangé (fuite sémantique équivalente consignée au registre P2).
  async update(scope: EntityScope, patch: Partial<Omit<CompanyBankAccountRecord, "id" | "organizationId" | "clientAccountId">>): Promise<CompanyBankAccountRecord | null> {
    const { count } = await this.prisma.companyBankAccount.updateMany({
      where: { id: scope.id, organizationId: scope.organizationId, clientAccountId: scope.clientAccountId, candidateCompanyId: null },
      data: patch,
    });
    if (count === 0) return null;
    return this.findById(scope);
  }

  async findById(scope: EntityScope): Promise<CompanyBankAccountRecord | null> {
    return this.prisma.companyBankAccount.findFirst({
      where: { id: scope.id, organizationId: scope.organizationId, clientAccountId: scope.clientAccountId, candidateCompanyId: null },
    });
  }

  async list(scope: ClientScope): Promise<CompanyBankAccountRecord[]> {
    return this.prisma.companyBankAccount.findMany({
      where: { organizationId: scope.organizationId, clientAccountId: scope.clientAccountId, candidateCompanyId: null },
      orderBy: { createdAt: "asc" },
    });
  }

  // ---- Checkpoint CCV2-C.1 : même table, même ligne, bornée par la SOT V2 --------------------
  async listByCandidate(scope: CandidateScope): Promise<CompanyBankAccountRecord[]> {
    return this.prisma.companyBankAccount.findMany({
      where: { organizationId: scope.organizationId, candidateCompanyId: scope.candidateCompanyId },
      orderBy: { createdAt: "asc" },
    });
  }

  async findByIdForCandidate(scope: CandidateEntityScope): Promise<CompanyBankAccountRecord | null> {
    return this.prisma.companyBankAccount.findFirst({
      where: { id: scope.id, organizationId: scope.organizationId, candidateCompanyId: scope.candidateCompanyId },
    });
  }

  async updateForCandidate(scope: CandidateEntityScope, patch: Partial<Omit<CompanyBankAccountRecord, "id" | "organizationId" | "clientAccountId" | "candidateCompanyId">>): Promise<CompanyBankAccountRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      // Promotion : rétrograder les autres AVANT d'écrire celui-ci, dans la MÊME transaction —
      // l'index unique partiel `company_bank_accounts_one_primary_per_candidate` sérialise alors
      // les promotions concurrentes au lieu de laisser passer deux comptes principaux.
      if (patch.isPrimary === true) {
        await tx.companyBankAccount.updateMany({
          where: { organizationId: scope.organizationId, candidateCompanyId: scope.candidateCompanyId, isPrimary: true, NOT: { id: scope.id } },
          data: { isPrimary: false },
        });
      }
      const { count } = await tx.companyBankAccount.updateMany({
        where: { id: scope.id, organizationId: scope.organizationId, candidateCompanyId: scope.candidateCompanyId },
        data: patch,
      });
      if (count === 0) return null;
      return tx.companyBankAccount.findFirst({
        where: { id: scope.id, organizationId: scope.organizationId, candidateCompanyId: scope.candidateCompanyId },
      });
    }).catch(translatePrimaryConflict);
  }

  async createForCandidate(input: Omit<CompanyBankAccountRecord, "createdAt" | "updatedAt">): Promise<CompanyBankAccountRecord> {
    return this.prisma.$transaction(async (tx) => {
      if (input.isPrimary && input.candidateCompanyId) {
        await tx.companyBankAccount.updateMany({
          where: { organizationId: input.organizationId, candidateCompanyId: input.candidateCompanyId, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return tx.companyBankAccount.create({ data: input });
    }).catch(translatePrimaryConflict);
  }

}
