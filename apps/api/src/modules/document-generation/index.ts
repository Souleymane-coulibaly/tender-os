export { DocumentGenerationModule } from "./document-generation.module";

export type {
  DocumentTemplateSummary,
  DocumentTemplateVersionSummary,
  DocumentTemplateFieldMappingSummary,
  GeneratedDocumentSummary,
  GeneratedDocumentRevisionSummary,
} from "./application/dtos";

export { DocumentTemplateScope } from "./domain/document-template-scope";
export { FieldType } from "./domain/field-type";
export { DocumentGenerationPermission, roleHasDocumentGenerationPermission } from "./domain/document-generation-permission";

// Réexportés pour Sprint 11 (module `administrative-dossier`) — appelant interne contrôlé qui
// résout une provenance RÉELLE côté serveur avant d'appeler `DocumentGenerationExecutionService`
// directement, jamais via HTTP (voir le commentaire `exports` de `DocumentGenerationModule`).
// Jamais les use cases HTTP publics (`GenerateDocumentUseCase`/...), qui acceptent un `data`
// fourni par le client — le flux administratif ne doit jamais transiter par ce chemin.
export { DocumentGenerationExecutionService } from "./application/services/document-generation-execution.service";
export type { RunGenerationInput, ProvenanceOverride } from "./application/services/document-generation-execution.service";
export { DOCUMENT_TEMPLATE_REPOSITORY } from "./application/ports/document-template.repository";
export type { DocumentTemplateRepository, DocumentTemplateWithActiveVersion } from "./application/ports/document-template.repository";
export { GENERATED_DOCUMENT_REPOSITORY } from "./application/ports/generated-document.repository";
export type { GeneratedDocumentRepository } from "./application/ports/generated-document.repository";
export { GeneratedDocument } from "./domain/generated-document.aggregate";
export { GeneratedDocumentRevision } from "./domain/generated-document-revision.entity";
export { GeneratedDocumentRevisionStatus } from "./domain/generated-document-revision-status";
export { toGeneratedDocumentSummary, toGeneratedDocumentRevisionSummary } from "./application/dtos";
export { ATOMIC_TRANSACTION_RUNNER } from "./application/ports/atomic-transaction-runner";
export type { AtomicTransactionRunner } from "./application/ports/atomic-transaction-runner";
