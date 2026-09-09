import { Inject, Injectable } from "@nestjs/common";
import { isBankingDocumentCategory } from "../../domain/candidate-document-category";
import { computeTemporalValidityStatus, TemporalValidityStatus } from "../../domain/enums";
import type {
  CompanyCertificationRecord,
  CompanyHumanResourceRecord,
  CompanyInsuranceRecord,
  CompanyMaterialResourceRecord,
  CompanyReferenceRecord,
  CompanyRepresentativeRecord,
  DocumentCandidateCompanyAssociationRecord,
} from "../dtos";
import {
  COMPANY_CERTIFICATION_REPOSITORY,
  COMPANY_HUMAN_RESOURCE_REPOSITORY,
  COMPANY_INSURANCE_REPOSITORY,
  COMPANY_MATERIAL_RESOURCE_REPOSITORY,
  COMPANY_REFERENCE_REPOSITORY,
  COMPANY_REPRESENTATIVE_REPOSITORY,
  DOCUMENT_CANDIDATE_COMPANY_ASSOCIATION_REPOSITORY,
  type CompanyCertificationRepository,
  type CompanyHumanResourceRepository,
  type CompanyInsuranceRepository,
  type CompanyMaterialResourceRepository,
  type CompanyReferenceRepository,
  type CompanyRepresentativeRepository,
  type DocumentCandidateCompanyAssociationRepository,
} from "../ports/company-satellite.repository";

/**
 * Checkpoint TENDEROS-2.1-CCV2-E — point d'accès canonique UNIQUE aux CAPACITÉS de l'entreprise
 * candidate, strict pendant de `ResolveCandidateIdentityUseCase` (qui, lui, ne résout QUE
 * l'identité juridique).
 *
 * POURQUOI UN SEUL POINT D'ENTRÉE. Cinq consommateurs métier (Checklist, quick score, rapport
 * GO/NO-GO, mémoire technique, formulaires administratifs) avaient chacun leur propre manière
 * d'aller chercher — ou de ne pas aller chercher — les capacités du candidat. C'est exactement ce
 * qui a produit les écarts DEFERRED-BE-01/BE-02 : trois comportements différents pour la même
 * donnée absente. Un résolveur unique rend ces comportements impossibles à diverger de nouveau.
 *
 * AUCUN FALLBACK, JAMAIS. Appelé sans `candidateCompanyId` (Tender legacy, jamais rétroactivement
 * rempli), il retourne `source: "NONE"` et des collections VIDES — il ne va jamais lire le profil
 * du `ClientAccount`, ni via `clientAccountId`, ni via `sourceClientAccountId`. C'est à l'appelant
 * de décider explicitement s'il emprunte son propre chemin Legacy documenté ; ce use case ne le
 * fera jamais à sa place.
 *
 * BANCAIRE EXCLU PAR CONSTRUCTION. Ce résolveur ne lit NI `CompanyBankAccount`, NI les documents
 * de catégorie bancaire. Un générateur qui aurait besoin d'un RIB doit passer par la surface
 * bancaire dédiée, gardée par `candidate:read_banking` (CCV2-C.1) — jamais par le contexte de
 * capacités, qui alimente la Checklist, le GO/NO-GO et l'IA. Aucun IBAN ne peut donc fuiter dans
 * ces chemins, quelle que soit l'évolution future des appelants.
 */
export const CandidateCapabilitiesSource = {
  CandidateCompany: "CANDIDATE_COMPANY",
  None: "NONE",
} as const;
export type CandidateCapabilitiesSource = (typeof CandidateCapabilitiesSource)[keyof typeof CandidateCapabilitiesSource];

export type CandidateDocumentCapability = Readonly<{
  documentId: string;
  category: string;
  label: string | null;
  validUntil: Date | null;
  temporalStatus: TemporalValidityStatus;
}>;

export type CandidateCapabilitiesSummary = Readonly<{
  source: CandidateCapabilitiesSource;
  candidateCompanyId?: string | undefined;
  representatives: readonly CompanyRepresentativeRecord[];
  insurances: readonly (CompanyInsuranceRecord & { temporalStatus: TemporalValidityStatus })[];
  certifications: readonly (CompanyCertificationRecord & { temporalStatus: TemporalValidityStatus })[];
  references: readonly CompanyReferenceRecord[];
  humanResources: readonly CompanyHumanResourceRecord[];
  materialResources: readonly CompanyMaterialResourceRecord[];
  /** Bibliothèque documentaire candidate, HORS pièces bancaires (voir note de tête). */
  documents: readonly CandidateDocumentCapability[];
}>;

