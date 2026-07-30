import type { ClientAccount as ClientAccountRecord } from "@prisma/client";
import { ClientAccount } from "../domain/client-account.aggregate";
import type { ClientAccountStatus } from "../domain/client-account-status";

export function toDomain(record: ClientAccountRecord): ClientAccount {
  return ClientAccount.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    name: record.name,
    nameNormalized: record.nameNormalized,
    legalName: record.legalName ?? undefined,
    reference: record.reference ?? undefined,
    sector: record.sector ?? undefined,
    country: record.country ?? undefined,
    address: record.address ?? undefined,
    website: record.website ?? undefined,
    notes: record.notes ?? undefined,
    status: record.status as ClientAccountStatus,
    createdBy: record.createdBy,
    updatedBy: record.updatedBy ?? undefined,
    archivedAt: record.archivedAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toPersistence(client: ClientAccount) {
  return {
    id: client.id,
    organizationId: client.organizationId,
    name: client.name,
    nameNormalized: client.nameNormalized,
    legalName: client.legalName ?? null,
    reference: client.reference ?? null,
    sector: client.sector ?? null,
    country: client.country ?? null,
    address: client.address ?? null,
    website: client.website ?? null,
    notes: client.notes ?? null,
    status: client.status,
    createdBy: client.createdBy,
    updatedBy: client.updatedBy ?? null,
    archivedAt: client.archivedAt ?? null,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  };
}
