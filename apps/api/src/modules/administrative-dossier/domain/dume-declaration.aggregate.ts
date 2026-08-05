export type DumeDeclarationProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  currentVersionNumber: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Sprint 8C Phase 2 — mission §13 : capture structurée du DUME, une par Tender, versionnée (même
 * motif que `Dc2Declaration`). AUCUN export XML officiel, AUCUN dépôt automatique, AUCUNE
 * interopérabilité officielle prétendue — capture de données uniquement (mission "ne pas prétendre
 * supporter... sans implémentation et tests réels").
 */
export class DumeDeclaration {
  private constructor(private props: DumeDeclarationProps) {}

  static create(input: { id: string; organizationId: string; tenderId: string; createdBy: string; occurredAt: Date }): DumeDeclaration {
    return new DumeDeclaration({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      currentVersionNumber: 0,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: DumeDeclarationProps): DumeDeclaration {
    return new DumeDeclaration(props);
  }

  recordNewVersion(input: { versionNumber: number; occurredAt: Date }): void {
    this.props.currentVersionNumber = input.versionNumber;
    this.props.updatedAt = input.occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get tenderId(): string {
    return this.props.tenderId;
  }
  get currentVersionNumber(): number {
    return this.props.currentVersionNumber;
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
