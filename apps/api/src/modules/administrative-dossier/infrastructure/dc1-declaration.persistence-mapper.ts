import { Dc1Declaration } from "../domain/dc1-declaration.aggregate";
import type { Dc1CandidateType } from "../domain/dc1-declaration.aggregate";

export type PersistedDc1Declaration = {
  id: string;
  organizationId: string;
  tenderId: string;
  candidateType: string;
  consortiumId: string | null;
  declarations: string | null;
  signatoryName: string | null;
  signatoryCapacity: string | null;
  signingPowerId: string | null;
  administrativeDocumentId: string | null;
  exclusionAttestation: boolean | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toDomainDc1Declaration(record: PersistedDc1Declaration): Dc1Declaration {
  return Dc1Declaration.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    candidateType: record.candidateType as Dc1CandidateType,
    consortiumId: record.consortiumId ?? undefined,
    declarations: record.declarations ?? undefined,
    signatoryName: record.signatoryName ?? undefined,
    signatoryCapacity: record.signatoryCapacity ?? undefined,
    signingPowerId: record.signingPowerId ?? undefined,
    administrativeDocumentId: record.administrativeDocumentId ?? undefined,
    exclusionAttestation: record.exclusionAttestation ?? undefined,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toDc1DeclarationRow(declaration: Dc1Declaration) {
  return {
    id: declaration.id,
    organizationId: declaration.organizationId,
    tenderId: declaration.tenderId,
    candidateType: declaration.candidateType,
    consortiumId: declaration.consortiumId ?? null,
    declarations: declaration.declarations ?? null,
    signatoryName: declaration.signatoryName ?? null,
    signatoryCapacity: declaration.signatoryCapacity ?? null,
    signingPowerId: declaration.signingPowerId ?? null,
    administrativeDocumentId: declaration.administrativeDocumentId ?? null,
    exclusionAttestation: declaration.exclusionAttestation ?? null,
    createdBy: declaration.createdBy,
    createdAt: declaration.createdAt,
    updatedAt: declaration.updatedAt,
  };
}
