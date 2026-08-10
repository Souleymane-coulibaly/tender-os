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

// V2 Sprint 12 (`technical-memo`) — même motif que l'export de `DocumentGenerationExecutionService`
// (Sprint 11) : un appelant interne contrôlé qui doit CRÉER lui-même un DocumentTemplate/Version
// dérivé (un par mémoire technique, jamais réutilisable entre Tenders — contrairement aux templates
// gérés par un OWNER/ADMIN via l'UI publique) ne doit PAS passer par `CreateDocumentTemplateUseCase`/
// `CreateDocumentTemplateVersionUseCase` : ces use cases HTTP appliquent `DocumentGenerationPermission.
// ManageTemplates` (réservé à OWNER/ORGANIZATION_ADMIN, mission "gestion de bibliothèque org-wide"),
// une permission sans rapport avec le droit d'un CONTRIBUTOR à générer SON PROPRE mémoire technique
// (`TenderPermission.UseTechnicalMemo`, déjà vérifié par l'appelant avant d'atteindre ce point).
export { DocumentTemplate } from "./domain/document-template.aggregate";
export { DocumentTemplateVersion } from "./domain/document-template-version.entity";
export type { DiscoveredPlaceholder } from "./domain/document-template-version.entity";
export type { DocumentTemplateFieldMapping } from "./domain/document-template-field-mapping";

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
