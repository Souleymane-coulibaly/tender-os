export { DocumentsModule } from "./documents.module";
export type { DocumentSummary, DocumentVersionSummary, DocumentTenderAssociationSummary } from "./application/dtos";

// Réexportés uniquement pour permettre au module DCE de déléguer ses écritures de fichier à
// Documents (création, ajout de version, suppression, téléchargement, lecture) plutôt que de
// dupliquer stockage/versionnement/checksum — même motif que les réexports déjà pratiqués par
// Tenders et Memberships (voir tenders/index.ts).
export { CreateDocumentWithFirstVersionUseCase } from "./application/use-cases/create-document-with-first-version.use-case";
export type {
  CreateDocumentWithFirstVersionCommand,
} from "./application/use-cases/create-document-with-first-version.use-case";

export { AddDocumentVersionUseCase } from "./application/use-cases/add-document-version.use-case";
export type { AddDocumentVersionCommand } from "./application/use-cases/add-document-version.use-case";

export { GetDocumentUseCase } from "./application/use-cases/get-document.use-case";
export type { GetDocumentQuery } from "./application/use-cases/get-document.use-case";

export { DownloadDocumentVersionUseCase } from "./application/use-cases/download-document-version.use-case";
export type {
  DownloadDocumentVersionQuery,
} from "./application/use-cases/download-document-version.use-case";
export type { DocumentDownload } from "./application/ports/storage-provider";

export { DeleteDocumentUseCase } from "./application/use-cases/delete-document.use-case";
export type { DeleteDocumentCommand } from "./application/use-cases/delete-document.use-case";

export { InternalDocumentCleanupService } from "./application/services/internal-document-cleanup.service";
export type { PurgeJustCreatedDocumentCommand } from "./application/services/internal-document-cleanup.service";

export type { IncomingFile } from "./application/incoming-file";

export { DocumentOrigin } from "./domain/document-origin";
export { DocumentDomain } from "./domain/document-domain";
