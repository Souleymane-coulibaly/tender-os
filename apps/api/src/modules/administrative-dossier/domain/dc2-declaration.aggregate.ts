export type Dc2DeclarationProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  currentVersionNumber: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Sprint 8C Phase 2 — mission §11 : une déclaration DC2 par Tender, plusieurs versions
 * (`Dc2DeclarationVersion`) — "les données utilisées dans une révision validée doivent rester
 * reproductibles... jamais recalculer un ancien document avec les données courantes sans nouvelle
 * révision." Ce parent ne porte AUCUNE donnée métier lui-même, seulement le pointeur vers la
 * version courante — même séparation que `DeliverableTemplate`/`DeliverableTemplateVersion`.
 */
export class Dc2Declaration {
  private constructor(private props: Dc2DeclarationProps) {}

  static create(input: { id: string; organizationId: string; tenderId: string; createdBy: string; occurredAt: Date }): Dc2Declaration {
    return new Dc2Declaration({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      currentVersionNumber: 0,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: Dc2DeclarationProps): Dc2Declaration {
    return new Dc2Declaration(props);
  }

  /** Appelé UNIQUEMENT après la création réussie d'une nouvelle `Dc2DeclarationVersion` — jamais un
   *  compteur avancé sans la version correspondante réellement persistée. */
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
