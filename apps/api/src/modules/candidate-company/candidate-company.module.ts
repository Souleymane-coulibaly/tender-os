import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { CANDIDATE_COMPANY_REPOSITORY } from "./application/ports/candidate-company.repository";
import { AddCandidateEstablishmentUseCase } from "./application/use-cases/add-candidate-establishment.use-case";
import { CreateCandidateCompanyUseCase } from "./application/use-cases/create-candidate-company.use-case";
import { GetCandidateCompanyUseCase } from "./application/use-cases/get-candidate-company.use-case";
import { ListCandidateCompaniesUseCase } from "./application/use-cases/list-candidate-companies.use-case";
import { ListCandidateEstablishmentsUseCase } from "./application/use-cases/list-candidate-establishments.use-case";
import { ResolveCandidateIdentityUseCase } from "./application/use-cases/resolve-candidate-identity.use-case";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaCandidateCompanyRepository } from "./infrastructure/prisma-candidate-company.repository";
import { CandidateCompanyController } from "./interfaces/http/candidate-company.controller";

/**
 * Module CandidateCompany (mission TenderOS 2.1-A1) — Source-of-Truth de l'entreprise candidate,
 * strictement additif vis-à-vis de ClientPortfolio : aucune dépendance mutuelle créée ici, aucun
 * import de `ClientPortfolioModule`. Le seul lien avec `ClientAccount` est le champ de compatibilité
 * `sourceClientAccountId` (colonne indexée, jamais une relation Prisma — voir domain/errors.ts et le
 * commentaire de migration).
 */
@Module({
  imports: [IdentityModule, MembershipsModule],
  controllers: [CandidateCompanyController],
  providers: [
    CreateCandidateCompanyUseCase,
    GetCandidateCompanyUseCase,
    ListCandidateCompaniesUseCase,
    AddCandidateEstablishmentUseCase,
    ListCandidateEstablishmentsUseCase,
    ResolveCandidateIdentityUseCase,

    { provide: CANDIDATE_COMPANY_REPOSITORY, useClass: PrismaCandidateCompanyRepository },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
  ],
  // V2 Sprint 26 (Checkpoint 2.1-A3/A4) — réexportés pour `opportunity`/`tenders`/
  // `administrative-dossier` (voir index.ts).
  exports: [GetCandidateCompanyUseCase, ResolveCandidateIdentityUseCase],
})
export class CandidateCompanyModule {}
