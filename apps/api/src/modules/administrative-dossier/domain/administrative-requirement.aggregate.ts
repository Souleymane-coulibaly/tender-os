import type { AdministrativeDocumentType } from "./administrative-document-type";
import { AdministrativeRequirementOrigin } from "./administrative-requirement-origin";
import { AdministrativeRequirementValidationStatus, assertAdministrativeRequirementValidationStatusTransition } from "./administrative-requirement-validation-status";

export type AdministrativeRequirementProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  sourceDocumentId?: string | undefined;
  sourceDocumentVersion?: number | undefined;
  sourceLocation?: string | undefined;
  title: string;
  description?: string | undefined;
  requirementType: string;
  expectedDocumentType: AdministrativeDocumentType;
  required: boolean;
  applicable: boolean;
  dueDate?: Date | undefined;
  validityRule?: string | undefined;
  signatureRequired: boolean;
  originalTextReference?: string | undefined;
  confidence?: number | undefined;
  origin: AdministrativeRequirementOrigin;
  createdBy: string;
  validatedBy?: string | undefined;
  validationStatus: AdministrativeRequirementValidationStatus;
  matchedDocumentId?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
};

const MAX_TITLE_LENGTH = 300;

/**
 * Sprint 8C Phase 1 — mission §8 : une exigence administrative extraite du DCE ou saisie
 * manuellement pour un Tender précis. Règle dure de la mission — "une exigence détectée par IA doit
 * rester SUGGESTED... elle ne doit jamais être validée automatiquement" : `create()` FORCE
 * `SUGGESTED` pour `origin = DCE_ANALYSIS`, quel que soit ce que l'appelant transmet.
 */
