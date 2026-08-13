import { Inject, Injectable } from "@nestjs/common";
import { CreateAiSuggestionUseCase } from "../../../ai-suggestion";
import { mapCriterionFinding, mapDeadlineFinding, mapRequirementFinding, ListTenderCriteriaUseCase, ListTenderDeadlinesUseCase, ListTenderRequirementsUseCase, type MappedSuggestion } from "../../../analysis";
import {
  assertHasTenderPermission,
  findChecklistDedupMatch,
  CHECKLIST_ITEM_REPOSITORY,
  ChecklistComplianceStatus,
  ChecklistItemType,
  ChecklistSubjectType,
  GetTenderUseCase,
  TenderPermission,
  type ChecklistItem,
  type ChecklistItemRepository,
} from "../../../tenders";

const FINDINGS_PAGE_SIZE = 500;

export type ReconcileChecklistWithNewAnalysisCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

export type PossibleRemoval = Readonly<{ itemId: string; title: string; reason: string }>;

export type ReconcileChecklistWithNewAnalysisResult = Readonly<{
  analysisVersion: number | undefined;
  newRequirementSuggestionsCreated: number;
  possibleChangeSuggestionsCreated: number;
  possibleRemovals: readonly PossibleRemoval[];
}>;

/**
 * V2 Sprint 6 §22 — comparaison des Findings de la DERNIÈRE analyse aux ChecklistItems déjà
 * validés, SANS jamais muter/supprimer/dévalider automatiquement un item existant. Déclenché
 * manuellement (jamais un job planifié). Réutilise EXACTEMENT le même mapping gouverné que
 * `MapAnalysisFindingsToAiSuggestionsUseCase` (`mapRequirementFinding`/`mapCriterionFinding`/
 * `mapDeadlineFinding`, réexportés par `analysis`) et la même logique de dédoublonnage que
 * `CreateChecklistItemUseCase` (`findChecklistDedupMatch`, réexportée par `tenders`) — aucune
 * seconde implémentation divergente.
 *
 * - Aucune correspondance existante -> `AiSuggestion(CHECKLIST_ITEM, création)` taguée
 *   `changeKind: "NEW_REQUIREMENT"` dans `proposedValue` (hint UI, pas une colonne).
 * - Correspondance avec un item DÉJÀ VALIDÉ mais dont le titre proposé diffère -> `AiSuggestion`
 *   ciblant l'`entityId` existant (champ `title`), taguée `changeKind: "POSSIBLE_CHANGE"` — passe
 *   par le flux de résolution de conflit déjà existant (`ApplyAiSuggestionUseCase`), zéro nouveau
 *   code de résolution.
 * - Item existant sans AUCUNE correspondance dans les nouveaux findings -> **aucune écriture**,
 *   simplement listé dans `possibleRemovals` (bannière frontend, jamais une suppression/
 *   invalidation automatique).
 */
@Injectable()
export class ReconcileChecklistWithNewAnalysisUseCase {
  constructor(
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistRepository: ChecklistItemRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly listRequirementsUseCase: ListTenderRequirementsUseCase,
    private readonly listCriteriaUseCase: ListTenderCriteriaUseCase,
    private readonly listDeadlinesUseCase: ListTenderDeadlinesUseCase,
    private readonly createAiSuggestionUseCase: CreateAiSuggestionUseCase,
  ) {}

