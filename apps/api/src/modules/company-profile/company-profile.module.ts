import { Module } from "@nestjs/common";
import { ClientPortfolioModule } from "../client-portfolio";
import { DocumentsModule } from "../documents";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { OutboxWriterModule } from "../outbox";

import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import {
  COMPANY_BANK_ACCOUNT_REPOSITORY,
  COMPANY_CERTIFICATION_REPOSITORY,
  COMPANY_HUMAN_RESOURCE_REPOSITORY,
  COMPANY_INSURANCE_REPOSITORY,
  COMPANY_LEGAL_IDENTITY_REPOSITORY,
  COMPANY_MATERIAL_RESOURCE_REPOSITORY,
  COMPANY_REFERENCE_DOCUMENT_REPOSITORY,
  COMPANY_REFERENCE_REPOSITORY,
  COMPANY_REPRESENTATIVE_REPOSITORY,
  DOCUMENT_CLIENT_ACCOUNT_ASSOCIATION_REPOSITORY,
} from "./application/ports/company-satellite.repository";

import { ArchiveCompanyBankAccountUseCase, ListCompanyBankAccountsUseCase } from "./application/use-cases/company-bank-account.use-cases";
import { ListCompanyCertificationsUseCase } from "./application/use-cases/company-certification.use-cases";
import { ListCompanyHumanResourcesUseCase } from "./application/use-cases/company-human-resource.use-cases";
import { ListCompanyInsurancesUseCase } from "./application/use-cases/company-insurance.use-cases";
import { GetCompanyLegalIdentityUseCase } from "./application/use-cases/company-legal-identity.use-cases";
import { ListCompanyMaterialResourcesUseCase } from "./application/use-cases/company-material-resource.use-cases";
import {
  ListCompanyReferenceDocumentsUseCase,
  ListCompanyReferencesUseCase,
} from "./application/use-cases/company-reference.use-cases";
import { CreateCompanyRepresentativeUseCase, ListCompanyRepresentativesUseCase, UpdateCompanyRepresentativeUseCase } from "./application/use-cases/company-representative.use-cases";
import { AttachDocumentToClientAccountUseCase, ListClientAccountDocumentAssociationsUseCase } from "./application/use-cases/document-client-account-association.use-cases";
import { GetCompanyProfileUseCase } from "./application/use-cases/get-company-profile.use-case";

import { CompanyProfileAccessService } from "./application/services/company-profile-access.service";

import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaCompanyBankAccountRepository } from "./infrastructure/prisma-company-bank-account.repository";
import { PrismaCompanyCertificationRepository } from "./infrastructure/prisma-company-certification.repository";
import { PrismaCompanyHumanResourceRepository } from "./infrastructure/prisma-company-human-resource.repository";
import { PrismaCompanyInsuranceRepository } from "./infrastructure/prisma-company-insurance.repository";
import { PrismaCompanyLegalIdentityRepository } from "./infrastructure/prisma-company-legal-identity.repository";
import { PrismaCompanyMaterialResourceRepository } from "./infrastructure/prisma-company-material-resource.repository";
import { PrismaCompanyReferenceDocumentRepository, PrismaCompanyReferenceRepository } from "./infrastructure/prisma-company-reference.repository";
import { PrismaCompanyRepresentativeRepository } from "./infrastructure/prisma-company-representative.repository";
import { PrismaDocumentClientAccountAssociationRepository } from "./infrastructure/prisma-document-client-account-association.repository";

import { CompanyProfileController } from "./interfaces/http/company-profile.controller";
// Checkpoint CCV2-C — surface candidate. `CandidateCompanyModule` est importé ici (jamais
// l'inverse : le cycle réel est CompanyProfile -> Documents -> Tenders -> CandidateCompany).
import { CandidateCompanyModule } from "../candidate-company";
import { CandidateCapabilitiesController } from "./interfaces/http/candidate-capabilities.controller";
import { CandidateBankAccountsController } from "./interfaces/http/candidate-bank-accounts.controller";
import { CandidateDocumentsController } from "./interfaces/http/candidate-documents.controller";
import { ResolveCandidateCapabilitiesUseCase } from "./application/use-cases/resolve-candidate-capabilities.use-case";
import { PrismaDocumentCandidateCompanyAssociationRepository } from "./infrastructure/prisma-document-candidate-company-association.repository";
import { DOCUMENT_CANDIDATE_COMPANY_ASSOCIATION_REPOSITORY } from "./application/ports/company-satellite.repository";
import {
  AttachCandidateDocumentUseCase,
  DetachCandidateDocumentUseCase,
  DownloadCandidateDocumentUseCase,
  GetCandidateDocumentUseCase,
  ListCandidateDocumentsUseCase,
  ListCandidateDocumentVersionsUseCase,
  UpdateCandidateDocumentUseCase,
} from "./application/use-cases/candidate-document.use-cases";
import {
  ArchiveCandidateBankAccountUseCase,
  CreateCandidateBankAccountUseCase,
  ListCandidateBankAccountsUseCase,
  UpdateCandidateBankAccountUseCase,
} from "./application/use-cases/candidate-bank-account.use-cases";
import { CandidateCapabilityAccessService } from "./application/services/candidate-capability-access.service";
import {
  ArchiveCandidateCapabilityUseCase,
  CandidateCapabilityRegistry,
  CreateCandidateCapabilityUseCase,
  ListCandidateCapabilitiesUseCase,
  UpdateCandidateCapabilityUseCase,
} from "./application/use-cases/candidate-capability.use-cases";

