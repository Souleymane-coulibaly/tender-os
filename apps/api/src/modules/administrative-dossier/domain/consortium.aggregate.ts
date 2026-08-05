import { ConsortiumMandataireNotAMemberError, ConsortiumMemberPercentagesExceed100Error } from "./errors";

export const ConsortiumType = {
  Joint: "JOINT",
  Solidarity: "SOLIDARITY",
  Other: "OTHER",
} as const;

export type ConsortiumType = (typeof ConsortiumType)[keyof typeof ConsortiumType];

export type ConsortiumMember = Readonly<{
  memberId: string;
  name: string;
  legalIdentifier?: string | undefined;
  role: string;
  scopeDescription?: string | undefined;
  percentage?: number | undefined;
}>;

export type ConsortiumProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  type: ConsortiumType;
  legalForm?: string | undefined;
  liabilityMode?: string | undefined;
  mandataireMemberId?: string | undefined;
  members: readonly ConsortiumMember[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Sprint 8C Phase 2 — mission §15 : un groupement par Tender (candidat individuel = pas de
 * Consortium du tout, `Dc1Declaration.candidateType = INDIVIDUAL` sans `consortiumId`). Les membres
 * sont des données de valeur bornées à la vie du groupement (mission — "chaque membre... rôle,
 * périmètre, pourcentage"), persistées en JSON (même motif que `PricingEstimateVersion.breakdown`)
 * plutôt qu'une table enfant séparée — aucune identité/cycle de vie propre au-delà du groupement.
 */
export class Consortium {
  private constructor(private props: ConsortiumProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    type: ConsortiumType;
    legalForm?: string | undefined;
    liabilityMode?: string | undefined;
    createdBy: string;
    occurredAt: Date;
  }): Consortium {
    return new Consortium({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      type: input.type,
      legalForm: input.legalForm,
      liabilityMode: input.liabilityMode,
      members: [],
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: ConsortiumProps): Consortium {
    return new Consortium(props);
  }

  update(input: { type?: ConsortiumType | undefined; legalForm?: string | undefined; liabilityMode?: string | undefined; occurredAt: Date }): void {
    if (input.type !== undefined) this.props.type = input.type;
    if (input.legalForm !== undefined) this.props.legalForm = input.legalForm;
    if (input.liabilityMode !== undefined) this.props.liabilityMode = input.liabilityMode;
    this.props.updatedAt = input.occurredAt;
  }

  /** Mission §15 — "cohérence des responsabilités et pourcentages" : refuse une somme > 100 dès
   *  qu'elle est vérifiable (seuls les membres avec un pourcentage renseigné comptent). */
  setMembers(input: { members: readonly ConsortiumMember[]; occurredAt: Date }): void {
    const totalPercentage = input.members.reduce((sum, m) => sum + (m.percentage ?? 0), 0);
    if (totalPercentage > 100) {
      throw new ConsortiumMemberPercentagesExceed100Error();
    }
    if (this.props.mandataireMemberId && !input.members.some((m) => m.memberId === this.props.mandataireMemberId)) {
      throw new ConsortiumMandataireNotAMemberError();
    }
    this.props.members = input.members;
    this.props.updatedAt = input.occurredAt;
  }

  /** Mission §15 — "le mandataire appartient au groupement" : jamais un membre absent de la liste. */
  setMandataire(input: { mandataireMemberId: string; occurredAt: Date }): void {
    if (!this.props.members.some((m) => m.memberId === input.mandataireMemberId)) {
      throw new ConsortiumMandataireNotAMemberError();
    }
    this.props.mandataireMemberId = input.mandataireMemberId;
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
  get type(): ConsortiumType {
    return this.props.type;
  }
  get legalForm(): string | undefined {
    return this.props.legalForm;
  }
  get liabilityMode(): string | undefined {
    return this.props.liabilityMode;
  }
  get mandataireMemberId(): string | undefined {
    return this.props.mandataireMemberId;
  }
  get members(): readonly ConsortiumMember[] {
    return this.props.members;
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
