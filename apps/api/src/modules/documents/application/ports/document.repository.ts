import type { Document } from "../../domain/document.aggregate";
import type { DocumentDomain } from "../../domain/document-domain";
import type { DocumentOrigin } from "../../domain/document-origin";
import type { DocumentStatus } from "../../domain/document-status";
import type { DocumentVersion } from "../../domain/document-version.entity";

export type DocumentPage = { items: Document[]; nextCursor: string | null };

export interface DocumentRepository {
  findById(input: { organizationId: string; documentId: string }): Promise<Document | null>;
  list(input: {
    organizationId: string;
    cursor?: string | undefined;
    limit: number;
    status?: DocumentStatus | undefined;
    origin?: DocumentOrigin | undefined;
    domain?: DocumentDomain | undefined;
    createdByUserId?: string | undefined;
    /** Titre ou nom du fichier courant (mission §14). */
    search?: string | undefined;
    sort?: "createdAt" | "updatedAt" | "title" | "sizeBytes" | "currentVersionNumber" | undefined;
    sortDirection?: "asc" | "desc" | undefined;
  }): Promise<DocumentPage>;
  /** Documents associés à un Tender donné (via DocumentTenderAssociation) — jamais un filtre
   *  parmi d'autres de `list()`, car il nécessite une jointure dédiée. */
  listByTenderId(input: { organizationId: string; tenderId: string }): Promise<Document[]>;
  /** Persiste un Document déjà existant (métadonnées, archivage, restauration, suppression
   *  logique) — jamais utilisé pour la création initiale ni l'ajout de version. */
  save(document: Document): Promise<void>;
  /** Transaction unique : crée le Document ET sa première DocumentVersion, puis fait pointer
   *  `currentVersionId` dessus — les écritures réussissent ou échouent ensemble (conception §F). */
  createWithInitialVersion(input: { document: Document; version: DocumentVersion }): Promise<void>;
  /** Transaction unique : crée une nouvelle DocumentVersion ET promeut le Document dessus.
   *  La contrainte unique (documentId, versionNumber) fait office de verrou de concurrence —
   *  une violation doit être traduite en `ConcurrentVersionCreationError` par l'implémentation. */
  addVersionAndPromote(input: { document: Document; version: DocumentVersion }): Promise<void>;
}

export const DOCUMENT_REPOSITORY = Symbol("DOCUMENT_REPOSITORY");