export class AdministrativeRequirement {
  private constructor(private props: AdministrativeRequirementProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    sourceDocumentId?: string | undefined;
    sourceDocumentVersion?: number | undefined;
    sourceLocation?: string | undefined;
    title: string;
    description?: string | undefined;
    requirementType: string;
    expectedDocumentType: AdministrativeDocumentType;
    required: boolean;
    applicable?: boolean | undefined;
    dueDate?: Date | undefined;
    validityRule?: string | undefined;
    signatureRequired?: boolean | undefined;
    originalTextReference?: string | undefined;
    confidence?: number | undefined;
    origin: AdministrativeRequirementOrigin;
    createdBy: string;
    /** Ignoré (toujours forcé à SUGGESTED) quand `origin = DCE_ANALYSIS` — mission §8. */
    initialValidationStatus?: AdministrativeRequirementValidationStatus | undefined;
    occurredAt: Date;
  }): AdministrativeRequirement {
    const title = input.title.trim();
    if (!title || title.length > MAX_TITLE_LENGTH) {
      throw new Error(`title must be between 1 and ${MAX_TITLE_LENGTH} characters`);
    }
    const validationStatus =
      input.origin === AdministrativeRequirementOrigin.DceAnalysis
        ? AdministrativeRequirementValidationStatus.Suggested
        : input.initialValidationStatus ?? AdministrativeRequirementValidationStatus.Suggested;

    return new AdministrativeRequirement({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      sourceDocumentId: input.sourceDocumentId,
      sourceDocumentVersion: input.sourceDocumentVersion,
      sourceLocation: input.sourceLocation,
      title,
      description: input.description,
      requirementType: input.requirementType,
      expectedDocumentType: input.expectedDocumentType,
      required: input.required,
      applicable: input.applicable ?? true,
      dueDate: input.dueDate,
      validityRule: input.validityRule,
      signatureRequired: input.signatureRequired ?? false,
      originalTextReference: input.originalTextReference,
      confidence: input.confidence,
      origin: input.origin,
      createdBy: input.createdBy,
      validationStatus,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: AdministrativeRequirementProps): AdministrativeRequirement {
    return new AdministrativeRequirement(props);
  }

  confirm(input: { validatedBy: string; occurredAt: Date }): void {
    assertAdministrativeRequirementValidationStatusTransition(this.props.validationStatus, AdministrativeRequirementValidationStatus.Confirmed);
    this.props.validationStatus = AdministrativeRequirementValidationStatus.Confirmed;
    this.props.validatedBy = input.validatedBy;
    this.props.updatedAt = input.occurredAt;
  }

  reject(input: { validatedBy: string; occurredAt: Date }): void {
    assertAdministrativeRequirementValidationStatusTransition(this.props.validationStatus, AdministrativeRequirementValidationStatus.Rejected);
    this.props.validationStatus = AdministrativeRequirementValidationStatus.Rejected;
    this.props.validatedBy = input.validatedBy;
    this.props.updatedAt = input.occurredAt;
  }

  markNotApplicable(input: { validatedBy: string; occurredAt: Date }): void {
    assertAdministrativeRequirementValidationStatusTransition(this.props.validationStatus, AdministrativeRequirementValidationStatus.NotApplicable);
    this.props.validationStatus = AdministrativeRequirementValidationStatus.NotApplicable;
    this.props.applicable = false;
    this.props.validatedBy = input.validatedBy;
    this.props.updatedAt = input.occurredAt;
  }

  edit(input: {
    title?: string | undefined;
    description?: string | undefined;
    dueDate?: Date | undefined;
    validityRule?: string | undefined;
    required?: boolean | undefined;
    signatureRequired?: boolean | undefined;
    occurredAt: Date;
  }): void {
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title || title.length > MAX_TITLE_LENGTH) {
        throw new Error(`title must be between 1 and ${MAX_TITLE_LENGTH} characters`);
      }
      this.props.title = title;
    }
    if (input.description !== undefined) this.props.description = input.description;
    if (input.dueDate !== undefined) this.props.dueDate = input.dueDate;
    if (input.validityRule !== undefined) this.props.validityRule = input.validityRule;
    if (input.required !== undefined) this.props.required = input.required;
    if (input.signatureRequired !== undefined) this.props.signatureRequired = input.signatureRequired;
    this.props.updatedAt = input.occurredAt;
  }

  matchDocument(input: { documentId: string; occurredAt: Date }): void {
    this.props.matchedDocumentId = input.documentId;
    this.props.updatedAt = input.occurredAt;
  }

  unmatchDocument(input: { occurredAt: Date }): void {
    this.props.matchedDocumentId = undefined;
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
  get sourceDocumentId(): string | undefined {
    return this.props.sourceDocumentId;
  }
  get sourceDocumentVersion(): number | undefined {
    return this.props.sourceDocumentVersion;
  }
  get sourceLocation(): string | undefined {
    return this.props.sourceLocation;
  }
  get title(): string {
    return this.props.title;
  }
  get description(): string | undefined {
    return this.props.description;
  }
  get requirementType(): string {
    return this.props.requirementType;
  }
  get expectedDocumentType(): AdministrativeDocumentType {
    return this.props.expectedDocumentType;
  }
  get required(): boolean {
    return this.props.required;
  }
  get applicable(): boolean {
    return this.props.applicable;
  }
  get dueDate(): Date | undefined {
    return this.props.dueDate;
  }
  get validityRule(): string | undefined {
    return this.props.validityRule;
  }
  get signatureRequired(): boolean {
    return this.props.signatureRequired;
  }
  get originalTextReference(): string | undefined {
    return this.props.originalTextReference;
  }
  get confidence(): number | undefined {
    return this.props.confidence;
  }
  get origin(): AdministrativeRequirementOrigin {
    return this.props.origin;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get validatedBy(): string | undefined {
    return this.props.validatedBy;
  }
  get validationStatus(): AdministrativeRequirementValidationStatus {
    return this.props.validationStatus;
  }
  get matchedDocumentId(): string | undefined {
    return this.props.matchedDocumentId;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
