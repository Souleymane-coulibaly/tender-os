import { Module } from "@nestjs/common";
import { CompanyProfileModule } from "../company-profile";
import { DocumentsModule } from "../documents";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { OutboxWriterModule } from "../outbox";

import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import {
  SUBCONTRACTOR_CERTIFICATION_REPOSITORY,
  SUBCONTRACTOR_INSURANCE_REPOSITORY,
  SUBCONTRACTOR_PROFILE_DOCUMENT_REPOSITORY,
  SUBCONTRACTOR_PROFILE_REPOSITORY,
  SUBCONTRACTOR_REFERENCE_REPOSITORY,
} from "./application/ports/subcontractor.repository";

import {
  ArchiveSubcontractorProfileUseCase,
  CreateSubcontractorProfileUseCase,
  GetSubcontractorProfileUseCase,
  ListSubcontractorProfilesUseCase,
  RestoreSubcontractorProfileUseCase,
  UpdateSubcontractorProfileUseCase,
} from "./application/use-cases/subcontractor-profile.use-cases";
import {
  ArchiveSubcontractorCertificationUseCase,
  ArchiveSubcontractorInsuranceUseCase,
  ArchiveSubcontractorReferenceUseCase,
  AttachSubcontractorProfileDocumentUseCase,
  CreateSubcontractorCertificationUseCase,
  CreateSubcontractorInsuranceUseCase,
  CreateSubcontractorReferenceUseCase,
  ListSubcontractorCertificationsUseCase,
  ListSubcontractorInsurancesUseCase,
  ListSubcontractorProfileDocumentsUseCase,
  ListSubcontractorReferencesUseCase,
} from "./application/use-cases/subcontractor-satellite.use-cases";

import { SubcontractorAccessService } from "./application/services/subcontractor-access.service";

import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaSubcontractorCertificationRepository } from "./infrastructure/prisma-subcontractor-certification.repository";
import { PrismaSubcontractorInsuranceRepository } from "./infrastructure/prisma-subcontractor-insurance.repository";
import { PrismaSubcontractorProfileDocumentRepository } from "./infrastructure/prisma-subcontractor-profile-document.repository";
import { PrismaSubcontractorProfileRepository } from "./infrastructure/prisma-subcontractor-profile.repository";
import { PrismaSubcontractorReferenceRepository } from "./infrastructure/prisma-subcontractor-reference.repository";

import { SubcontractorController } from "./interfaces/http/subcontractor.controller";

/**
 * Module `subcontractors` (mission V2 Sprint 2 §6) — répertoire ORGANISATIONNEL, importe
 * `CompanyProfileModule` UNIQUEMENT pour réutiliser les fonctions pures SIREN/SIRET/TVA (mission
 * "ne jamais dupliquer une règle métier"), jamais de dépendance à `ClientAccount`. Sens unique :
 * `company-profile` n'importe jamais `subcontractors` en retour.
 */
@Module({
  imports: [IdentityModule, MembershipsModule, CompanyProfileModule, DocumentsModule, OutboxWriterModule],
  controllers: [SubcontractorController],
  providers: [
    SubcontractorAccessService,

    ListSubcontractorProfilesUseCase,
    GetSubcontractorProfileUseCase,
    CreateSubcontractorProfileUseCase,
    UpdateSubcontractorProfileUseCase,
    ArchiveSubcontractorProfileUseCase,
    RestoreSubcontractorProfileUseCase,

    ListSubcontractorReferencesUseCase,
    CreateSubcontractorReferenceUseCase,
    ArchiveSubcontractorReferenceUseCase,

    ListSubcontractorCertificationsUseCase,
    CreateSubcontractorCertificationUseCase,
    ArchiveSubcontractorCertificationUseCase,

    ListSubcontractorInsurancesUseCase,
    CreateSubcontractorInsuranceUseCase,
    ArchiveSubcontractorInsuranceUseCase,

    ListSubcontractorProfileDocumentsUseCase,
    AttachSubcontractorProfileDocumentUseCase,

    { provide: SUBCONTRACTOR_PROFILE_REPOSITORY, useClass: PrismaSubcontractorProfileRepository },
    { provide: SUBCONTRACTOR_REFERENCE_REPOSITORY, useClass: PrismaSubcontractorReferenceRepository },
    { provide: SUBCONTRACTOR_CERTIFICATION_REPOSITORY, useClass: PrismaSubcontractorCertificationRepository },
    { provide: SUBCONTRACTOR_INSURANCE_REPOSITORY, useClass: PrismaSubcontractorInsuranceRepository },
    { provide: SUBCONTRACTOR_PROFILE_DOCUMENT_REPOSITORY, useClass: PrismaSubcontractorProfileDocumentRepository },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
  ],
  // V2 Sprint 6 — réexportés UNIQUEMENT pour le nouveau module `checklist-intelligence`
  // (rapprochement documentaire, lecture seule, voir index.ts).
  exports: [GetSubcontractorProfileUseCase, ListSubcontractorCertificationsUseCase, ListSubcontractorInsurancesUseCase],
})
export class SubcontractorsModule {}