  async execute(command: ReconcileChecklistWithNewAnalysisCommand): Promise<ReconcileChecklistWithNewAnalysisResult> {
    assertHasTenderPermission(command.actorRole, TenderPermission.ManageChecklist);
    await this.getTenderUseCase.execute({ organizationId: command.organizationId, tenderId: command.tenderId, actorRole: command.actorRole, actorId: command.actorId });

    const listInput = { organizationId: command.organizationId, tenderId: command.tenderId, actorId: command.actorId, actorRole: command.actorRole, limit: FINDINGS_PAGE_SIZE, offset: 0 };
    const [requirements, criteria, deadlines] = await Promise.all([
      this.listRequirementsUseCase.execute(listInput),
      this.listCriteriaUseCase.execute(listInput),
      this.listDeadlinesUseCase.execute(listInput),
    ]);
    const analysisVersion = requirements.analysisVersion ?? criteria.analysisVersion ?? deadlines.analysisVersion;
    if (analysisVersion === undefined) {
      return { analysisVersion: undefined, newRequirementSuggestionsCreated: 0, possibleChangeSuggestionsCreated: 0, possibleRemovals: [] };
    }

    const proposedChecklistSuggestions: MappedSuggestion[] = [
      ...requirements.items.flatMap(mapRequirementFinding),
      ...criteria.items.flatMap(mapCriterionFinding),
      ...deadlines.items.flatMap(mapDeadlineFinding),
    ].filter((suggestion) => suggestion.entityType === "CHECKLIST_ITEM");

    const existingItems = await this.checklistRepository.listByTender({ organizationId: command.organizationId, tenderId: command.tenderId });
    const matchedExistingItemIds = new Set<string>();

    let newRequirementSuggestionsCreated = 0;
    let possibleChangeSuggestionsCreated = 0;

    for (const suggestion of proposedChecklistSuggestions) {
      const proposal = suggestion.proposedValue as { title: string; type?: string };
      const dedupMatch = findChecklistDedupMatch(existingItems, {
        type: (proposal.type as ChecklistItemType) ?? ChecklistItemType.Other,
        subjectType: ChecklistSubjectType.Candidate,
        title: proposal.title,
      });

      if (dedupMatch.kind === "new") {
        await this.createAiSuggestionUseCase.execute({
          organizationId: command.organizationId,
          entityType: suggestion.entityType,
          entityId: undefined,
          fieldName: "__create__",
          parentTenderId: command.tenderId,
          proposedValue: { ...(suggestion.proposedValue as Record<string, unknown>), changeKind: "NEW_REQUIREMENT" },
          confidence: suggestion.confidence,
          sourceDocumentId: suggestion.sourceDocumentId,
          sourceDocumentVersionId: suggestion.sourceDocumentVersionId,
          sourcePage: suggestion.sourcePage,
          sourceChunkReference: suggestion.sourceChunkReference,
          createdByProcess: "checklist_intelligence.reconcile",
          actorId: command.actorId,
          requestId: command.requestId,
        });
        newRequirementSuggestionsCreated += 1;
        continue;
      }

      matchedExistingItemIds.add(dedupMatch.existingItemId);

      const existing = existingItems.find((item) => item.id === dedupMatch.existingItemId);
      if (existing && existing.complianceStatus === ChecklistComplianceStatus.Validated && existing.title !== proposal.title) {
        await this.createAiSuggestionUseCase.execute({
          organizationId: command.organizationId,
          entityType: suggestion.entityType,
          entityId: existing.id,
          fieldName: "title",
          parentTenderId: command.tenderId,
          // V2 Sprint 6 §22 — même motif que TENDER_FIELD_DATE_FIELDS (finding-mapping-schemas.ts) :
          // un scalaire brut, jamais un objet enveloppe. `entityId` renseigné (ciblant un item
          // EXISTANT) suffit déjà à distinguer ce cas d'une création NEW_REQUIREMENT.
          proposedValue: proposal.title,
          confidence: suggestion.confidence,
          sourceDocumentId: suggestion.sourceDocumentId,
          sourceDocumentVersionId: suggestion.sourceDocumentVersionId,
          sourcePage: suggestion.sourcePage,
          sourceChunkReference: suggestion.sourceChunkReference,
          createdByProcess: "checklist_intelligence.reconcile",
          actorId: command.actorId,
          requestId: command.requestId,
        });
        possibleChangeSuggestionsCreated += 1;
      }
    }

    // V2 Sprint 6 §22 — jamais une écriture : un item validé qui n'apparaît plus dans les nouveaux
    // findings est seulement SIGNALÉ, l'utilisateur décide (mission "ne jamais supprimer/invalider
    // automatiquement un item validé").
    const possibleRemovals: PossibleRemoval[] = existingItems
      .filter((item: ChecklistItem) => item.complianceStatus === ChecklistComplianceStatus.Validated && !matchedExistingItemIds.has(item.id))
      .map((item) => ({ itemId: item.id, title: item.title, reason: "Cet élément n'apparaît plus dans la dernière analyse — vérifier manuellement." }));

    return { analysisVersion, newRequirementSuggestionsCreated, possibleChangeSuggestionsCreated, possibleRemovals };
  }
}
