import { Injectable } from "@nestjs/common";
import { GetGenerationUseCase } from "../../../generation";
import { GetPricingEstimateUseCase } from "../../../pricing";
import { ESTIMATE_DISCLAIMER_TEXT } from "../../../pricing";
import { CrossClientContentError, InvalidSectionSelectionError } from "../../domain/errors";
import { ExportSectionSelection, ExportSectionValidationStatus, type ExportSectionDeliverableProvenance } from "../../domain/export-section-selection";
import { ExportSectionSource } from "../../domain/export-section-source";
import type { ResolvedSectionContent } from "./export-assembly.service";
import type { RenderableBlock } from "./renderable-document";

export type SectionSelectionInput = Readonly<{
  sectionId: string;
  sourceType: string;
  taskType?: string | undefined;
  generationId?: string | undefined;
  pricingEstimateId?: string | undefined;
  pricingEstimateVersionNumber?: number | undefined;
  manualContent?: string | undefined;
  /** Mission Sprint 8A.1 §7/§9/§12 — contenu structuré riche (Deliverables), prioritaire sur
   *  `manualContent` au rendu ; `manualContent` reste toujours renseigné en parallèle comme
   *  équivalent texte brut (recherche, audit). */
  manualBlocks?: readonly RenderableBlock[] | undefined;
  notes?: string | undefined;
  /** Correctif audit Codex P1-001 — provenance explicite quand cette section MANUAL/ANNEX origine
   *  d'une révision Deliverables déjà sélectionnée pour l'export (jamais reconstruite ensuite). */
  deliverableProvenance?: ExportSectionDeliverableProvenance | undefined;
}>;

/** Correctif audit Codex P1-001 — traduit le statut réel d'une révision Deliverables (mission §15,
 *  ex. "VALIDATED"/"DRAFT"/"READY_FOR_REVIEW") vers le vocabulaire d'Export, sans jamais affirmer
 *  VALIDATED pour autre chose qu'une révision réellement validée par le domaine appelant. */
function mapDeliverableValidationStatus(deliverableRevisionStatus: string): ExportSectionValidationStatus {
  return deliverableRevisionStatus === "VALIDATED" ? ExportSectionValidationStatus.Validated : ExportSectionValidationStatus.NotValidated;
}

/**
 * Mission Sprint 8A §16/§17/§20 — construit les `ExportSectionSelection` ET résout leur contenu
 * réel via les ports PUBLICS de Generation/Pricing (jamais une seconde lecture directe des tables
 * — mission §16 "consomme les ports publics existants"). "Version validée → source de référence" :
 * une génération non validée est acceptée dans la sélection (marquée `NOT_VALIDATED`, mission
 * §26 "contenu non validé" reste un contrôle de VALIDATION, pas un refus à la sélection), mais son
 * contenu affiché privilégie TOUJOURS le contenu réellement figé de la ligne (édité si présent,
 * sinon généré) — jamais une resélection automatique d'une autre version.
 */
@Injectable()
export class SectionContentResolverService {
  constructor(
    private readonly getGenerationUseCase: GetGenerationUseCase,
    private readonly getPricingEstimateUseCase: GetPricingEstimateUseCase,
  ) {}

