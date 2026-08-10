import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import type { OutlineHeading } from "../../infrastructure/docx-outline-extractor";
import { suggestSectionCategory } from "../../infrastructure/section-category-heuristic";
import { NoHeadingsDetectedError } from "../../domain/errors";
import { TechnicalMemoSection } from "../../domain/technical-memo-section.entity";

function slugify(title: string, index: number): string {
  const base = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base ? `${index}-${base}` : `section-${index}`;
}

/**
 * Construit les `TechnicalMemoSection` à partir de l'outline détecté (mission §13 "la structure du
 * modèle prévaut, jamais un plan inventé") — un `sectionKey` stable est dérivé UNE SEULE FOIS ici
 * (index + titre normalisé), jamais recalculé après coup (mission §"jamais casser les liens de
 * mapping/citations déjà posés"). La hiérarchie parent/enfant est reconstruite via
 * `parentSegmentIndex` → id de section déjà créée (l'outline est déjà triée dans l'ordre du
 * document, un parent est toujours créé avant ses enfants).
 */
export function buildSectionsFromOutline(input: {
  outline: readonly OutlineHeading[];
  organizationId: string;
  technicalMemoId: string;
  createdBy: string;
  occurredAt: Date;
  idGenerator: IdGenerator;
}): TechnicalMemoSection[] {
  if (input.outline.length === 0) {
    throw new NoHeadingsDetectedError();
  }

  const idBySegmentIndex = new Map<number, string>();
  const sections: TechnicalMemoSection[] = [];

  input.outline.forEach((heading, index) => {
    const id = input.idGenerator.generate();
    idBySegmentIndex.set(heading.segmentIndex, id);
    const parentSectionId = heading.parentSegmentIndex !== undefined ? idBySegmentIndex.get(heading.parentSegmentIndex) : undefined;

    sections.push(
      TechnicalMemoSection.create({
        id,
        organizationId: input.organizationId,
        technicalMemoId: input.technicalMemoId,
        parentSectionId,
        sectionKey: slugify(heading.title, index),
        title: heading.title,
        order: index,
        level: heading.level,
        category: suggestSectionCategory(heading.title),
        instructionText: heading.instructionText,
        isTable: heading.isTable,
        createdBy: input.createdBy,
        occurredAt: input.occurredAt,
      }),
    );
  });

  return sections;
}