/**
 * Module `company-profile` (mission V2 Sprint 2) — importe `ClientPortfolioModule`/`DocumentsModule`
 * dans UN SEUL sens (même motif que `administrative-dossier`) : `client-portfolio`/`documents`
 * n'importent jamais ce module en retour.
 *
 * V2 Sprint 5 (GO/NO-GO IA) — enrichissement anticipé par ce module dès sa création (voir
 * l'ancien commentaire ci-dessus, désormais caduc) : `GetCompanyProfileUseCase` est exporté en
 * LECTURE SEULE pour `opportunity` (scoring Niveau 1/Niveau 2) — même motif que les réexports
 * `UpdateTenderUseCase`/`CreateTenderLotUseCase` pratiqués par `tenders` pour `ai-suggestion-bridge`.
 * Aucun autre use case de ce module n'est exporté : `opportunity` ne lit jamais, n'écrit jamais
 * directement dans le profil entreprise.
 */
@Module({
  imports: [IdentityModule, MembershipsModule, ClientPortfolioModule, DocumentsModule, OutboxWriterModule, CandidateCompanyModule],
  controllers: [CompanyProfileController, CandidateCapabilitiesController, CandidateBankAccountsController, CandidateDocumentsController],
  exports: [GetCompanyProfileUseCase, ResolveCandidateCapabilitiesUseCase],
  providers: [
    CompanyProfileAccessService,
    CandidateCapabilityAccessService,
    CandidateCapabilityRegistry,
    ListCandidateCapabilitiesUseCase,
    CreateCandidateCapabilityUseCase,
    UpdateCandidateCapabilityUseCase,
    ArchiveCandidateCapabilityUseCase,
    ListCandidateBankAccountsUseCase,
    CreateCandidateBankAccountUseCase,
    UpdateCandidateBankAccountUseCase,
    ArchiveCandidateBankAccountUseCase,
    { provide: DOCUMENT_CANDIDATE_COMPANY_ASSOCIATION_REPOSITORY, useClass: PrismaDocumentCandidateCompanyAssociationRepository },
    ListCandidateDocumentsUseCase,
    AttachCandidateDocumentUseCase,
    GetCandidateDocumentUseCase,
    DownloadCandidateDocumentUseCase,
    UpdateCandidateDocumentUseCase,
    DetachCandidateDocumentUseCase,
    ListCandidateDocumentVersionsUseCase,
    ResolveCandidateCapabilitiesUseCase,

    GetCompanyProfileUseCase,
    GetCompanyLegalIdentityUseCase,

    ListCompanyRepresentativesUseCase,
    CreateCompanyRepresentativeUseCase,
    UpdateCompanyRepresentativeUseCase,

    ListCompanyBankAccountsUseCase,
    ArchiveCompanyBankAccountUseCase,

    ListCompanyInsurancesUseCase,

    ListCompanyCertificationsUseCase,

    ListCompanyReferencesUseCase,
    ListCompanyReferenceDocumentsUseCase,

    ListCompanyHumanResourcesUseCase,

    ListCompanyMaterialResourcesUseCase,

    ListClientAccountDocumentAssociationsUseCase,
    AttachDocumentToClientAccountUseCase,

    { provide: COMPANY_LEGAL_IDENTITY_REPOSITORY, useClass: PrismaCompanyLegalIdentityRepository },
    { provide: COMPANY_REPRESENTATIVE_REPOSITORY, useClass: PrismaCompanyRepresentativeRepository },
    { provide: COMPANY_BANK_ACCOUNT_REPOSITORY, useClass: PrismaCompanyBankAccountRepository },
    { provide: COMPANY_INSURANCE_REPOSITORY, useClass: PrismaCompanyInsuranceRepository },
    { provide: COMPANY_CERTIFICATION_REPOSITORY, useClass: PrismaCompanyCertificationRepository },
    { provide: COMPANY_REFERENCE_REPOSITORY, useClass: PrismaCompanyReferenceRepository },
    { provide: COMPANY_REFERENCE_DOCUMENT_REPOSITORY, useClass: PrismaCompanyReferenceDocumentRepository },
    { provide: COMPANY_HUMAN_RESOURCE_REPOSITORY, useClass: PrismaCompanyHumanResourceRepository },
    { provide: COMPANY_MATERIAL_RESOURCE_REPOSITORY, useClass: PrismaCompanyMaterialResourceRepository },
    { provide: DOCUMENT_CLIENT_ACCOUNT_ASSOCIATION_REPOSITORY, useClass: PrismaDocumentClientAccountAssociationRepository },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
  ],
})
export class CompanyProfileModule {}
