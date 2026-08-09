import type { GeneratedDocumentRevision } from "../../domain/generated-document-revision.entity";
import type { GeneratedDocument } from "../../domain/generated-document.aggregate";

export interface GeneratedDocumentRepository {
  /** Verrou consultatif Postgres scopé à cette lignée (mission "concurrence — double-génération
   *  simultanée") — appelé AVANT `nextRevisionNumber`/`createRevision` dans la même transaction
   *  courte, même motif que `PrismaMessageRepository.lockTenderQuota` (Sprint 9) : deux
   *  régénérations concurrentes de la MÊME lignée ne peuvent plus jamais calculer le même
   *  `revisionNumber`, la seconde attend simplement son tour au lieu d'entrer en conflit. */
  lockGeneratedDocument(input: { organizationId: string; generatedDocumentId: string }): Promise<void>;

  create(generatedDocument: GeneratedDocument): Promise<void>;
  findById(input: { organizationId: string; generatedDocumentId: string }): Promise<GeneratedDocument | null>;
  list(input: { organizationId: string; tenderId: string }): Promise<readonly GeneratedDocument[]>;

  createRevision(revision: GeneratedDocumentRevision): Promise<void>;
  findRevisionById(input: { organizationId: string; revisionId: string }): Promise<GeneratedDocumentRevision | null>;
  listRevisions(input: { organizationId: string; generatedDocumentId: string }): Promise<readonly GeneratedDocumentRevision[]>;
  findLatestRevision(input: { organizationId: string; generatedDocumentId: string }): Promise<GeneratedDocumentRevision | null>;
  nextRevisionNumber(input: { organizationId: string; generatedDocumentId: string }): Promise<number>;
}

export const GENERATED_DOCUMENT_REPOSITORY = Symbol("GENERATED_DOCUMENT_REPOSITORY");
