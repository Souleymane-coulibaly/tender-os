import type { Consortium, ConsortiumMember } from "../domain/consortium.aggregate";
import type { Dc1Declaration } from "../domain/dc1-declaration.aggregate";
import type { Dc2Declaration } from "../domain/dc2-declaration.aggregate";
import type { Dc2DeclarationVersion } from "../domain/dc2-declaration-version.entity";
import type { DumeDeclaration } from "../domain/dume-declaration.aggregate";
import type { DumeDeclarationVersion } from "../domain/dume-declaration-version.entity";
import type { EngagementAct } from "../domain/engagement-act.aggregate";
import type { SigningPower } from "../domain/signing-power.aggregate";
import { deriveSigningPowerStatus } from "../domain/signing-power-status";
import type { SubcontractorDeclaration } from "../domain/subcontractor-declaration.aggregate";
import type { StructuredCapacityStatement } from "../domain/structured-capacity-statement";

export type ConsortiumSummary = {
  id: string;
  tenderId: string;
  type: string;
  legalForm?: string | undefined;
  liabilityMode?: string | undefined;
  mandataireMemberId?: string | undefined;
  members: readonly ConsortiumMember[];
  createdAt: string;
  updatedAt: string;
};
export function toConsortiumSummary(consortium: Consortium): ConsortiumSummary {
  return {
    id: consortium.id,
    tenderId: consortium.tenderId,
    type: consortium.type,
    legalForm: consortium.legalForm,
    liabilityMode: consortium.liabilityMode,
    mandataireMemberId: consortium.mandataireMemberId,
    members: consortium.members,
    createdAt: consortium.createdAt.toISOString(),
    updatedAt: consortium.updatedAt.toISOString(),
  };
}

export type Dc1DeclarationSummary = {
  id: string;
  tenderId: string;
  candidateType: string;
  consortiumId?: string | undefined;
  declarations?: string | undefined;
  signatoryName?: string | undefined;
  signatoryCapacity?: string | undefined;
  signingPowerId?: string | undefined;
  administrativeDocumentId?: string | undefined;
  createdAt: string;
  updatedAt: string;
};
export function toDc1DeclarationSummary(dc1: Dc1Declaration): Dc1DeclarationSummary {
  return {
    id: dc1.id,
    tenderId: dc1.tenderId,
    candidateType: dc1.candidateType,
    consortiumId: dc1.consortiumId,
    declarations: dc1.declarations,
    signatoryName: dc1.signatoryName,
    signatoryCapacity: dc1.signatoryCapacity,
    signingPowerId: dc1.signingPowerId,
    administrativeDocumentId: dc1.administrativeDocumentId,
    createdAt: dc1.createdAt.toISOString(),
    updatedAt: dc1.updatedAt.toISOString(),
  };
}

export type Dc2DeclarationVersionSummary = { id: string; dc2DeclarationId: string; version: number; data: StructuredCapacityStatement; createdBy: string; createdAt: string };
export function toDc2DeclarationVersionSummary(version: Dc2DeclarationVersion): Dc2DeclarationVersionSummary {
  return { id: version.id, dc2DeclarationId: version.dc2DeclarationId, version: version.version, data: version.data, createdBy: version.createdBy, createdAt: version.createdAt.toISOString() };
}
export type Dc2DeclarationSummary = { id: string; tenderId: string; currentVersionNumber: number; createdAt: string; updatedAt: string };
export function toDc2DeclarationSummary(dc2: Dc2Declaration): Dc2DeclarationSummary {
  return { id: dc2.id, tenderId: dc2.tenderId, currentVersionNumber: dc2.currentVersionNumber, createdAt: dc2.createdAt.toISOString(), updatedAt: dc2.updatedAt.toISOString() };
}

export type DumeDeclarationVersionSummary = { id: string; dumeDeclarationId: string; version: number; data: StructuredCapacityStatement; createdBy: string; createdAt: string };
export function toDumeDeclarationVersionSummary(version: DumeDeclarationVersion): DumeDeclarationVersionSummary {
  return { id: version.id, dumeDeclarationId: version.dumeDeclarationId, version: version.version, data: version.data, createdBy: version.createdBy, createdAt: version.createdAt.toISOString() };
}
export type DumeDeclarationSummary = { id: string; tenderId: string; currentVersionNumber: number; createdAt: string; updatedAt: string };
export function toDumeDeclarationSummary(dume: DumeDeclaration): DumeDeclarationSummary {
  return { id: dume.id, tenderId: dume.tenderId, currentVersionNumber: dume.currentVersionNumber, createdAt: dume.createdAt.toISOString(), updatedAt: dume.updatedAt.toISOString() };
}

