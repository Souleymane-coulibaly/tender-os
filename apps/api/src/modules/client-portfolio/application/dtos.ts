import type { ClientAccount } from "../domain/client-account.aggregate";
import type { ClientAssignment } from "../domain/client-assignment.entity";

export type ClientAccountSummary = {
  id: string;
  organizationId: string;
  name: string;
  legalName?: string | undefined;
  reference?: string | undefined;
  sector?: string | undefined;
  country?: string | undefined;
  address?: string | undefined;
  website?: string | undefined;
  notes?: string | undefined;
  status: string;
  createdBy: string;
  updatedBy?: string | undefined;
  archivedAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
};

export function toClientAccountSummary(client: ClientAccount): ClientAccountSummary {
  return {
    id: client.id,
    organizationId: client.organizationId,
    name: client.name,
    legalName: client.legalName,
    reference: client.reference,
    sector: client.sector,
    country: client.country,
    address: client.address,
    website: client.website,
    notes: client.notes,
    status: client.status,
    createdBy: client.createdBy,
    updatedBy: client.updatedBy,
    archivedAt: client.archivedAt?.toISOString(),
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
  };
}

export type ClientAssignmentSummary = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  userId: string;
  role: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export function toClientAssignmentSummary(assignment: ClientAssignment): ClientAssignmentSummary {
  return {
    id: assignment.id,
    organizationId: assignment.organizationId,
    clientAccountId: assignment.clientAccountId,
    userId: assignment.userId,
    role: assignment.role,
    createdBy: assignment.createdBy,
    createdAt: assignment.createdAt.toISOString(),
    updatedAt: assignment.updatedAt.toISOString(),
  };
}
