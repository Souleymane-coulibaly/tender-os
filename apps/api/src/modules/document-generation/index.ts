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
