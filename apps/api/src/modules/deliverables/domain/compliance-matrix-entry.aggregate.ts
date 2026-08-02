import { ComplianceCoverageStatus, Criticality } from "./compliance-coverage-status";

export type ComplianceMatrixEntryProps = {
  id: string;
  organizationId: string;
  deliverableId: string;
  requirementId?: string | undefined;
  source: string;
  mandatory: boolean;
  criticality: Criticality;
  response?: string | undefined;
  deliverableSectionRef?: string | undefined;
  proofReference?: string | undefined;
  coverageStatus: ComplianceCoverageStatus;
  validated: boolean;
  validatedBy?: string | undefined;
  validatedAt?: Date | undefined;
  order: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

const MAX_SOURCE_LENGTH = 300;

/**
 * Mission Sprint 8A.1 §14 — matrice de conformité : "relie exigence → réponse → preuve", overlay
 * léger (édition directe, aucune révision/relecture séparée — décision de portée, voir rapport §B).
 * `requirementId` est une référence dénormalisée LECTURE SEULE vers `TenderRequirementFinding`
 * (Sprint 4), jamais une FK stricte (même motif que `pricingEstimateId` dans Export).
 */
export class ComplianceMatrixEntry {
  private constructor(private props: ComplianceMatrixEntryProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    deliverableId: string;
    requirementId?: string | undefined;
    source: string;
    mandatory: boolean;
    criticality: Criticality;
    order: number;
    createdBy: string;
    occurredAt: Date;
  }): ComplianceMatrixEntry {
    const source = input.source.trim();
    if (!source || source.length > MAX_SOURCE_LENGTH) {
      throw new Error(`source must be between 1 and ${MAX_SOURCE_LENGTH} characters`);
    }
    return new ComplianceMatrixEntry({
      id: input.id,
      organizationId: input.organizationId,
      deliverableId: input.deliverableId,
      requirementId: input.requirementId,
      source,
      mandatory: input.mandatory,
      criticality: input.criticality,
      coverageStatus: ComplianceCoverageStatus.ToConfirm,
      validated: false,
      order: input.order,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: ComplianceMatrixEntryProps): ComplianceMatrixEntry {
    return new ComplianceMatrixEntry(props);
  }

  update(input: {
    response?: string | undefined;
    deliverableSectionRef?: string | undefined;
    proofReference?: string | undefined;
    coverageStatus?: ComplianceCoverageStatus | undefined;
    occurredAt: Date;
  }): void {
    if (input.response !== undefined) this.props.response = input.response;
    if (input.deliverableSectionRef !== undefined) this.props.deliverableSectionRef = input.deliverableSectionRef;
    if (input.proofReference !== undefined) this.props.proofReference = input.proofReference;
    if (input.coverageStatus !== undefined) this.props.coverageStatus = input.coverageStatus;
    // Toute modification substantielle invalide une éventuelle validation antérieure (mission
    // "un contenu modifié n'est jamais considéré validé automatiquement").
    this.props.validated = false;
    this.props.validatedBy = undefined;
    this.props.validatedAt = undefined;
    this.props.updatedAt = input.occurredAt;
  }

  markValidated(input: { validatedBy: string; occurredAt: Date }): void {
    this.props.validated = true;
    this.props.validatedBy = input.validatedBy;
    this.props.validatedAt = input.occurredAt;
    this.props.updatedAt = input.occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get deliverableId(): string {
    return this.props.deliverableId;
  }
  get requirementId(): string | undefined {
    return this.props.requirementId;
  }
  get source(): string {
    return this.props.source;
  }
  get mandatory(): boolean {
    return this.props.mandatory;
  }
  get criticality(): Criticality {
    return this.props.criticality;
  }
  get response(): string | undefined {
    return this.props.response;
  }
  get deliverableSectionRef(): string | undefined {
    return this.props.deliverableSectionRef;
  }
  get proofReference(): string | undefined {
    return this.props.proofReference;
  }
  get coverageStatus(): ComplianceCoverageStatus {
    return this.props.coverageStatus;
  }
  get validated(): boolean {
    return this.props.validated;
  }
  get validatedBy(): string | undefined {
    return this.props.validatedBy;
  }
  get validatedAt(): Date | undefined {
    return this.props.validatedAt;
  }
  get order(): number {
    return this.props.order;
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
