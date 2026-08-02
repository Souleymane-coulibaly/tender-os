import type { ExportTemplateConfig } from "../../domain/export-template-config";
import type { ExportSectionSelection } from "../../domain/export-section-selection";
import type { RenderableBlock, RenderableDocument, RenderableSection } from "./renderable-document";

export type ResolvedSectionContent = Readonly<{
  /** Texte brut (mission §20 "gérer les paragraphes") — scindé sur les doubles sauts de ligne en
   *  paragraphes distincts. Pas d'interprétation Markdown/HTML : chaque bibliothèque de rendu
   *  reçoit une CHAÎNE, jamais un fragment XML/HTML pré-construit (mission "empêcher les
   *  injections XML/HTML"). */
  text?: string | undefined;
  /** Mission Sprint 8A.1 §7/§9/§12 — contenu structuré déjà mis en forme (gras/italique/liens/
   *  listes/tableaux), prioritaire sur `text` quand présent. Réutilisé tel quel par Deliverables
   *  pour préserver la mise en forme d'une révision de Mémoire technique — jamais un second moteur
   *  d'assemblage. Absent = comportement Sprint 8A inchangé (repli sur `text`). */
  blocks?: readonly RenderableBlock[] | undefined;
  /** Tableau simple optionnel (mission §20 "gérer les tableaux simples") — utilisé pour le
   *  rapport de coûts (Sprint 7). */
  table?: Readonly<{ headerRow?: readonly string[] | undefined; rows: readonly (readonly string[])[] }> | undefined;
  /** Avertissement/disclaimer à afficher juste après le contenu de la section (mission §17
   *  "inclure le disclaimer" — jamais fusionné avec le contenu principal). */
  notice?: string | undefined;
  missing?: boolean | undefined;
}>;

export type AssembleExportDocumentInput = Readonly<{
  documentTitle: string;
  config: ExportTemplateConfig;
  sections: readonly ExportSectionSelection[];
  resolvedContent: ReadonlyMap<string, ResolvedSectionContent>;
  coverPage?:
    | Readonly<{ buyerName?: string | undefined; clientName?: string | undefined; reference?: string | undefined; tenderTitle?: string | undefined }>
    | undefined;
  version: number;
  date: Date;
  isPreview: boolean;
}>;

function toParagraphBlocks(text: string): RenderableBlock[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => ({ kind: "paragraph" as const, text: paragraph }));
}

/**
 * Mission Sprint 8A §17/§20 — moteur d'assemblage PUR (aucune E/S) : sélectionne uniquement les
 * données déjà résolues et autorisées (`resolvedContent`, construit par l'use case appelant après
 * vérification RBAC/tenant/client — jamais ici), respecte l'ORDRE du template puis des sections
 * sélectionnées, signale les sections obligatoires sans contenu résolu plutôt que de les omettre
 * silencieusement.
 */
export function assembleExportDocument(input: AssembleExportDocumentInput): RenderableDocument {
  const orderedSelections = [...input.sections].sort((a, b) => a.order - b.order);
  const templateSectionById = new Map(input.config.sections.map((section) => [section.id, section]));

  const sections: RenderableSection[] = orderedSelections.map((selection) => {
    const templateSection = templateSectionById.get(selection.sectionId);
    const label = templateSection?.label ?? selection.sectionId;
    const resolved = input.resolvedContent.get(selection.sectionId);
    const blocks: RenderableBlock[] = [{ kind: "heading", level: 1, text: label }];

    if (!resolved || resolved.missing) {
      blocks.push({ kind: "notice", text: "Contenu manquant pour cette section." });
      return { id: selection.sectionId, label, blocks };
    }
    // Mission Sprint 8A.1 §7/§9/§12 (correctif) — `resolved.blocks` prévaut quand présent (contenu
    // structuré riche, ex. Deliverables), sinon repli sur `resolved.text` en paragraphes simples.
    // Pour une source MANUAL/ANNEX, `resolved.text` porte déjà `selection.manualContent` (posé par
    // `SectionContentResolverService`) : un second branchement dédié à `selection.manualContent`
    // aurait dupliqué CE MÊME contenu une seconde fois — bug réel préexistant, jamais couvert par
    // un test (aucun test Sprint 8A n'exerçait `assembleExportDocument` sur une source MANUAL),
    // corrigé ici en supprimant ce second branchement redondant.
    if (resolved.blocks && resolved.blocks.length > 0) {
      blocks.push(...resolved.blocks);
    } else if (resolved.text) {
      blocks.push(...toParagraphBlocks(resolved.text));
    }
    if (resolved.table) {
      blocks.push({ kind: "table", headerRow: resolved.table.headerRow, rows: resolved.table.rows });
    }
    if (resolved.notice) {
      blocks.push({ kind: "notice", text: resolved.notice });
    }
    return { id: selection.sectionId, label, blocks };
  });

  // Sections obligatoires du template totalement absentes de la sélection (mission §26 "section
  // obligatoire absente") — apparaissent quand même dans le document assemblé, marquées, jamais
  // omises silencieusement.
  const selectedIds = new Set(orderedSelections.map((s) => s.sectionId));
  const missingMandatory = input.config.sections.filter((section) => section.mandatory && !selectedIds.has(section.id)).sort((a, b) => a.order - b.order);
  for (const missing of missingMandatory) {
    sections.push({
      id: missing.id,
      label: missing.label,
      blocks: [{ kind: "heading", level: 1, text: missing.label }, { kind: "notice", text: "Section obligatoire non renseignée." }],
    });
  }

  return {
    documentTitle: input.documentTitle,
    coverPage: input.config.coverPage
      ? {
          showBuyerName: input.config.coverPage.showBuyerName,
          showClientName: input.config.coverPage.showClientName,
          showReference: input.config.coverPage.showReference,
          showTitle: input.config.coverPage.showTitle,
          showDate: input.config.coverPage.showDate,
          showVersion: input.config.coverPage.showVersion,
          buyerName: input.coverPage?.buyerName,
          clientName: input.coverPage?.clientName,
          reference: input.coverPage?.reference,
          tenderTitle: input.coverPage?.tenderTitle,
          date: input.date.toISOString().slice(0, 10),
          version: input.version,
        }
      : undefined,
    headerText: input.config.headerText,
    footerText: input.config.footerText,
    showPageNumbers: input.config.showPageNumbers,
    showTableOfContents: input.config.showTableOfContents,
    watermarkText: input.isPreview ? "APERÇU" : undefined,
    sections,
  };
}
