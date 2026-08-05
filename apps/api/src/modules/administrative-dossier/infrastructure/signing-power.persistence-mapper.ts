import { SigningPower } from "../domain/signing-power.aggregate";

export type PersistedSigningPower = {
  id: string;
  organizationId: string;
  tenderId: string;
  holderName: string;
  representedEntityDescription: string;
  administrativeDocumentId: string | null;
  validFrom: Date | null;
  expiresAt: Date | null;
  scope: string;
  limitations: string | null;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toDomainSigningPower(record: PersistedSigningPower): SigningPower {
  return SigningPower.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    holderName: record.holderName,
    representedEntityDescription: record.representedEntityDescription,
    administrativeDocumentId: record.administrativeDocumentId ?? undefined,
    validFrom: record.validFrom ?? undefined,
    expiresAt: record.expiresAt ?? undefined,
    scope: record.scope,
    limitations: record.limitations ?? undefined,
    verifiedBy: record.verifiedBy ?? undefined,
    verifiedAt: record.verifiedAt ?? undefined,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toSigningPowerRow(power: SigningPower) {
  return {
    id: power.id,
    organizationId: power.organizationId,
    tenderId: power.tenderId,
    holderName: power.holderName,
    representedEntityDescription: power.representedEntityDescription,
    administrativeDocumentId: power.administrativeDocumentId ?? null,
    validFrom: power.validFrom ?? null,
    expiresAt: power.expiresAt ?? null,
    scope: power.scope,
    limitations: power.limitations ?? null,
    verifiedBy: power.verifiedBy ?? null,
    verifiedAt: power.verifiedAt ?? null,
    createdBy: power.createdBy,
    createdAt: power.createdAt,
    updatedAt: power.updatedAt,
  };
}
