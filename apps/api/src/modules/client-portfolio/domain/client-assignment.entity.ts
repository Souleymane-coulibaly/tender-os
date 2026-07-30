import type { ClientRole } from "./client-role";

export type ClientAssignmentProps = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  userId: string;
  role: ClientRole;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Affectation d'un utilisateur à un client (mission Sprint 5.1 §"ClientAssignment") — entité pure,
 * jamais un agrégat au sens strict (pas de cycle de vie propre au-delà de create/update-role/
 * remove, portés par les use cases dédiés) : une seule ligne par (organizationId, clientAccountId,
 * userId), garantie par la contrainte unique (migration).
 */
export class ClientAssignment {
  private constructor(private props: ClientAssignmentProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    clientAccountId: string;
    userId: string;
    role: ClientRole;
    createdBy: string;
    occurredAt: Date;
  }): ClientAssignment {
    return new ClientAssignment({
      id: input.id,
      organizationId: input.organizationId,
      clientAccountId: input.clientAccountId,
      userId: input.userId,
      role: input.role,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: ClientAssignmentProps): ClientAssignment {
    return new ClientAssignment(props);
  }

  changeRole(role: ClientRole, occurredAt: Date): void {
    this.props.role = role;
    this.props.updatedAt = occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get clientAccountId(): string {
    return this.props.clientAccountId;
  }
  get userId(): string {
    return this.props.userId;
  }
  get role(): ClientRole {
    return this.props.role;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
