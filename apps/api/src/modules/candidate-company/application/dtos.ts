import type { CandidateCompany } from "../domain/candidate-company.aggregate";
import type { CandidateEstablishment } from "../domain/candidate-establishment.entity";

export type CandidateCompanySummary = {
  id: string;
  organizationId: string;
  name: string;
  legalName?: string | undefined;
  siren?: string | undefined;
  vatNumber?: string | undefined;
  legalForm?: string | undefined;
  status: string;
  sourceClientAccountId?: string | undefined;
  createdBy: string;
  updatedBy?: string | undefined;
  archivedAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
};

export function toCandidateCompanySummary(company: CandidateCompany): CandidateCompanySummary {
  return {
    id: company.id,
    organizationId: company.organizationId,
    name: company.name,
    legalName: company.legalName,
    siren: company.siren,
    vatNumber: company.vatNumber,
    legalForm: company.legalForm,
    status: company.status,
    sourceClientAccountId: company.sourceClientAccountId,
    createdBy: company.createdBy,
    updatedBy: company.updatedBy,
    archivedAt: company.archivedAt?.toISOString(),
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
  };
}

export type CandidateEstablishmentSummary = {
  id: string;
  organizationId: string;
  candidateCompanyId: string;
  siret: string;
  label?: string | undefined;
  isPrincipal: boolean;
  addressLine?: string | undefined;
  postalCode?: string | undefined;
  city?: string | undefined;
  country?: string | undefined;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export function toCandidateEstablishmentSummary(establishment: CandidateEstablishment): CandidateEstablishmentSummary {
  return {
    id: establishment.id,
    organizationId: establishment.organizationId,
    candidateCompanyId: establishment.candidateCompanyId,
    siret: establishment.siret,
    label: establishment.label,
    isPrincipal: establishment.isPrincipal,
    addressLine: establishment.addressLine,
    postalCode: establishment.postalCode,
    city: establishment.city,
    country: establishment.country,
    createdBy: establishment.createdBy,
    createdAt: establishment.createdAt.toISOString(),
    updatedAt: establishment.updatedAt.toISOString(),
  };
}
