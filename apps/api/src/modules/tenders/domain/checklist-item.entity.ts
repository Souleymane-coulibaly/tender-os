export const ChecklistItemStatus = {
  Todo: "TODO",
  InProgress: "IN_PROGRESS",
  Completed: "COMPLETED",
  NotApplicable: "NOT_APPLICABLE",
} as const;
export type ChecklistItemStatus = (typeof ChecklistItemStatus)[keyof typeof ChecklistItemStatus];

/** V2 Sprint 6 §5 — catalogue gouverné, aligné sur la contrainte CHECK `tender_checklist_items_type_check`. */
export const ChecklistItemType = {
  AdministrativeDocument: "ADMINISTRATIVE_DOCUMENT",
  TechnicalDocument: "TECHNICAL_DOCUMENT",
  FinancialDocument: "FINANCIAL_DOCUMENT",
  Certification: "CERTIFICATION",
  Insurance: "INSURANCE",
  Declaration: "DECLARATION",
  Form: "FORM",
  Signature: "SIGNATURE",
  Visit: "VISIT",
  Reference: "REFERENCE",
  TechnicalRequirement: "TECHNICAL_REQUIREMENT",
  FinancialRequirement: "FINANCIAL_REQUIREMENT",
  Deadline: "DEADLINE",
  Deliverable: "DELIVERABLE",
  Other: "OTHER",
} as const;
export type ChecklistItemType = (typeof ChecklistItemType)[keyof typeof ChecklistItemType];

/** V2 Sprint 6 §6 — obligatoire/conditionnel/informatif, jamais réduit à un booléen. */
export const ChecklistRequirementLevel = {
  Mandatory: "MANDATORY",
  Conditional: "CONDITIONAL",
  Informational: "INFORMATIONAL",
} as const;
export type ChecklistRequirementLevel = (typeof ChecklistRequirementLevel)[keyof typeof ChecklistRequirementLevel];

/** V2 Sprint 6 §7 — toujours corrigible par l'utilisateur, jamais une invalidation automatique. */
export const ChecklistItemCriticality = {
  Blocking: "BLOCKING",
  High: "HIGH",
  Medium: "MEDIUM",
  Low: "LOW",
} as const;
export type ChecklistItemCriticality = (typeof ChecklistItemCriticality)[keyof typeof ChecklistItemCriticality];

/** V2 Sprint 6 §8 — statut métier primaire, distinct de `ChecklistDocumentStatus` ci-dessous. */
export const ChecklistComplianceStatus = {
  ToReview: "TO_REVIEW",
  NonCompliant: "NON_COMPLIANT",
  Ready: "READY",
  Validated: "VALIDATED",
  NotApplicable: "NOT_APPLICABLE",
} as const;
export type ChecklistComplianceStatus = (typeof ChecklistComplianceStatus)[keyof typeof ChecklistComplianceStatus];

/** V2 Sprint 6 §8/§18 — disponibilité/validité du document rapproché, jamais la conformité métier. */
export const ChecklistDocumentStatus = {
  Missing: "MISSING",
  Available: "AVAILABLE",
  Expired: "EXPIRED",
} as const;
export type ChecklistDocumentStatus = (typeof ChecklistDocumentStatus)[keyof typeof ChecklistDocumentStatus];

/** V2 Sprint 6 §21 — distingue une création manuelle d'une création issue d'une AiSuggestion. */
export const ChecklistItemOrigin = {
  Manual: "MANUAL",
  AiSuggestion: "AI_SUGGESTION",
  System: "SYSTEM",
} as const;
export type ChecklistItemOrigin = (typeof ChecklistItemOrigin)[keyof typeof ChecklistItemOrigin];

/** V2 Sprint 6 §13-15 — sujet concerné, jamais une entreprise inventée pour ANY_MEMBER/GROUP_MEMBER. */
export const ChecklistSubjectType = {
  Candidate: "CANDIDATE",
  GroupMember: "GROUP_MEMBER",
  Subcontractor: "SUBCONTRACTOR",
  AnyMember: "ANY_MEMBER",
  Tender: "TENDER",
  Lot: "LOT",
} as const;
export type ChecklistSubjectType = (typeof ChecklistSubjectType)[keyof typeof ChecklistSubjectType];

/** V2 Sprint 6 §17 — jamais d'association silencieuse, même sur EXACT_MATCH. */
export const ChecklistDocumentMatchStatus = {
  NotSearched: "NOT_SEARCHED",
  ExactMatch: "EXACT_MATCH",
  ProbableMatch: "PROBABLE_MATCH",
  MultipleCandidates: "MULTIPLE_CANDIDATES",
  NoMatch: "NO_MATCH",
  ManuallyAttached: "MANUALLY_ATTACHED",
} as const;
export type ChecklistDocumentMatchStatus = (typeof ChecklistDocumentMatchStatus)[keyof typeof ChecklistDocumentMatchStatus];

