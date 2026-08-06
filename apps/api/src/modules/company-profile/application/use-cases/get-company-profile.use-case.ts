import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../../client-portfolio";
import { computeTemporalValidityStatus, TemporalValidityStatus } from "../../domain/enums";
import type {
  CompanyBankAccountRecord,
  CompanyCertificationRecord,
  CompanyHumanResourceRecord,
  CompanyInsuranceRecord,
  CompanyLegalIdentityRecord,
  CompanyMaterialResourceRecord,
  CompanyReferenceRecord,
  CompanyRepresentativeRecord,
  DocumentClientAccountAssociationRecord,
} from "../dtos";
import {
  COMPANY_BANK_ACCOUNT_REPOSITORY,
  COMPANY_CERTIFICATION_REPOSITORY,
  COMPANY_HUMAN_RESOURCE_REPOSITORY,
  COMPANY_INSURANCE_REPOSITORY,
  COMPANY_LEGAL_IDENTITY_REPOSITORY,
  COMPANY_MATERIAL_RESOURCE_REPOSITORY,
  COMPANY_REFERENCE_REPOSITORY,
  COMPANY_REPRESENTATIVE_REPOSITORY,
  DOCUMENT_CLIENT_ACCOUNT_ASSOCIATION_REPOSITORY,
  type CompanyBankAccountRepository,
  type CompanyCertificationRepository,
  type CompanyHumanResourceRepository,
  type CompanyInsuranceRepository,
  type CompanyLegalIdentityRepository,
  type CompanyMaterialResourceRepository,
  type CompanyReferenceRepository,
  type CompanyRepresentativeRepository,
  type DocumentClientAccountAssociationRepository,
} from "../ports/company-satellite.repository";
import { CompanyProfileAccessService } from "../services/company-profile-access.service";

/** Mission §8 : un statut par catégorie, jamais un score commercial/GO-NO-GO. Purement déterministe
 *  et calculé à la lecture — même discipline que `computeTemporalValidityStatus`. */
export const CompanyProfileCategoryStatus = {
  Complete: "COMPLETE",
  Partial: "PARTIAL",
  Missing: "MISSING",
  Expired: "EXPIRED",
  ToVerify: "TO_VERIFY",
} as const;
export type CompanyProfileCategoryStatus = (typeof CompanyProfileCategoryStatus)[keyof typeof CompanyProfileCategoryStatus];

export type CompanyProfileSummary = Readonly<{
  clientAccountId: string;
  legalIdentity: CompanyLegalIdentityRecord | null;
  representatives: readonly CompanyRepresentativeRecord[];
  bankAccounts: readonly CompanyBankAccountRecord[];
  insurances: readonly (CompanyInsuranceRecord & { temporalStatus: TemporalValidityStatus })[];
  certifications: readonly (CompanyCertificationRecord & { temporalStatus: TemporalValidityStatus })[];
  references: readonly CompanyReferenceRecord[];
  humanResources: readonly CompanyHumanResourceRecord[];
  materialResources: readonly CompanyMaterialResourceRecord[];
  documents: readonly DocumentClientAccountAssociationRecord[];
  completeness: Readonly<{
    identity: CompanyProfileCategoryStatus;
    banking: CompanyProfileCategoryStatus;
    insurances: CompanyProfileCategoryStatus;
    certifications: CompanyProfileCategoryStatus;
    references: CompanyProfileCategoryStatus;
    resources: CompanyProfileCategoryStatus;
    documents: CompanyProfileCategoryStatus;
  }>;
}>;

/**
 * Agrège tous les satellites d'une entreprise candidate + calcule un indicateur de complétude PAR
 * CATÉGORIE, explicable et vérifiable (mission §8) — jamais un score global unique, jamais une
 * notion commerciale/GO-NO-GO (explicitement hors périmètre Sprint 2).
 */
