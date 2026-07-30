import type { ClientAssignment as ClientAssignmentRecord } from "@prisma/client";
import { ClientAssignment } from "../domain/client-assignment.entity";
import type { ClientRole } from "../domain/client-role";

export function toDomain(record: ClientAssignmentRecord): ClientAssignment {
  return ClientAssignment.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    clientAccountId: record.clientAccountId,
    userId: record.userId,
    role: record.role as ClientRole,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toPersistence(assignment: ClientAssignment) {
  return {
    id: assignment.id,
    organizationId: assignment.organizationId,
    clientAccountId: assignment.clientAccountId,
    userId: assignment.userId,
    role: assignment.role,
    createdBy: assignment.createdBy,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
  };
}
