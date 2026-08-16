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

// Réexportée pour Sprint 6 (module `checklist-intelligence`) — valider qu'un `documentVersionId`
// fourni par le client appartient bien au `documentId` déclaré ET à l'organisation active avant de
// l'attacher à un ChecklistItem (correctif audit Codex P1 : le champ est dénormalisé, sans FK —
// voir `schema.prisma`, la vérification applicative est donc le seul garde-fou).
export { DocumentVersionNotFoundError } from "./domain/errors";

export { DownloadDocumentVersionUseCase } from "./application/use-cases/download-document-version.use-case";
export type {
  DownloadDocumentVersionQuery,
  DocumentInternalStream,
} from "./application/use-cases/download-document-version.use-case";
export type { DocumentDownload } from "./application/ports/storage-provider";

export { DeleteDocumentUseCase } from "./application/use-cases/delete-document.use-case";
export type { DeleteDocumentCommand } from "./application/use-cases/delete-document.use-case";

export { InternalDocumentCleanupService } from "./application/services/internal-document-cleanup.service";
export type { PurgeJustCreatedDocumentCommand } from "./application/services/internal-document-cleanup.service";

// Ports bruts, réexportés uniquement pour un usage système interne (mission Sprint 3 — Extraction
// lit un fichier déjà stocké sans jamais passer par un use case RBAC-protégé comme
// DownloadDocumentVersionUseCase : l'extraction est un traitement interne autorisé une seule fois,
// à la frontière HTTP de son propre module, jamais par la permission Documents de l'acteur).
export { DOCUMENT_REPOSITORY } from "./application/ports/document.repository";
export type { DocumentRepository } from "./application/ports/document.repository";
export { DOCUMENT_VERSION_REPOSITORY } from "./application/ports/document-version.repository";
export type { DocumentVersionRepository } from "./application/ports/document-version.repository";
export { STORAGE_PROVIDER } from "./application/ports/storage-provider";
export type { StorageProvider } from "./application/ports/storage-provider";

export type { IncomingFile } from "./application/incoming-file";

export { DocumentOrigin } from "./domain/document-origin";
export { DocumentDomain } from "./domain/document-domain";

// Réexporté en LECTURE SEULE pour Sprint 8A.2 (module `cockpit`) — liste des documents associés à
// un Tender pour la vue d'ensemble, jamais un second accès direct aux repositories.
export { ListTenderDocumentsUseCase } from "./application/use-cases/list-tender-documents.use-case";
export type { ListTenderDocumentsQuery } from "./application/use-cases/list-tender-documents.use-case";

// Réexporté pour Sprint 9 (module `submission`) — garantit qu'une preuve de dépôt est
// structurellement rattachée au Tender de la soumission (correctif audit Codex P1 : "preuve non
// garantie comme appartenant au même Tender"), jamais un second mécanisme d'association.
export { AttachDocumentToTenderUseCase } from "./application/use-cases/attach-document-to-tender.use-case";
export type { AttachDocumentToTenderCommand } from "./application/use-cases/attach-document-to-tender.use-case";

// Réexporté en LECTURE SEULE pour Sprint 14 (module `response-package`, correctif audit Codex
// RP-P1-01) — même motif que `AttachDocumentToTenderUseCase` (Sprint 9) : garantit qu'un document
// sélectionné manuellement pour un `PackageItem` est structurellement rattaché au MÊME Tender que
// le dossier de réponse, jamais un document d'un autre client/tender de la même organisation
// accepté silencieusement. Jamais une écriture depuis response-package, uniquement `.exists(...)`.
export { DOCUMENT_TENDER_ASSOCIATION_REPOSITORY } from "./application/ports/document-tender-association.repository";
export type { DocumentTenderAssociationRepository } from "./application/ports/document-tender-association.repository";

// Réexporté en LECTURE SEULE pour Sprint 22 (module `billing`, étape 22D) — mesure d'usage
// "stockage" organisation-wide (écran Abonnement & utilisation, Platform Admin, résumé Dashboard 22E).
export { GetOrganizationStorageUsageUseCase } from "./application/use-cases/get-organization-storage-usage.use-case";
