import { DomainError } from "../../../shared-kernel/domain-error";

export class ExportTemplateNotFoundError extends DomainError {
  readonly code = "EXPORT_TEMPLATE_NOT_FOUND";
  constructor() {
    super("Export template not found.");
  }
}

export class DuplicateExportTemplateError extends DomainError {
  readonly code = "DUPLICATE_EXPORT_TEMPLATE";
  constructor() {
    super("An export template with this name already exists for this document type.");
  }
}

export class ExportTemplateVersionNotFoundError extends DomainError {
  readonly code = "EXPORT_TEMPLATE_VERSION_NOT_FOUND";
  constructor() {
    super("Export template version not found.");
  }
}

export class NoActiveExportTemplateVersionError extends DomainError {
  readonly code = "NO_ACTIVE_EXPORT_TEMPLATE_VERSION";
  constructor() {
    super("No active version exists for this export template.");
  }
}

export class InvalidExportTemplateVersionStatusTransitionError extends DomainError {
  readonly code = "INVALID_EXPORT_TEMPLATE_VERSION_STATUS_TRANSITION";
  constructor(input: { from: string; to: string }) {
    super(`Cannot transition export template version from ${input.from} to ${input.to}.`);
  }
}

export class ExportTemplateVersionActivationConflictError extends DomainError {
  readonly code = "EXPORT_TEMPLATE_VERSION_ACTIVATION_CONFLICT";
  constructor() {
    super("Another version was activated concurrently for this template.");
  }
}

export class InvalidExportTemplateConfigError extends DomainError {
  readonly code = "INVALID_EXPORT_TEMPLATE_CONFIG";
  constructor(reason: string) {
    super(`Invalid export template configuration: ${reason}`);
  }
}

export class ExportJobNotFoundError extends DomainError {
  readonly code = "EXPORT_JOB_NOT_FOUND";
  constructor() {
    super("Export job not found.");
  }
}

export class ExportArtifactNotFoundError extends DomainError {
  readonly code = "EXPORT_ARTIFACT_NOT_FOUND";
  constructor() {
    super("Export artifact not found — the export may still be generating or may have failed.");
  }
}

export class ExportNotFinalError extends DomainError {
  readonly code = "EXPORT_NOT_FINAL";
  constructor() {
    super("This operation requires a FINAL export, never a PREVIEW.");
  }
}

/** Mission Sprint 8A §22 — un export final exige des sections obligatoires manquantes, un contenu
 *  non validé, ou toute autre condition bloquante détectée AVANT même de lancer le rendu. */
export class ExportBlockedError extends DomainError {
  readonly code = "EXPORT_BLOCKED";
  constructor(reason: string) {
    super(`Cannot generate this export: ${reason}`);
  }
}

export class InvalidSectionSelectionError extends DomainError {
  readonly code = "INVALID_SECTION_SELECTION";
  constructor(reason: string) {
    super(`Invalid section selection: ${reason}`);
  }
}

export class CrossClientContentError extends DomainError {
  readonly code = "CROSS_CLIENT_CONTENT";
  constructor() {
    super("A selected content item belongs to a different client — refused.");
  }
}

export class ExportPermissionMissingError extends DomainError {
  readonly code = "EXPORT_PERMISSION_MISSING";
  constructor() {
    super("Actor lacks the required export permission for this action.");
  }
}

export class UnreliableRenderError extends DomainError {
  readonly code = "UNRELIABLE_RENDER";
  constructor(reason: string) {
    super(`The rendered document did not pass reliability checks: ${reason}`);
  }
}
