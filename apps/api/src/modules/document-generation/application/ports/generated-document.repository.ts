import type { GeneratedDocumentRevision } from "../../domain/generated-document-revision.entity";
import type { GeneratedDocument } from "../../domain/generated-document.aggregate";

export interface GeneratedDocumentRepository {
  /** Verrou consultatif Postgres scopé à cette lignée (mission "concurrence — double-génération
   *  simultanée") — appelé AVANT `nextRevisionNumber`/`createRevision` dans la même transaction
   *  courte, même motif que `PrismaMessageRepository.lockTenderQuota` (Sprint 9) : deux
   *  régénérations concurrentes de la MÊME lignée ne peuvent plus jamais calculer le même
   *  `revisionNumber`, la seconde attend simplement son tour au lieu d'entrer en conflit. */
  lockGeneratedDocument(input: { organizationId: string; generatedDocumentId: string }): Promise<void>;

  /** Correctif audit Codex P2 (Sprint 11B) — verrou consultatif pris AVANT `findLatestByScope`,
   *  sur la clé de portée elle-même (jamais sur un `generatedDocumentId` qui n'existe pas encore au
   *  premier appel) : deux générations concurrentes du MÊME opérateur (ex. deux clics "Générer" sur
   *  le même DC2 candidat) ne peuvent plus jamais lire "aucune lignée" toutes les deux puis créer
   *  chacune sa propre lignée — la seconde attend son tour, retrouve la lignée fraîchement créée par
   *  la première et y ajoute la révision suivante. */
  lockGenerationScope(input: { organizationId: string; tenderId: string; documentTemplateId: string; subjectId: string | null }): Promise<void>;

  create(generatedDocument: GeneratedDocument): Promise<void>;
  findById(input: { organizationId: string; generatedDocumentId: string }): Promise<GeneratedDocument | null>;
  list(input: { organizationId: string; tenderId: string }): Promise<readonly GeneratedDocument[]>;

  /** V2 Sprint 11B — retrouve la lignée EXISTANTE pour ce triplet (tenderId, documentTemplateId,
   *  subjectId), utilisée par les appelants internes (administrative-dossier) pour décider
   *  create-première-révision vs régénérer-une-révision-suivante, jamais une nouvelle lignée à
   *  chaque appel (mission "historique append-only réel, pas seulement révision #1 répétée"). */
  findLatestByScope(input: { organizationId: string; tenderId: string; documentTemplateId: string; subjectId: string | null }): Promise<GeneratedDocument | null>;

  createRevision(revision: GeneratedDocumentRevision): Promise<void>;
  findRevisionById(input: { organizationId: string; revisionId: string }): Promise<GeneratedDocumentRevision | null>;
  listRevisions(input: { organizationId: string; generatedDocumentId: string }): Promise<readonly GeneratedDocumentRevision[]>;
  findLatestRevision(input: { organizationId: string; generatedDocumentId: string }): Promise<GeneratedDocumentRevision | null>;
  nextRevisionNumber(input: { organizationId: string; generatedDocumentId: string }): Promise<number>;
}

export const GENERATED_DOCUMENT_REPOSITORY = Symbol("GENERATED_DOCUMENT_REPOSITORY");
