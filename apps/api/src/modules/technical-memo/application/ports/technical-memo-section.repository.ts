import type { TechnicalMemoSection } from "../../domain/technical-memo-section.entity";

export interface TechnicalMemoSectionRepository {
  /** Création en bloc à l'issue de l'analyse structurelle — toutes les sections d'un mémoire sont
   *  créées ENSEMBLE, jamais une à la fois (mission §13 "la structure prévaut", cohérence de l'outline
   *  entière ou rien). */
  createMany(sections: readonly TechnicalMemoSection[]): Promise<void>;
  save(section: TechnicalMemoSection): Promise<void>;
  findById(input: { organizationId: string; technicalMemoSectionId: string }): Promise<TechnicalMemoSection | null>;
  listByMemoId(input: { organizationId: string; technicalMemoId: string }): Promise<readonly TechnicalMemoSection[]>;
  /** Idempotence de l'analyse structurelle — un mémoire déjà analysé ne peut pas être ré-analysé en
   *  silence (voir `AnalyzeTechnicalMemoTemplateUseCase`). */
  countByMemoId(input: { organizationId: string; technicalMemoId: string }): Promise<number>;
}

export const TECHNICAL_MEMO_SECTION_REPOSITORY = Symbol("TECHNICAL_MEMO_SECTION_REPOSITORY");
