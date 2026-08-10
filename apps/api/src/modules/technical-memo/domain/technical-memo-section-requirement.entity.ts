import { TechnicalMemoCoverageStatus, type TechnicalMemoRequirementFindingType } from "./enums";

export type TechnicalMemoSectionRequirementProps = {
  id: string;
  organizationId: string;
  technicalMemoSectionId: string;
  findingType: TechnicalMemoRequirementFindingType;
  findingId: string;
  coverageStatus: TechnicalMemoCoverageStatus;
  coverageReason?: string | undefined;
  confirmedByUser: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** Lien Requirement↔Section (mission §43-47) — un couple (`findingType`,`findingId`) est rattaché à au
 *  plus une section par mémoire (`@@unique([technicalMemoSectionId, findingType, findingId])`).
 *  `coverageStatus` est une PROPOSITION IA tant que `confirmedByUser` est faux — jamais présenté comme
 *  une preuve juridique de couverture (mission §47 "jamais une similarité vectorielle ne prouve
 *  légalement la couverture"). Immuable une fois figé dans un export (mission §56 "mapping immuable
 *  par version") — cette entité représente l'état COURANT, un export fige une copie séparée. */
export class TechnicalMemoSectionRequirement {
  private constructor(private props: TechnicalMemoSectionRequirementProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    technicalMemoSectionId: string;
    findingType: TechnicalMemoRequirementFindingType;
    findingId: string;
    coverageStatus?: TechnicalMemoCoverageStatus | undefined;
    coverageReason?: string | undefined;
    occurredAt: Date;
  }): TechnicalMemoSectionRequirement {
    return new TechnicalMemoSectionRequirement({
      id: input.id,
      organizationId: input.organizationId,
      technicalMemoSectionId: input.technicalMemoSectionId,
      findingType: input.findingType,
      findingId: input.findingId,
      coverageStatus: input.coverageStatus ?? TechnicalMemoCoverageStatus.NeedsReview,
      coverageReason: input.coverageReason,
      confirmedByUser: false,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: TechnicalMemoSectionRequirementProps): TechnicalMemoSectionRequirement {
    return new TechnicalMemoSectionRequirement(props);
  }

  /** Proposition IA — n'écrase jamais une correction utilisateur déjà confirmée. */
  suggestCoverage(input: { coverageStatus: TechnicalMemoCoverageStatus; coverageReason?: string | undefined; occurredAt: Date }): void {
    if (this.props.confirmedByUser) return;
    this.props.coverageStatus = input.coverageStatus;
    this.props.coverageReason = input.coverageReason;
    this.props.updatedAt = input.occurredAt;
  }

  /** Correction manuelle explicite (mission §47 "cas ambigus → NEEDS_REVIEW, jamais tranchés seuls par l'IA"). */
  confirmCoverage(input: { coverageStatus: TechnicalMemoCoverageStatus; coverageReason?: string | undefined; occurredAt: Date }): void {
    this.props.coverageStatus = input.coverageStatus;
    this.props.coverageReason = input.coverageReason;
    this.props.confirmedByUser = true;
    this.props.updatedAt = input.occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get technicalMemoSectionId(): string {
    return this.props.technicalMemoSectionId;
  }
  get findingType(): TechnicalMemoRequirementFindingType {
    return this.props.findingType;
  }
  get findingId(): string {
    return this.props.findingId;
  }
  get coverageStatus(): TechnicalMemoCoverageStatus {
    return this.props.coverageStatus;
  }
  get coverageReason(): string | undefined {
    return this.props.coverageReason;
  }
  get confirmedByUser(): boolean {
    return this.props.confirmedByUser;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
