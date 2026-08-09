import { SubcontractorDeclaration } from "../domain/subcontractor-declaration.aggregate";
import type { AdministrativeDocumentType } from "../domain/administrative-document-type";

export type PersistedSubcontractorDeclaration = {
  id: string;
  organizationId: string;
  tenderId: string;
  subcontractorName: string;
  subcontractorLegalIdentifier: string | null;
  servicesDescription: string;
  amountValue: unknown;
  amountCurrency: string;
  percentageOfTotal: number | null;
  paymentTerms: string | null;
  directPaymentApplicable: boolean | null;
  requiredDocuments: unknown;
  administrativeDocumentId: string | null;
  subcontractorProfileId: string | null;
  durationMonths: number | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toDomainSubcontractorDeclaration(record: PersistedSubcontractorDeclaration): SubcontractorDeclaration {
  return SubcontractorDeclaration.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    subcontractorName: record.subcontractorName,
    subcontractorLegalIdentifier: record.subcontractorLegalIdentifier ?? undefined,
    servicesDescription: record.servicesDescription,
    amountValue: Number(record.amountValue),
    amountCurrency: record.amountCurrency,
    percentageOfTotal: record.percentageOfTotal ?? undefined,
    paymentTerms: record.paymentTerms ?? undefined,
    directPaymentApplicable: record.directPaymentApplicable ?? undefined,
    requiredDocuments: (record.requiredDocuments ?? []) as readonly AdministrativeDocumentType[],
    administrativeDocumentId: record.administrativeDocumentId ?? undefined,
    subcontractorProfileId: record.subcontractorProfileId ?? undefined,
    durationMonths: record.durationMonths ?? undefined,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toSubcontractorDeclarationRow(declaration: SubcontractorDeclaration) {
  return {
    id: declaration.id,
    organizationId: declaration.organizationId,
    tenderId: declaration.tenderId,
    subcontractorName: declaration.subcontractorName,
    subcontractorLegalIdentifier: declaration.subcontractorLegalIdentifier ?? null,
    servicesDescription: declaration.servicesDescription,
    amountValue: declaration.amountValue,
    amountCurrency: declaration.amountCurrency,
    percentageOfTotal: declaration.percentageOfTotal ?? null,
    paymentTerms: declaration.paymentTerms ?? null,
    directPaymentApplicable: declaration.directPaymentApplicable ?? null,
    requiredDocuments: declaration.requiredDocuments as unknown as object,
    administrativeDocumentId: declaration.administrativeDocumentId ?? null,
    subcontractorProfileId: declaration.subcontractorProfileId ?? null,
    durationMonths: declaration.durationMonths ?? null,
    createdBy: declaration.createdBy,
    createdAt: declaration.createdAt,
    updatedAt: declaration.updatedAt,
  };
}