  async resolve(input: {
    organizationId: string;
    actorId: string;
    actorRole: string;
    clientAccountId: string;
    selections: readonly SectionSelectionInput[];
    selectedBy: string;
    occurredAt: Date;
  }): Promise<{ sections: ExportSectionSelection[]; resolvedContent: Map<string, ResolvedSectionContent> }> {
    const sections: ExportSectionSelection[] = [];
    const resolvedContent = new Map<string, ResolvedSectionContent>();

    for (const [index, selection] of input.selections.entries()) {
      if (selection.sourceType === ExportSectionSource.Generation && selection.generationId) {
        const generation = await this.getGenerationUseCase.execute({
          organizationId: input.organizationId,
          actorId: input.actorId,
          actorRole: input.actorRole,
          generationId: selection.generationId,
        });
        // Mission §57/§58 — jamais un contenu d'un autre client dans un export (P0).
        if (generation.clientAccountId !== input.clientAccountId) {
          throw new CrossClientContentError();
        }
        const isValidated = Boolean(generation.validatedBy) && generation.status === "GENERATED";
        sections.push(
          ExportSectionSelection.create({
            sectionId: selection.sectionId,
            taskType: generation.taskType,
            sourceType: ExportSectionSource.Generation,
            generationId: generation.id,
            validationStatus: isValidated ? ExportSectionValidationStatus.Validated : ExportSectionValidationStatus.NotValidated,
            selectedBy: input.selectedBy,
            selectedAt: input.occurredAt,
            order: index,
            notes: selection.notes,
          }),
        );
        resolvedContent.set(selection.sectionId, { text: generation.editedContent ?? generation.generatedContent ?? undefined, missing: !generation.generatedContent && !generation.editedContent });
      } else if (selection.sourceType === ExportSectionSource.Pricing && selection.pricingEstimateId) {
        // Mission (audit de correction) — `estimateId` + `version` explicite, JAMAIS un
        // identifiant de version passé à la place d'un `estimateId` (bug corrigé : l'export ne
        // gelait jamais une version précise, il affichait toujours la version courante).
        const estimate = await this.getPricingEstimateUseCase.execute({
          organizationId: input.organizationId,
          actorId: input.actorId,
          actorRole: input.actorRole,
          estimateId: selection.pricingEstimateId,
          version: selection.pricingEstimateVersionNumber,
        });
        if (estimate.clientAccountId && estimate.clientAccountId !== input.clientAccountId) {
          throw new CrossClientContentError();
        }
        sections.push(
          ExportSectionSelection.create({
            sectionId: selection.sectionId,
            sourceType: ExportSectionSource.Pricing,
            pricingEstimateId: selection.pricingEstimateId,
            // Mission "un export fige exactement une ancienne version" — si aucun numéro n'a été
            // demandé explicitement, on fige EXPLICITEMENT le numéro effectivement résolu
            // maintenant (jamais un renvoi implicite vers "la version courante au moment du
            // rendu FINAL", qui pourrait avoir changé entre l'aperçu et le figeage).
            pricingEstimateVersionNumber: selection.pricingEstimateVersionNumber ?? estimate.currentVersion.version,
            validationStatus: ExportSectionValidationStatus.Unknown,
            selectedBy: input.selectedBy,
            selectedAt: input.occurredAt,
            order: index,
            notes: selection.notes,
          }),
        );
        const rows = estimate.currentVersion.breakdown.map((line) => [line.label, `${line.amount} ${line.currency}`]);
        resolvedContent.set(selection.sectionId, {
          table: { headerRow: ["Poste", "Montant"], rows },
          // Mission §17 — disclaimer toujours inclus, jamais fusionné au contenu, coût inconnu
          // jamais affiché comme 0 € (le statut réel/estimé/partiel/inconnu vient de la version
          // figée elle-même, jamais recalculé ici).
          notice: ESTIMATE_DISCLAIMER_TEXT,
        });
      } else if (selection.sourceType === ExportSectionSource.Manual || selection.sourceType === ExportSectionSource.Annex) {
        sections.push(
          ExportSectionSelection.create({
            sectionId: selection.sectionId,
            sourceType: selection.sourceType,
            manualContent: selection.manualContent,
            manualBlocks: selection.manualBlocks,
            // Correctif audit Codex P1-001 — si la provenance Deliverables porte déjà un
            // `validationStatus` (VALIDATED/DRAFT/...), on la reflète ici plutôt que le générique
            // UNKNOWN, jamais une affirmation "VALIDATED" non prouvée par le domaine appelant.
            validationStatus: selection.deliverableProvenance ? mapDeliverableValidationStatus(selection.deliverableProvenance.validationStatus) : ExportSectionValidationStatus.Unknown,
            selectedBy: input.selectedBy,
            selectedAt: input.occurredAt,
            order: index,
            notes: selection.notes,
            deliverableProvenance: selection.deliverableProvenance,
          }),
        );
        resolvedContent.set(selection.sectionId, {
          text: selection.manualContent,
          blocks: selection.manualBlocks,
          missing: !selection.manualContent && !selection.manualBlocks?.length,
        });
      } else {
        throw new InvalidSectionSelectionError(`section "${selection.sectionId}" has an unsupported or incomplete sourceType "${selection.sourceType}"`);
      }
    }

    return { sections, resolvedContent };
  }

  /**
   * Mission §22/§32 — pour un export FINAL, la SÉLECTION est déjà figée (copiée verbatim depuis
   * l'aperçu approuvé, jamais reconstruite) ; seul le CONTENU associé est relu une dernière fois
   * (mission "une génération passée doit refléter à jamais la version exacte utilisée" — ici on
   * relit la MÊME ligne déjà référencée, jamais une autre version/sélection).
   */
  async resolveContentOnly(input: {
    organizationId: string;
    actorId: string;
    actorRole: string;
    sections: readonly ExportSectionSelection[];
  }): Promise<Map<string, ResolvedSectionContent>> {
    const resolvedContent = new Map<string, ResolvedSectionContent>();

    for (const section of input.sections) {
      if (section.sourceType === ExportSectionSource.Generation && section.generationId) {
        const generation = await this.getGenerationUseCase.execute({
          organizationId: input.organizationId,
          actorId: input.actorId,
          actorRole: input.actorRole,
          generationId: section.generationId,
        });
        resolvedContent.set(section.sectionId, {
          text: generation.editedContent ?? generation.generatedContent ?? undefined,
          missing: !generation.generatedContent && !generation.editedContent,
        });
      } else if (section.sourceType === ExportSectionSource.Pricing && section.pricingEstimateId) {
        // Mission §22/§32 + audit de correction — relit EXACTEMENT la version déjà figée sur la
        // sélection (`pricingEstimateVersionNumber`), jamais la version courante au moment du
        // figeage FINAL, même si de nouvelles versions ont été calculées entre-temps.
        const estimate = await this.getPricingEstimateUseCase.execute({
          organizationId: input.organizationId,
          actorId: input.actorId,
          actorRole: input.actorRole,
          estimateId: section.pricingEstimateId,
          version: section.pricingEstimateVersionNumber,
        });
        const rows = estimate.currentVersion.breakdown.map((line) => [line.label, `${line.amount} ${line.currency}`]);
        resolvedContent.set(section.sectionId, { table: { headerRow: ["Poste", "Montant"], rows }, notice: ESTIMATE_DISCLAIMER_TEXT });
      } else {
        resolvedContent.set(section.sectionId, {
          text: section.manualContent,
          blocks: section.manualBlocks,
          missing: !section.manualContent && !section.manualBlocks?.length,
        });
      }
    }

    return resolvedContent;
  }
}
