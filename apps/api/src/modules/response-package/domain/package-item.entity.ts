import { derivePackageItemStatus } from "./services/derive-package-item-status";
import { PackageItemApplicabilityStatus, PackageItemCategory, PackageItemRequirementType, PackageItemSourceType, PackageItemStatus } from "./enums";

export type PackageItemProps = {
  id: string;
  organizationId: string;
  responsePackageVersionId: string;
  category: PackageItemCategory;
  label: string;
  documentType?: string | undefined;
  sourceType: PackageItemSourceType;
  sourceId?: string | undefined;
  documentId?: string | undefined;
  documentVersionId?: string | undefined;
  requirementType: PackageItemRequirementType;
  applicabilityStatus: PackageItemApplicabilityStatus;
  conditionText?: string | undefined;
  status: PackageItemStatus;
  lotId?: string | undefined;
  expiresAt?: Date | undefined;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

/** Une pièce attendue, explicitement représentée (mission §12). `status` est TOUJOURS recalculé
 *  par cette entité elle-même (jamais assigné par un appelant) — voir `derivePackageItemStatus`. */
export class PackageItem {
  private constructor(private props: PackageItemProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    responsePackageVersionId: string;
    category: PackageItemCategory;
    label: string;
    documentType?: string | undefined;
    sourceType: PackageItemSourceType;
    sourceId?: string | undefined;
    documentId?: string | undefined;
    documentVersionId?: string | undefined;
    requirementType: PackageItemRequirementType;
    applicabilityStatus: PackageItemApplicabilityStatus;
    conditionText?: string | undefined;
    lotId?: string | undefined;
    expiresAt?: Date | undefined;
    metadata?: Record<string, unknown> | undefined;
    occurredAt: Date;
  }): PackageItem {
    const status = derivePackageItemStatus({ requirementType: input.requirementType, applicabilityStatus: input.applicabilityStatus, hasDocumentVersion: input.documentVersionId !== undefined });
    return new PackageItem({
      id: input.id,
      organizationId: input.organizationId,
      responsePackageVersionId: input.responsePackageVersionId,
      category: input.category,
      label: input.label,
      documentType: input.documentType,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      documentId: input.documentId,
      documentVersionId: input.documentVersionId,
      requirementType: input.requirementType,
      applicabilityStatus: input.applicabilityStatus,
      conditionText: input.conditionText,
      status,
      lotId: input.lotId,
      expiresAt: input.expiresAt,
      metadata: input.metadata ?? {},
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: PackageItemProps): PackageItem {
    return new PackageItem(props);
  }

  private recomputeStatus(occurredAt: Date): void {
    this.props.status = derivePackageItemStatus({
      requirementType: this.props.requirementType,
      applicabilityStatus: this.props.applicabilityStatus,
      hasDocumentVersion: this.props.documentVersionId !== undefined,
    });
    this.props.updatedAt = occurredAt;
  }

  /** Mission §71 — sélection explicite d'un document (résolution d'un matching ambigu ou
   *  rattachement direct) — TOUJOURS une `documentVersionId` figée (mission §16 POINT CRITIQUE),
   *  jamais seulement `documentId`. */
  setDocument(input: { documentId: string; documentVersionId: string; expiresAt?: Date | undefined; occurredAt: Date }): void {
    this.props.documentId = input.documentId;
    this.props.documentVersionId = input.documentVersionId;
    this.props.expiresAt = input.expiresAt;
    this.recomputeStatus(input.occurredAt);
  }

  clearDocument(occurredAt: Date): void {
    this.props.documentId = undefined;
    this.props.documentVersionId = undefined;
    this.props.expiresAt = undefined;
    this.recomputeStatus(occurredAt);
  }

  /** Mission §21/§72 — correction humaine de la qualification, jamais une modification de la
   *  source Checklist/DCE (mission §32/§72 "ne pas modifier silencieusement la source DCE"). */
  correctQualification(input: { requirementType: PackageItemRequirementType; applicabilityStatus: PackageItemApplicabilityStatus; conditionText?: string | undefined; occurredAt: Date }): void {
    this.props.requirementType = input.requirementType;
    this.props.applicabilityStatus = input.applicabilityStatus;
    this.props.conditionText = input.conditionText;
    this.recomputeStatus(input.occurredAt);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get responsePackageVersionId(): string {
    return this.props.responsePackageVersionId;
  }
  get category(): PackageItemCategory {
    return this.props.category;
  }
  get label(): string {
    return this.props.label;
  }
  get documentType(): string | undefined {
    return this.props.documentType;
  }
  get sourceType(): PackageItemSourceType {
    return this.props.sourceType;
  }
  get sourceId(): string | undefined {
    return this.props.sourceId;
  }
  get documentId(): string | undefined {
    return this.props.documentId;
  }
  get documentVersionId(): string | undefined {
    return this.props.documentVersionId;
  }
  get requirementType(): PackageItemRequirementType {
    return this.props.requirementType;
  }
  get applicabilityStatus(): PackageItemApplicabilityStatus {
    return this.props.applicabilityStatus;
  }
  get conditionText(): string | undefined {
    return this.props.conditionText;
  }
  get status(): PackageItemStatus {
    return this.props.status;
  }
  get lotId(): string | undefined {
    return this.props.lotId;
  }
  get expiresAt(): Date | undefined {
    return this.props.expiresAt;
  }
  get metadata(): Record<string, unknown> {
    return this.props.metadata;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