export type ChecklistItemProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  title: string;
  description?: string | undefined;
  required: boolean;
  status: ChecklistItemStatus;
  assignedTo?: string | undefined;
  dueDate?: Date | undefined;
  comment?: string | undefined;
  completedAt?: Date | undefined;
  completedBy?: string | undefined;
  displayOrder: number;
  type: ChecklistItemType;
  requirementLevel: ChecklistRequirementLevel;
  conditionText?: string | undefined;
  criticality: ChecklistItemCriticality;
  complianceStatus: ChecklistComplianceStatus;
  documentStatus: ChecklistDocumentStatus;
  origin: ChecklistItemOrigin;
  subjectType: ChecklistSubjectType;
  subjectSubcontractorProfileId?: string | undefined;
  lotId?: string | undefined;
  matchedDocumentId?: string | undefined;
  matchedDocumentVersionId?: string | undefined;
  documentMatchStatus: ChecklistDocumentMatchStatus;
  documentMatchScore?: number | undefined;
  documentMatchReasons?: readonly string[] | undefined;
  documentExpiresAt?: Date | undefined;
  documentValidityCheckedAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
};

export type ChecklistItemUpdate = {
  title?: string | undefined;
  description?: string | undefined;
  required?: boolean | undefined;
  assignedTo?: string | undefined;
  dueDate?: Date | undefined;
  comment?: string | undefined;
  displayOrder?: number | undefined;
  type?: ChecklistItemType | undefined;
  requirementLevel?: ChecklistRequirementLevel | undefined;
  conditionText?: string | undefined;
  criticality?: ChecklistItemCriticality | undefined;
};

export type ChecklistDocumentMatch = {
  documentId: string;
  documentVersionId?: string | undefined;
  matchStatus: ChecklistDocumentMatchStatus;
  score?: number | undefined;
  reasons?: readonly string[] | undefined;
  expiresAt?: Date | undefined;
};

