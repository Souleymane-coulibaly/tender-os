import type { CandidateEstablishment as CandidateEstablishmentRecord } from "@prisma/client";
import { CandidateEstablishment } from "../domain/candidate-establishment.entity";

export function toDomain(record: CandidateEstablishmentRecord): CandidateEstablishment {
  return CandidateEstablishment.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    candidateCompanyId: record.candidateCompanyId,
    siret: record.siret,
    label: record.label ?? undefined,
    isPrincipal: record.isPrincipal,
    addressLine: record.addressLine ?? undefined,
    postalCode: record.postalCode ?? undefined,
    city: record.city ?? undefined,
    country: record.country ?? undefined,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toPersistence(establishment: CandidateEstablishment) {
  return {
    id: establishment.id,
    organizationId: establishment.organizationId,
    candidateCompanyId: establishment.candidateCompanyId,
    siret: establishment.siret,
    label: establishment.label ?? null,
    isPrincipal: establishment.isPrincipal,
    addressLine: establishment.addressLine ?? null,
    postalCode: establishment.postalCode ?? null,
    city: establishment.city ?? null,
    country: establishment.country ?? null,
    createdBy: establishment.createdBy,
    createdAt: establishment.createdAt,
    updatedAt: establishment.updatedAt,
  };
}