export type SubcontractorDeclarationSummary = {
  id: string;
  tenderId: string;
  subcontractorName: string;
  subcontractorLegalIdentifier?: string | undefined;
  servicesDescription: string;
  amountValue: number;
  amountCurrency: string;
  percentageOfTotal?: number | undefined;
  paymentTerms?: string | undefined;
  directPaymentApplicable?: boolean | undefined;
  requiredDocuments: readonly string[];
  administrativeDocumentId?: string | undefined;
  createdAt: string;
  updatedAt: string;
};
export function toSubcontractorDeclarationSummary(sub: SubcontractorDeclaration): SubcontractorDeclarationSummary {
  return {
    id: sub.id,
    tenderId: sub.tenderId,
    subcontractorName: sub.subcontractorName,
    subcontractorLegalIdentifier: sub.subcontractorLegalIdentifier,
    servicesDescription: sub.servicesDescription,
    amountValue: sub.amountValue,
    amountCurrency: sub.amountCurrency,
    percentageOfTotal: sub.percentageOfTotal,
    paymentTerms: sub.paymentTerms,
    directPaymentApplicable: sub.directPaymentApplicable,
    requiredDocuments: sub.requiredDocuments,
    administrativeDocumentId: sub.administrativeDocumentId,
    createdAt: sub.createdAt.toISOString(),
    updatedAt: sub.updatedAt.toISOString(),
  };
}

export type EngagementActSummary = {
  id: string;
  tenderId: string;
  reference?: string | undefined;
  lotReference?: string | undefined;
  object?: string | undefined;
  durationMonths?: number | undefined;
  variants?: string | undefined;
  subcontractingSummary?: string | undefined;
  ribDocumentId?: string | undefined;
  signatoryName?: string | undefined;
  signatoryCapacity?: string | undefined;
  administrativeDocumentId?: string | undefined;
  pricingEstimateId?: string | undefined;
  pricingEstimateVersionNumber?: number | undefined;
  frozenAmountValue?: number | undefined;
  frozenAmountCurrency?: string | undefined;
  frozenAt?: string | undefined;
  frozenBy?: string | undefined;
  createdAt: string;
  updatedAt: string;
};
export function toEngagementActSummary(act: EngagementAct): EngagementActSummary {
  return {
    id: act.id,
    tenderId: act.tenderId,
    reference: act.reference,
    lotReference: act.lotReference,
    object: act.object,
    durationMonths: act.durationMonths,
    variants: act.variants,
    subcontractingSummary: act.subcontractingSummary,
    ribDocumentId: act.ribDocumentId,
    signatoryName: act.signatoryName,
    signatoryCapacity: act.signatoryCapacity,
    administrativeDocumentId: act.administrativeDocumentId,
    pricingEstimateId: act.pricingEstimateId,
    pricingEstimateVersionNumber: act.pricingEstimateVersionNumber,
    frozenAmountValue: act.frozenAmountValue,
    frozenAmountCurrency: act.frozenAmountCurrency,
    frozenAt: act.frozenAt?.toISOString(),
    frozenBy: act.frozenBy,
    createdAt: act.createdAt.toISOString(),
    updatedAt: act.updatedAt.toISOString(),
  };
}

export type SigningPowerSummary = {
  id: string;
  tenderId: string;
  holderName: string;
  representedEntityDescription: string;
  administrativeDocumentId?: string | undefined;
  validFrom?: string | undefined;
  expiresAt?: string | undefined;
  scope: string;
  limitations?: string | undefined;
  verifiedBy?: string | undefined;
  verifiedAt?: string | undefined;
  status: string;
  createdAt: string;
  updatedAt: string;
};
export function toSigningPowerSummary(power: SigningPower, now: Date): SigningPowerSummary {
  return {
    id: power.id,
    tenderId: power.tenderId,
    holderName: power.holderName,
    representedEntityDescription: power.representedEntityDescription,
    administrativeDocumentId: power.administrativeDocumentId,
    validFrom: power.validFrom?.toISOString(),
    expiresAt: power.expiresAt?.toISOString(),
    scope: power.scope,
    limitations: power.limitations,
    verifiedBy: power.verifiedBy,
    verifiedAt: power.verifiedAt?.toISOString(),
    status: deriveSigningPowerStatus({ verifiedAt: power.verifiedAt, expiresAt: power.expiresAt, now }),
    createdAt: power.createdAt.toISOString(),
    updatedAt: power.updatedAt.toISOString(),
  };
}