@Injectable()
export class GetCompanyProfileUseCase {
  constructor(
    @Inject(COMPANY_LEGAL_IDENTITY_REPOSITORY) private readonly legalIdentityRepository: CompanyLegalIdentityRepository,
    @Inject(COMPANY_REPRESENTATIVE_REPOSITORY) private readonly representativeRepository: CompanyRepresentativeRepository,
    @Inject(COMPANY_BANK_ACCOUNT_REPOSITORY) private readonly bankAccountRepository: CompanyBankAccountRepository,
    @Inject(COMPANY_INSURANCE_REPOSITORY) private readonly insuranceRepository: CompanyInsuranceRepository,
    @Inject(COMPANY_CERTIFICATION_REPOSITORY) private readonly certificationRepository: CompanyCertificationRepository,
    @Inject(COMPANY_REFERENCE_REPOSITORY) private readonly referenceRepository: CompanyReferenceRepository,
    @Inject(COMPANY_HUMAN_RESOURCE_REPOSITORY) private readonly humanResourceRepository: CompanyHumanResourceRepository,
    @Inject(COMPANY_MATERIAL_RESOURCE_REPOSITORY) private readonly materialResourceRepository: CompanyMaterialResourceRepository,
    @Inject(DOCUMENT_CLIENT_ACCOUNT_ASSOCIATION_REPOSITORY) private readonly documentRepository: DocumentClientAccountAssociationRepository,
    private readonly accessService: CompanyProfileAccessService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: { organizationId: string; clientAccountId: string; actorId: string; actorRole: string }): Promise<CompanyProfileSummary> {
    await this.accessService.assertClientAccess({ ...input, permission: ClientPermission.ReadCompanyProfile });

    const now = this.clock.now();
    const scope = { organizationId: input.organizationId, clientAccountId: input.clientAccountId };

    const [legalIdentity, representatives, bankAccounts, insurancesRaw, certificationsRaw, references, humanResources, materialResources, documents] = await Promise.all([
      this.legalIdentityRepository.findByClientAccount(scope),
      this.representativeRepository.list(scope),
      this.bankAccountRepository.list(scope),
      this.insuranceRepository.list(scope),
      this.certificationRepository.list(scope),
      this.referenceRepository.list(scope),
      this.humanResourceRepository.list(scope),
      this.materialResourceRepository.list(scope),
      this.documentRepository.list(scope),
    ]);

    const insurances = insurancesRaw.map((insurance) => ({ ...insurance, temporalStatus: computeTemporalValidityStatus(insurance.expiresAt, now) }));
    const certifications = certificationsRaw.map((certification) => ({ ...certification, temporalStatus: computeTemporalValidityStatus(certification.expiresAt, now) }));

    const activeBankAccounts = bankAccounts.filter((account) => account.status === "ACTIVE");
    const activeInsurances = insurances.filter((insurance) => insurance.status === "ACTIVE");
    const activeCertifications = certifications.filter((certification) => certification.status === "ACTIVE");
    const activeHumanResources = humanResources.filter((resource) => resource.status === "ACTIVE");
    const activeMaterialResources = materialResources.filter((resource) => resource.status === "ACTIVE");

    return {
      clientAccountId: input.clientAccountId,
      legalIdentity,
      representatives,
      bankAccounts,
      insurances,
      certifications,
      references,
      humanResources,
      materialResources,
      documents,
      completeness: {
        identity: computeIdentityStatus(legalIdentity),
        banking: activeBankAccounts.length === 0 ? CompanyProfileCategoryStatus.Missing : CompanyProfileCategoryStatus.Complete,
        insurances: computeTemporalCategoryStatus(activeInsurances),
        certifications: computeTemporalCategoryStatus(activeCertifications),
        references: references.length === 0 ? CompanyProfileCategoryStatus.Missing : CompanyProfileCategoryStatus.Complete,
        resources: activeHumanResources.length === 0 && activeMaterialResources.length === 0 ? CompanyProfileCategoryStatus.Missing : CompanyProfileCategoryStatus.Complete,
        documents: documents.length === 0 ? CompanyProfileCategoryStatus.Missing : CompanyProfileCategoryStatus.Complete,
      },
    };
  }
}

function computeIdentityStatus(legalIdentity: CompanyLegalIdentityRecord | null): CompanyProfileCategoryStatus {
  if (!legalIdentity) {
    return CompanyProfileCategoryStatus.Missing;
  }
  const requiredFields = [legalIdentity.legalName, legalIdentity.siren, legalIdentity.siretPrincipal, legalIdentity.addressLine, legalIdentity.postalCode, legalIdentity.city];
  const filledCount = requiredFields.filter((value) => value !== null && value !== "").length;
  if (filledCount === requiredFields.length) {
    return CompanyProfileCategoryStatus.Complete;
  }
  if (filledCount === 0) {
    return CompanyProfileCategoryStatus.Missing;
  }
  return CompanyProfileCategoryStatus.Partial;
}

function computeTemporalCategoryStatus(items: readonly { temporalStatus: TemporalValidityStatus }[]): CompanyProfileCategoryStatus {
  if (items.length === 0) {
    return CompanyProfileCategoryStatus.Missing;
  }
  if (items.some((item) => item.temporalStatus === TemporalValidityStatus.Expired)) {
    return CompanyProfileCategoryStatus.Expired;
  }
  if (items.some((item) => item.temporalStatus === TemporalValidityStatus.ExpiringSoon)) {
    return CompanyProfileCategoryStatus.ToVerify;
  }
  return CompanyProfileCategoryStatus.Complete;
}