export type ResolveCandidateCapabilitiesQuery = Readonly<{
  organizationId: string;
  candidateCompanyId?: string | undefined;
  /** Injectable pour rendre les statuts temporels déterministes en test — jamais utilisé pour
   *  modifier une donnée, uniquement pour teinter la lecture. */
  now?: Date | undefined;
}>;

const EMPTY: CandidateCapabilitiesSummary = {
  source: CandidateCapabilitiesSource.None,
  representatives: [],
  insurances: [],
  certifications: [],
  references: [],
  humanResources: [],
  materialResources: [],
  documents: [],
};

/** Une capacité ARCHIVÉE n'est plus une capacité de l'entreprise : elle reste en base pour
 *  l'historique (aucune suppression physique dans ce domaine) mais ne doit jamais alimenter un
 *  matching, un score ou un mémoire technique. */
function isActive(record: { status: string }): boolean {
  return record.status !== "ARCHIVED";
}

@Injectable()
export class ResolveCandidateCapabilitiesUseCase {
  constructor(
    @Inject(COMPANY_REPRESENTATIVE_REPOSITORY) private readonly representatives: CompanyRepresentativeRepository,
    @Inject(COMPANY_INSURANCE_REPOSITORY) private readonly insurances: CompanyInsuranceRepository,
    @Inject(COMPANY_CERTIFICATION_REPOSITORY) private readonly certifications: CompanyCertificationRepository,
    @Inject(COMPANY_REFERENCE_REPOSITORY) private readonly references: CompanyReferenceRepository,
    @Inject(COMPANY_HUMAN_RESOURCE_REPOSITORY) private readonly humanResources: CompanyHumanResourceRepository,
    @Inject(COMPANY_MATERIAL_RESOURCE_REPOSITORY) private readonly materialResources: CompanyMaterialResourceRepository,
    @Inject(DOCUMENT_CANDIDATE_COMPANY_ASSOCIATION_REPOSITORY) private readonly documents: DocumentCandidateCompanyAssociationRepository,
  ) {}

  async execute(query: ResolveCandidateCapabilitiesQuery): Promise<CandidateCapabilitiesSummary> {
    if (query.candidateCompanyId === undefined) {
      return EMPTY;
    }

    const scope = { organizationId: query.organizationId, candidateCompanyId: query.candidateCompanyId };
    const now = query.now ?? new Date();

    const [representatives, insurances, certifications, references, humanResources, materialResources, documentAssociations] = await Promise.all([
      this.representatives.listByCandidate(scope),
      this.insurances.listByCandidate(scope),
      this.certifications.listByCandidate(scope),
      this.references.listByCandidate(scope),
      this.humanResources.listByCandidate(scope),
      this.materialResources.listByCandidate(scope),
      this.documents.list(scope),
    ]);

    return {
      source: CandidateCapabilitiesSource.CandidateCompany,
      candidateCompanyId: query.candidateCompanyId,
      representatives: representatives.filter(isActive),
      insurances: insurances.filter(isActive).map((insurance) => ({ ...insurance, temporalStatus: computeTemporalValidityStatus(insurance.expiresAt, now) })),
      certifications: certifications.filter(isActive).map((certification) => ({ ...certification, temporalStatus: computeTemporalValidityStatus(certification.expiresAt, now) })),
      references: references.filter(isActive),
      humanResources: humanResources.filter(isActive),
      materialResources: materialResources.filter(isActive),
      documents: documentAssociations.filter((association) => !isBankingDocumentCategory(association.category)).map((association) => toDocumentCapability(association, now)),
    };
  }
}

function toDocumentCapability(association: DocumentCandidateCompanyAssociationRecord, now: Date): CandidateDocumentCapability {
  return {
    documentId: association.documentId,
    category: association.category,
    label: association.label,
    validUntil: association.validUntil,
    temporalStatus: computeTemporalValidityStatus(association.validUntil, now),
  };
}

/** Un justificatif PÉRIMÉ ne satisfait jamais une exigence courante — règle partagée par tous les
 *  consommateurs, définie ici plutôt que réinventée dans chacun. `EXPIRING_SOON` reste valide :
 *  c'est un signal, pas une invalidation. */
export function satisfiesRequirementNow(temporalStatus: TemporalValidityStatus): boolean {
  return temporalStatus !== TemporalValidityStatus.Expired;
}
