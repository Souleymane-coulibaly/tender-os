import { DomainError } from "../../../shared-kernel/domain-error";

export class DocumentTemplateNotFoundError extends DomainError {
  readonly code = "DOCUMENT_TEMPLATE_NOT_FOUND";
  constructor() {
    super("Document template not found.");
  }
}

export class DuplicateDocumentTemplateNameError extends DomainError {
  readonly code = "DUPLICATE_DOCUMENT_TEMPLATE_NAME";
  constructor() {
    super("A document template with this name already exists for this organization.");
  }
}

export class DocumentTemplateVersionNotFoundError extends DomainError {
  readonly code = "DOCUMENT_TEMPLATE_VERSION_NOT_FOUND";
  constructor() {
    super("Document template version not found.");
  }
}

export class NoActiveDocumentTemplateVersionError extends DomainError {
  readonly code = "NO_ACTIVE_DOCUMENT_TEMPLATE_VERSION";
  constructor() {
    super("No active version exists for this document template.");
  }
}

export class InvalidDocumentTemplateVersionStatusTransitionError extends DomainError {
  readonly code = "INVALID_DOCUMENT_TEMPLATE_VERSION_STATUS_TRANSITION";
  constructor(input: { from: string; to: string }) {
    super(`Cannot transition document template version from ${input.from} to ${input.to}.`);
  }
}

export class DocumentTemplateVersionActivationConflictError extends DomainError {
  readonly code = "DOCUMENT_TEMPLATE_VERSION_ACTIVATION_CONFLICT";
  constructor() {
    super("Another version was activated concurrently for this template.");
  }
}

export class DocumentGenerationPermissionMissingError extends DomainError {
  readonly code = "DOCUMENT_GENERATION_PERMISSION_MISSING";
  constructor() {
    super("Actor lacks the required document generation permission for this action.");
  }
}

/** Mission §"sécurité upload de template" — englobe rejet d'extension/MIME/structure ZIP/taille/
 *  zip-bomb/path-traversal/XXE/macro (.docm) : un SEUL type d'erreur métier, jamais une fuite du
 *  détail technique de l'attaque détectée au client (voir message générique, détail en log serveur
 *  uniquement via `reason`, jamais renvoyé tel quel au HTTP — voir le controller/filter). */
export class InvalidTemplateFileError extends DomainError {
  readonly code = "INVALID_TEMPLATE_FILE";
  constructor(readonly reason: string) {
    super("The uploaded file is not a valid, safe DOCX template.");
  }
}

export class GeneratedDocumentNotFoundError extends DomainError {
  readonly code = "GENERATED_DOCUMENT_NOT_FOUND";
  constructor() {
    super("Generated document not found.");
  }
}

export class GeneratedDocumentRevisionNotFoundError extends DomainError {
  readonly code = "GENERATED_DOCUMENT_REVISION_NOT_FOUND";
  constructor() {
    super("Generated document revision not found.");
  }
}

/** Mission §"jamais inventer une valeur manquante" — un champ requis est absent du snapshot ET le
 *  template n'autorise pas la génération partielle : bloquée AVANT tout appel au moteur de fusion. */
export class RequiredFieldsMissingError extends DomainError {
  readonly code = "REQUIRED_FIELDS_MISSING";
  constructor(readonly missingFields: readonly string[]) {
    super(`Cannot generate: required fields are missing and this template does not allow partial generation: ${missingFields.join(", ")}`);
  }
}

export class ArtifactNotReadyError extends DomainError {
  readonly code = "ARTIFACT_NOT_READY";
  constructor() {
    super("This revision has no downloadable artifact — it may still be generating or may have failed.");
  }
}

/** Erreur technique du moteur de fusion DOCX (docxtemplater), assainie avant d'atteindre le
 *  domaine — jamais une pile d'appel de la bibliothèque tierce exposée telle quelle. */
export class DocxMergeError extends DomainError {
  readonly code = "DOCX_MERGE_FAILED";
  constructor(readonly reason: string) {
    super(`DOCX generation failed: ${reason}`);
  }
}
