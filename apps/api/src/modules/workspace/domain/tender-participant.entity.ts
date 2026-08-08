/** V2 Sprint 7 §8 — décrit la FONCTION du participant dans l'équipe, jamais une autorité de
 *  validation (celle-ci reste entièrement dérivée de `ClientPermission.ValidateWorkspace`, mission
 *  §41 — voir `workspace-authorization.policy.ts`). Distinct du "responsable du dossier"
 *  (`Tender.internalOwnerId`, déjà existant depuis Sprint 3, réutilisé tel quel pour mission §9 —
 *  jamais recréé ici). */
export const TenderCollaborativeRole = {
  TenderManager: "TENDER_MANAGER",
  AdministrativeResponsible: "ADMINISTRATIVE_RESPONSIBLE",
  TechnicalWriter: "TECHNICAL_WRITER",
  FinancialResponsible: "FINANCIAL_RESPONSIBLE",
  Reviewer: "REVIEWER",
  Signatory: "SIGNATORY",
  Viewer: "VIEWER",
} as const;
export type TenderCollaborativeRole = (typeof TenderCollaborativeRole)[keyof typeof TenderCollaborativeRole];

export type TenderParticipantProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  userId: string;
  role: TenderCollaborativeRole;
  addedBy: string;
  addedAt: Date;
  removedBy?: string | undefined;
  removedAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
};

/** V2 Sprint 7 §7 — source UNIQUE de vérité pour "qui peut être assigné/mentionné/reviewer sur ce
 *  Tender" (voir `AddTenderParticipantUseCase` pour la validation d'appartenance organisation +
 *  accès client, faite UNE SEULE FOIS à l'ajout, jamais re-dérivée à chaque assignation ailleurs).
 *  Retrait toujours "soft" (mission §49/§50) : l'historique (tâches, commentaires, activité) reste
 *  attribuable après retrait, jamais une suppression physique. */
export class TenderParticipant {
  private constructor(private props: TenderParticipantProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    userId: string;
    role: TenderCollaborativeRole;
    addedBy: string;
    occurredAt: Date;
  }): TenderParticipant {
    return new TenderParticipant({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      userId: input.userId,
      role: input.role,
      addedBy: input.addedBy,
      addedAt: input.occurredAt,
      removedBy: undefined,
      removedAt: undefined,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: TenderParticipantProps): TenderParticipant {
    return new TenderParticipant(props);
  }

  changeRole(role: TenderCollaborativeRole, occurredAt: Date): void {
    this.props.role = role;
    this.props.updatedAt = occurredAt;
  }

  remove(removedBy: string, occurredAt: Date): void {
    this.props.removedAt = occurredAt;
    this.props.removedBy = removedBy;
    this.props.updatedAt = occurredAt;
  }

  get isActive(): boolean {
    return this.props.removedAt === undefined;
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
  get userId(): string {
    return this.props.userId;
  }
  get role(): TenderCollaborativeRole {
    return this.props.role;
  }
  get addedBy(): string {
    return this.props.addedBy;
  }
  get addedAt(): Date {
    return this.props.addedAt;
  }
  get removedBy(): string | undefined {
    return this.props.removedBy;
  }
  get removedAt(): Date | undefined {
    return this.props.removedAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
