import { EngagementAct } from "../domain/engagement-act.aggregate";

export type PersistedEngagementAct = {
  id: string;
  organizationId: string;
  tenderId: string;
  reference: string | null;
  lotReference: string | null;
  object: string | null;
  durationMonths: number | null;
  variants: string | null;
  subcontractingSummary: string | null;
  ribDocumentId: string | null;
  signatoryName: string | null;
  signatoryCapacity: string | null;
  administrativeDocumentId: string | null;
  pricingEstimateId: string | null;
  pricingEstimateVersionNumber: number | null;
  frozenAmountValue: unknown;
  frozenAmountCurrency: string | null;
  frozenAt: Date | null;
  frozenBy: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toDomainEngagementAct(record: PersistedEngagementAct): EngagementAct {
  return EngagementAct.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    reference: record.reference ?? undefined,
    lotReference: record.lotReference ?? undefined,
    object: record.object ?? undefined,
    durationMonths: record.durationMonths ?? undefined,
    variants: record.variants ?? undefined,
    subcontractingSummary: record.subcontractingSummary ?? undefined,
    ribDocumentId: record.ribDocumentId ?? undefined,
    signatoryName: record.signatoryName ?? undefined,
    signatoryCapacity: record.signatoryCapacity ?? undefined,
    administrativeDocumentId: record.administrativeDocumentId ?? undefined,
    pricingEstimateId: record.pricingEstimateId ?? undefined,
    pricingEstimateVersionNumber: record.pricingEstimateVersionNumber ?? undefined,
    frozenAmountValue: record.frozenAmountValue === null || record.frozenAmountValue === undefined ? undefined : Number(record.frozenAmountValue),
    frozenAmountCurrency: record.frozenAmountCurrency ?? undefined,
    frozenAt: record.frozenAt ?? undefined,
    frozenBy: record.frozenBy ?? undefined,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toEngagementActRow(act: EngagementAct) {
  return {
    id: act.id,
    organizationId: act.organizationId,
    tenderId: act.tenderId,
    reference: act.reference ?? null,
    lotReference: act.lotReference ?? null,
    object: act.object ?? null,
    durationMonths: act.durationMonths ?? null,
    variants: act.variants ?? null,
    subcontractingSummary: act.subcontractingSummary ?? null,
    ribDocumentId: act.ribDocumentId ?? null,
    signatoryName: act.signatoryName ?? null,
    signatoryCapacity: act.signatoryCapacity ?? null,
    administrativeDocumentId: act.administrativeDocumentId ?? null,
    pricingEstimateId: act.pricingEstimateId ?? null,
    pricingEstimateVersionNumber: act.pricingEstimateVersionNumber ?? null,
    frozenAmountValue: act.frozenAmountValue ?? null,
    frozenAmountCurrency: act.frozenAmountCurrency ?? null,
    frozenAt: act.frozenAt ?? null,
    frozenBy: act.frozenBy ?? null,
    createdBy: act.createdBy,
    createdAt: act.createdAt,
    updatedAt: act.updatedAt,
  };
}
