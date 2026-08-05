import { Consortium, type ConsortiumMember, type ConsortiumType } from "../domain/consortium.aggregate";

export type PersistedConsortium = {
  id: string;
  organizationId: string;
  tenderId: string;
  type: string;
  legalForm: string | null;
  liabilityMode: string | null;
  mandataireMemberId: string | null;
  members: unknown;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toDomainConsortium(record: PersistedConsortium): Consortium {
  return Consortium.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    type: record.type as ConsortiumType,
    legalForm: record.legalForm ?? undefined,
    liabilityMode: record.liabilityMode ?? undefined,
    mandataireMemberId: record.mandataireMemberId ?? undefined,
    members: (record.members ?? []) as readonly ConsortiumMember[],
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toConsortiumRow(consortium: Consortium) {
  return {
    id: consortium.id,
    organizationId: consortium.organizationId,
    tenderId: consortium.tenderId,
    type: consortium.type,
    legalForm: consortium.legalForm ?? null,
    liabilityMode: consortium.liabilityMode ?? null,
    mandataireMemberId: consortium.mandataireMemberId ?? null,
    members: consortium.members as unknown as object,
    createdBy: consortium.createdBy,
    createdAt: consortium.createdAt,
    updatedAt: consortium.updatedAt,
  };
}