export class ChecklistItem {
  private constructor(private props: ChecklistItemProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    title: string;
    description?: string | undefined;
    required?: boolean | undefined;
    assignedTo?: string | undefined;
    dueDate?: Date | undefined;
    displayOrder?: number | undefined;
    type?: ChecklistItemType | undefined;
    requirementLevel?: ChecklistRequirementLevel | undefined;
    conditionText?: string | undefined;
    criticality?: ChecklistItemCriticality | undefined;
    origin?: ChecklistItemOrigin | undefined;
    subjectType?: ChecklistSubjectType | undefined;
    subjectSubcontractorProfileId?: string | undefined;
    lotId?: string | undefined;
    occurredAt: Date;
  }): ChecklistItem {
    return new ChecklistItem({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      title: input.title,
      description: input.description,
      required: input.required ?? false,
      status: ChecklistItemStatus.Todo,
      assignedTo: input.assignedTo,
      dueDate: input.dueDate,
      comment: undefined,
      completedAt: undefined,
      completedBy: undefined,
      displayOrder: input.displayOrder ?? 0,
      type: input.type ?? ChecklistItemType.Other,
      requirementLevel: input.requirementLevel ?? ChecklistRequirementLevel.Mandatory,
      conditionText: input.conditionText,
      criticality: input.criticality ?? ChecklistItemCriticality.Medium,
      complianceStatus: ChecklistComplianceStatus.ToReview,
      documentStatus: ChecklistDocumentStatus.Missing,
      origin: input.origin ?? ChecklistItemOrigin.Manual,
      subjectType: input.subjectType ?? ChecklistSubjectType.Candidate,
      subjectSubcontractorProfileId: input.subjectSubcontractorProfileId,
      lotId: input.lotId,
      matchedDocumentId: undefined,
      matchedDocumentVersionId: undefined,
      documentMatchStatus: ChecklistDocumentMatchStatus.NotSearched,
      documentMatchScore: undefined,
      documentMatchReasons: undefined,
      documentExpiresAt: undefined,
      documentValidityCheckedAt: undefined,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: ChecklistItemProps): ChecklistItem {
    return new ChecklistItem(props);
  }

  update(update: ChecklistItemUpdate, occurredAt: Date): void {
    if (update.title !== undefined) this.props.title = update.title;
    if (update.description !== undefined) this.props.description = update.description;
    if (update.required !== undefined) this.props.required = update.required;
    if (update.assignedTo !== undefined) this.props.assignedTo = update.assignedTo;
    if (update.dueDate !== undefined) this.props.dueDate = update.dueDate;
    if (update.comment !== undefined) this.props.comment = update.comment;
    if (update.displayOrder !== undefined) this.props.displayOrder = update.displayOrder;
    if (update.type !== undefined) this.props.type = update.type;
    if (update.requirementLevel !== undefined) this.props.requirementLevel = update.requirementLevel;
    if (update.conditionText !== undefined) this.props.conditionText = update.conditionText;
    if (update.criticality !== undefined) this.props.criticality = update.criticality;
    this.props.updatedAt = occurredAt;
  }

  /** @deprecated V2 Sprint 6 — conservé pour compatibilité ascendante (routes/tests existants).
   *  Les nouveaux flux utilisent `validate`/`markNotApplicable`, qui dérivent `status` automatiquement
   *  depuis `complianceStatus` (voir `deriveLegacyStatus`) plutôt que de l'assigner directement. */
  changeStatus(status: ChecklistItemStatus, actorId: string | undefined, occurredAt: Date): void {
    this.props.status = status;
    if (status === ChecklistItemStatus.Completed) {
      this.props.completedAt = occurredAt;
      this.props.completedBy = actorId;
    } else {
      this.props.completedAt = undefined;
      this.props.completedBy = undefined;
    }
    this.props.updatedAt = occurredAt;
  }

  /** V2 Sprint 6 §20-21 — seule action qui compte pour le score de readiness (35%, voir
   *  `readiness-calculator.ts`) : une décision humaine explicite, jamais un simple document
   *  rapproché automatiquement. */
  validate(actorId: string, occurredAt: Date): void {
    this.props.complianceStatus = ChecklistComplianceStatus.Validated;
    this.props.completedAt = occurredAt;
    this.props.completedBy = actorId;
    this.deriveLegacyStatus(occurredAt);
  }

  markNotApplicable(actorId: string, occurredAt: Date): void {
    this.props.complianceStatus = ChecklistComplianceStatus.NotApplicable;
    this.props.completedAt = undefined;
    this.props.completedBy = actorId;
    this.deriveLegacyStatus(occurredAt);
  }

  /** V2 Sprint 6 §16-18 — jamais appelé automatiquement pour un match incertain : le use case
   *  appelant garantit déjà un choix utilisateur explicite avant d'invoquer cette méthode, même pour
   *  un EXACT_MATCH (mission §17 "jamais associer silencieusement"). Un document EXPIRED fait
   *  automatiquement basculer `complianceStatus` à NON_COMPLIANT (jamais VALIDATED implicitement) ;
   *  un document AVAILABLE fait basculer à READY, jamais directement VALIDATED (mission §18 :
   *  disponible ≠ conforme, seule `validate()` peut atteindre VALIDATED).
   */
  attachDocument(match: ChecklistDocumentMatch, occurredAt: Date): void {
    this.props.matchedDocumentId = match.documentId;
    this.props.matchedDocumentVersionId = match.documentVersionId;
    this.props.documentMatchStatus = match.matchStatus;
    this.props.documentMatchScore = match.score;
    this.props.documentMatchReasons = match.reasons;
    this.props.documentExpiresAt = match.expiresAt;
    this.props.documentValidityCheckedAt = occurredAt;

    const isExpired = match.expiresAt !== undefined && match.expiresAt.getTime() < occurredAt.getTime();
    this.props.documentStatus = isExpired ? ChecklistDocumentStatus.Expired : ChecklistDocumentStatus.Available;

    if (this.props.complianceStatus !== ChecklistComplianceStatus.Validated && this.props.complianceStatus !== ChecklistComplianceStatus.NotApplicable) {
      this.props.complianceStatus = isExpired ? ChecklistComplianceStatus.NonCompliant : ChecklistComplianceStatus.Ready;
    }
    this.deriveLegacyStatus(occurredAt);
  }

  /** Retire le document associé — jamais une invalidation silencieuse d'une décision humaine déjà
   *  prise sur un item NOT_APPLICABLE (qui reste NOT_APPLICABLE : l'absence de document n'est pas
   *  le sujet). Un item VALIDATED redescend à TO_REVIEW : la preuve documentaire qui justifiait la
   *  validation n'existe plus. */
  detachDocument(occurredAt: Date): void {
    this.props.matchedDocumentId = undefined;
    this.props.matchedDocumentVersionId = undefined;
    this.props.documentMatchStatus = ChecklistDocumentMatchStatus.NotSearched;
    this.props.documentMatchScore = undefined;
    this.props.documentMatchReasons = undefined;
    this.props.documentExpiresAt = undefined;
    this.props.documentValidityCheckedAt = undefined;
    this.props.documentStatus = ChecklistDocumentStatus.Missing;

    if (this.props.complianceStatus !== ChecklistComplianceStatus.NotApplicable) {
      this.props.complianceStatus = ChecklistComplianceStatus.ToReview;
    }
    this.deriveLegacyStatus(occurredAt);
  }

  changeLot(lotId: string | undefined, occurredAt: Date): void {
    this.props.lotId = lotId;
    this.props.updatedAt = occurredAt;
  }

  changeCriticality(criticality: ChecklistItemCriticality, occurredAt: Date): void {
    this.props.criticality = criticality;
    this.props.updatedAt = occurredAt;
  }

  changeRequirementLevel(requirementLevel: ChecklistRequirementLevel, conditionText: string | undefined, occurredAt: Date): void {
    this.props.requirementLevel = requirementLevel;
    this.props.conditionText = conditionText;
    this.props.updatedAt = occurredAt;
  }

  changeSubject(subjectType: ChecklistSubjectType, subjectSubcontractorProfileId: string | undefined, occurredAt: Date): void {
    this.props.subjectType = subjectType;
    this.props.subjectSubcontractorProfileId = subjectSubcontractorProfileId;
    this.props.updatedAt = occurredAt;
  }

  /** V2 Sprint 6 — dérive le statut legacy (consommé par `readiness-calculator.ts`, 35% du score)
   *  depuis `complianceStatus`, jamais assigné directement par un appelant externe. Seul un
   *  VALIDATED/NOT_APPLICABLE explicite compte comme "terminé" — un simple document rapproché
   *  (READY) ne l'est pas encore. */
  private deriveLegacyStatus(occurredAt: Date): void {
    if (this.props.complianceStatus === ChecklistComplianceStatus.NotApplicable) {
      this.props.status = ChecklistItemStatus.NotApplicable;
    } else if (this.props.complianceStatus === ChecklistComplianceStatus.Validated) {
      this.props.status = ChecklistItemStatus.Completed;
    } else {
      const hasProgressSignal = this.props.matchedDocumentId !== undefined || this.props.assignedTo !== undefined || this.props.origin !== ChecklistItemOrigin.Manual;
      this.props.status = hasProgressSignal ? ChecklistItemStatus.InProgress : ChecklistItemStatus.Todo;
    }
    this.props.updatedAt = occurredAt;
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
  get title(): string {
    return this.props.title;
  }
  get description(): string | undefined {
    return this.props.description;
  }
  get required(): boolean {
    return this.props.required;
  }
  get status(): ChecklistItemStatus {
    return this.props.status;
  }
  get assignedTo(): string | undefined {
    return this.props.assignedTo;
  }
  get dueDate(): Date | undefined {
    return this.props.dueDate;
  }
  get comment(): string | undefined {
    return this.props.comment;
  }
  get completedAt(): Date | undefined {
    return this.props.completedAt;
  }
  get completedBy(): string | undefined {
    return this.props.completedBy;
  }
  get displayOrder(): number {
    return this.props.displayOrder;
  }
  get type(): ChecklistItemType {
    return this.props.type;
  }
  get requirementLevel(): ChecklistRequirementLevel {
    return this.props.requirementLevel;
  }
  get conditionText(): string | undefined {
    return this.props.conditionText;
  }
  get criticality(): ChecklistItemCriticality {
    return this.props.criticality;
  }
  get complianceStatus(): ChecklistComplianceStatus {
    return this.props.complianceStatus;
  }
  get documentStatus(): ChecklistDocumentStatus {
    return this.props.documentStatus;
  }
  get origin(): ChecklistItemOrigin {
    return this.props.origin;
  }
  get subjectType(): ChecklistSubjectType {
    return this.props.subjectType;
  }
  get subjectSubcontractorProfileId(): string | undefined {
    return this.props.subjectSubcontractorProfileId;
  }
  get lotId(): string | undefined {
    return this.props.lotId;
  }
  get matchedDocumentId(): string | undefined {
    return this.props.matchedDocumentId;
  }
  get matchedDocumentVersionId(): string | undefined {
    return this.props.matchedDocumentVersionId;
  }
  get documentMatchStatus(): ChecklistDocumentMatchStatus {
    return this.props.documentMatchStatus;
  }
  get documentMatchScore(): number | undefined {
    return this.props.documentMatchScore;
  }
  get documentMatchReasons(): readonly string[] | undefined {
    return this.props.documentMatchReasons;
  }
  get documentExpiresAt(): Date | undefined {
    return this.props.documentExpiresAt;
  }
  get documentValidityCheckedAt(): Date | undefined {
    return this.props.documentValidityCheckedAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
