import type { CriterionFindingRecord, ClauseFindingRecord, RequirementFindingRecord } from "../../../analysis";
import { TechnicalMemoRequirementFindingType } from "../../domain/enums";
import type { TechnicalMemoSection } from "../../domain/technical-memo-section.entity";
import { TechnicalMemoSectionRequirement } from "../../domain/technical-memo-section-requirement.entity";
import { suggestSectionCategory } from "../../infrastructure/section-category-heuristic";

export type FindingsCorpus = Readonly<{
  requirements: readonly RequirementFindingRecord[];
  criteria: readonly CriterionFindingRecord[];
  clauses: readonly ClauseFindingRecord[];
}>;

/**
 * Mapping DCE → Sections (mission §21) — logique déterministe et auditable (mission §47/§96 "pas
 * besoin d'un algorithme parfait mais une logique auditable, corrigible par l'utilisateur") : le
 * texte de CHAQUE finding (label/name/summary) est passé au MÊME classifieur de mots-clés que celui
 * qui suggère la catégorie d'une section (`suggestSectionCategory`) — une exigence dont le texte
 * évoque "sécurité" est reliée à toute section déjà classée SECURITY, jamais une similarité
 * vectorielle opaque. Les sections `NEEDS_MAPPING` (catégorie non déterminée) ne reçoivent aucun
 * lien automatique — l'utilisateur doit d'abord confirmer leur catégorie (mission §14/§55).
 *
 * Limite connue et documentée (résiduelle, voir rapport de sprint) : `RequirementFindingRecord`/
 * `CriterionFindingRecord`/`ClauseFindingRecord` (module Analysis) n'ont AUCUNE colonne `lotId` —
 * l'extraction DCE de ce dépôt reste au niveau Tender, jamais scindée par lot. Ce mapping s'applique
 * donc identiquement à un mémoire global ou à un mémoire de lot ; l'isolation stricte inter-lots
 * (mission §22/§96) n'est mécaniquement disponible que là où la donnée source la porte réellement
 * (`TenderAwardCriterion.lotId`, hors périmètre de cette passe — non consommé ici).
 */
export function mapFindingsToSections(input: { sections: readonly TechnicalMemoSection[]; corpus: FindingsCorpus; organizationId: string; idGenerator: { generate(): string }; occurredAt: Date }): TechnicalMemoSectionRequirement[] {
  const sectionsByCategory = new Map<string, TechnicalMemoSection[]>();
  for (const section of input.sections) {
    const list = sectionsByCategory.get(section.category) ?? [];
    list.push(section);
    sectionsByCategory.set(section.category, list);
  }

  const links: TechnicalMemoSectionRequirement[] = [];

  const link = (sections: TechnicalMemoSection[] | undefined, findingType: (typeof TechnicalMemoRequirementFindingType)[keyof typeof TechnicalMemoRequirementFindingType], findingId: string) => {
    for (const section of sections ?? []) {
      links.push(
        TechnicalMemoSectionRequirement.create({
          id: input.idGenerator.generate(),
          organizationId: input.organizationId,
          technicalMemoSectionId: section.id,
          findingType,
          findingId,
          occurredAt: input.occurredAt,
        }),
      );
    }
  };

  for (const requirement of input.corpus.requirements) {
    link(sectionsByCategory.get(suggestSectionCategory(requirement.label)), TechnicalMemoRequirementFindingType.Requirement, requirement.id);
  }
  for (const criterion of input.corpus.criteria) {
    link(sectionsByCategory.get(suggestSectionCategory(criterion.name)), TechnicalMemoRequirementFindingType.Criterion, criterion.id);
  }
  for (const clause of input.corpus.clauses) {
    link(sectionsByCategory.get(suggestSectionCategory(clause.summary)), TechnicalMemoRequirementFindingType.Clause, clause.id);
  }

  return links;
}
