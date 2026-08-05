import type { AdministrativeDocumentType } from "./administrative-document-type";
import { AdministrativeSignatureMode, AdministrativeSignatureStatus, assertAdministrativeSignatureStatusTransition } from "./administrative-signature";
import { AdministrativeDocumentAlreadyValidatedWithDifferentRevisionError, AdministrativeSignatureModeMismatchError, AdministrativeSignatureNotRequiredError } from "./errors";

export type AdministrativeDocumentProps = {
  id: string;
  organizationId: string;
  administrativeDossierId: string;
  tenderId: string;
  documentType: AdministrativeDocumentType;
  label: string;
  requirementId?: string | undefined;
  validatedRevisionId?: string | undefined;
  validatedAt?: Date | undefined;
  validatedBy?: string | undefined;
  signatureMode: AdministrativeSignatureMode;
  signatureStatus: AdministrativeSignatureStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

const MAX_LABEL_LENGTH = 300;

/**
 * Sprint 8C Phase 1/2 — mission §4/§21 : une pièce administrative du dossier, dont les révisions
 * portent le contenu réel. `validatedRevisionId` est un pointeur EXPLICITE et GELÉ (mission —
 * "une validation référence une révision EXACTE, jamais 'la dernière'") : une nouvelle révision
 * après validation le réinitialise (`clearValidation`), rouvrant la validation, jamais
 * silencieusement. `signatureMode`/`signatureStatus` (Phase 2, mission §18) : signature LOCALE,
 * jamais obligatoire globalement — voir `administrative-signature.ts`.
 */
export class AdministrativeDocument {
  private constructor(private props: AdministrativeDocumentProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    administrativeDossierId: string;
    tenderId: string;
    documentType: AdministrativeDocumentType;
    label: string;
    requirementId?: string | undefined;
    createdBy: string;
    occurredAt: Date;
  }): AdministrativeDocument {
    const label = input.label.trim();
    if (!label || label.length > MAX_LABEL_LENGTH) {
      throw new Error(`label must be between 1 and ${MAX_LABEL_LENGTH} characters`);
    }
    return new AdministrativeDocument({
      id: input.id,
      organizationId: input.organizationId,
      administrativeDossierId: input.administrativeDossierId,
      tenderId: input.tenderId,
      documentType: input.documentType,
      label,
      requirementId: input.requirementId,
      signatureMode: AdministrativeSignatureMode.NotRequired,
      signatureStatus: AdministrativeSignatureStatus.NotRequired,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: AdministrativeDocumentProps): AdministrativeDocument {
    return new AdministrativeDocument(props);
  }

  /** Mission §21 — idempotent pour EXACTEMENT la même révision ; refuse une AUTRE révision tant
   *  que la validation courante n'a pas été explicitement révoquée (nouvelle révision → `clearValidation`). */
  markValidated(input: { revisionId: string; validatedBy: string; occurredAt: Date }): void {
    if (this.props.validatedRevisionId !== undefined && this.props.validatedRevisionId !== input.revisionId) {
      throw new AdministrativeDocumentAlreadyValidatedWithDifferentRevisionError();
    }
    this.props.validatedRevisionId = input.revisionId;
    this.props.validatedBy = input.validatedBy;
    this.props.validatedAt = input.occurredAt;
    this.props.updatedAt = input.occurredAt;
  }

  /** Appelé UNIQUEMENT quand une nouvelle révision est attachée après une validation antérieure —
   *  mission §21 "une modification après validation... rend le package précédent obsolète". */
  clearValidation(occurredAt: Date): void {
    this.props.validatedRevisionId = undefined;
    this.props.validatedBy = undefined;
    this.props.validatedAt = undefined;
    this.props.updatedAt = occurredAt;
  }

  /** Mission §18 — change ce qui est requis. Redéfinit fondamentalement l'état de signature :
   *  NOT_REQUIRED → statut forcé NOT_REQUIRED (jamais un PENDING résiduel) ; tout autre mode → PENDING
   *  (le seul moment où PENDING est posé, toujours en tandem avec un mode réellement requis — jamais
   *  automatiquement en l'absence de besoin). */
  setSignatureMode(input: { mode: AdministrativeSignatureMode; occurredAt: Date }): void {
    this.props.signatureMode = input.mode;
    this.props.signatureStatus = input.mode === AdministrativeSignatureMode.NotRequired ? AdministrativeSignatureStatus.NotRequired : AdministrativeSignatureStatus.Pending;
    this.props.updatedAt = input.occurredAt;
  }

  /** Réservé au mode MANUAL — mission §18 "signature manuelle possible". */
  recordManualSignature(occurredAt: Date): void {
    this.assertSignatureRequired();
    if (this.props.signatureMode !== AdministrativeSignatureMode.Manual) {
      throw new AdministrativeSignatureModeMismatchError(`recordManualSignature requires mode MANUAL, got ${this.props.signatureMode}`);
    }
    assertAdministrativeSignatureStatusTransition(this.props.signatureStatus, AdministrativeSignatureStatus.Signed);
    this.props.signatureStatus = AdministrativeSignatureStatus.Signed;
    this.props.updatedAt = occurredAt;
  }

  /** Réservé au mode EXTERNAL — mission §18 "preuve externe possible". La preuve elle-même (fichier)
   *  est attachée via une révision standard, en amont de cet appel — cette méthode ne fait que
   *  refléter la décision humaine que la preuve est valable. */
  recordExternalSignatureProof(occurredAt: Date): void {
    this.assertSignatureRequired();
    if (this.props.signatureMode !== AdministrativeSignatureMode.External) {
      throw new AdministrativeSignatureModeMismatchError(`recordExternalSignatureProof requires mode EXTERNAL, got ${this.props.signatureMode}`);
    }
    assertAdministrativeSignatureStatusTransition(this.props.signatureStatus, AdministrativeSignatureStatus.Signed);
    this.props.signatureStatus = AdministrativeSignatureStatus.Signed;
    this.props.updatedAt = occurredAt;
  }

  rejectSignature(occurredAt: Date): void {
    this.assertSignatureRequired();
    assertAdministrativeSignatureStatusTransition(this.props.signatureStatus, AdministrativeSignatureStatus.Rejected);
    this.props.signatureStatus = AdministrativeSignatureStatus.Rejected;
    this.props.updatedAt = occurredAt;
  }

  cancelSignature(occurredAt: Date): void {
    this.assertSignatureRequired();
    assertAdministrativeSignatureStatusTransition(this.props.signatureStatus, AdministrativeSignatureStatus.Cancelled);
    this.props.signatureStatus = AdministrativeSignatureStatus.Cancelled;
    this.props.updatedAt = occurredAt;
  }

  private assertSignatureRequired(): void {
    if (this.props.signatureMode === AdministrativeSignatureMode.NotRequired) {
      throw new AdministrativeSignatureNotRequiredError();
    }
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get administrativeDossierId(): string {
    return this.props.administrativeDossierId;
  }
  get tenderId(): string {
    return this.props.tenderId;
  }
  get documentType(): AdministrativeDocumentType {
    return this.props.documentType;
  }
  get label(): string {
    return this.props.label;
  }
  get requirementId(): string | undefined {
    return this.props.requirementId;
  }
  get validatedRevisionId(): string | undefined {
    return this.props.validatedRevisionId;
  }
  get validatedAt(): Date | undefined {
    return this.props.validatedAt;
  }
  get validatedBy(): string | undefined {
    return this.props.validatedBy;
  }
  get signatureMode(): AdministrativeSignatureMode {
    return this.props.signatureMode;
  }
  get signatureStatus(): AdministrativeSignatureStatus {
    return this.props.signatureStatus;
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
