import type { TechnicalMemoSectionRequirement } from "../../domain/technical-memo-section-requirement.entity";

export interface TechnicalMemoSectionRequirementRepository {
  /** Mapping DCE en bloc (mission §21) — remplace l'ensemble des liens NON confirmés par
   *  l'utilisateur pour cette section ; un lien déjà `confirmedByUser` est conservé tel quel
   *  (jamais écrasé par une re-suggestion IA, voir `TechnicalMemoSectionRequirement.suggestCoverage`). */
  createMany(requirements: readonly TechnicalMemoSectionRequirement[]): Promise<void>;
  save(requirement: TechnicalMemoSectionRequirement): Promise<void>;
  findById(input: { organizationId: string; technicalMemoSectionRequirementId: string }): Promise<TechnicalMemoSectionRequirement | null>;
  listBySectionId(input: { organizationId: string; technicalMemoSectionId: string }): Promise<readonly TechnicalMemoSectionRequirement[]>;
  /** Vue de couverture agrégée mission §43 — toutes les exigences liées à N'IMPORTE QUELLE section
   *  du mémoire, jamais rechargées section par section pour ce calcul. */
  listByMemoId(input: { organizationId: string; technicalMemoId: string }): Promise<readonly TechnicalMemoSectionRequirement[]>;
}

export const TECHNICAL_MEMO_SECTION_REQUIREMENT_REPOSITORY = Symbol("TECHNICAL_MEMO_SECTION_REQUIREMENT_REPOSITORY");
