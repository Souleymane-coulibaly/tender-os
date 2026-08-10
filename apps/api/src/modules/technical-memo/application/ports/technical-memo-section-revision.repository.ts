import type { TechnicalMemoSectionCitation } from "../../domain/technical-memo-section-citation.value-object";
import type { TechnicalMemoSectionRevision } from "../../domain/technical-memo-section-revision.entity";

export interface TechnicalMemoSectionRevisionRepository {
  /** Verrou consultatif scopé à la section — même motif que `GeneratedDocumentRepository.
   *  lockGeneratedDocument` (mission §84 "deux générations concurrentes de la même section") : pris
   *  AVANT `nextRevisionNumber`/`create` dans la même transaction courte. */
  lockSection(input: { organizationId: string; technicalMemoSectionId: string }): Promise<void>;
  /** Révision + ses citations, écrites ENSEMBLE (jamais une révision sans ses sources figées,
   *  mission §85 "versions de sources figées au lancement"). */
  create(input: { revision: TechnicalMemoSectionRevision; citations: readonly TechnicalMemoSectionCitation[] }): Promise<void>;
  findById(input: { organizationId: string; revisionId: string }): Promise<TechnicalMemoSectionRevision | null>;
  listBySectionId(input: { organizationId: string; technicalMemoSectionId: string }): Promise<readonly TechnicalMemoSectionRevision[]>;
  findLatestBySectionId(input: { organizationId: string; technicalMemoSectionId: string }): Promise<TechnicalMemoSectionRevision | null>;
  nextRevisionNumber(input: { organizationId: string; technicalMemoSectionId: string }): Promise<number>;
}

export const TECHNICAL_MEMO_SECTION_REVISION_REPOSITORY = Symbol("TECHNICAL_MEMO_SECTION_REVISION_REPOSITORY");
