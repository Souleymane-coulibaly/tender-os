import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { CreateAiSuggestionUseCase } from "../../../ai-suggestion";
import { DCE_REPOSITORY, type DceRepository } from "../../../dce";
import { mapCriterionFinding, mapDeadlineFinding, mapRequirementFinding, ListTenderCriteriaUseCase, ListTenderDeadlinesUseCase, ListTenderRequirementsUseCase, type MappedSuggestion } from "../../../analysis";
import {
  assertHasTenderPermission,
  findChecklistDedupMatch,
  CHECKLIST_ITEM_REPOSITORY,
  CHECKLIST_RECONCILIATION_REPOSITORY,
  ChecklistComplianceStatus,
  ChecklistItemOrigin,
  ChecklistItemType,
  ChecklistSubjectType,
  GetTenderUseCase,
  TenderPermission,
  type ChecklistItem,
  type ChecklistItemRepository,
  type ChecklistReconciliationRepository,
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
  /** Checkpoint 2.1-P2.1-FIX-B (mission §24-25) — `true` si cette `analysisVersion` avait déjà été
   *  réconciliée lors d'un appel précédent : no-op complet, jamais une seconde création de
   *  suggestions ni un re-marquage inutile. */
  alreadyReconciled: boolean;
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
 * - Item existant sans AUCUNE correspondance dans les nouveaux findings -> **aucune écriture sur
 *   `complianceStatus`**, simplement listé dans `possibleRemovals` (bannière frontend, jamais une
 *   suppression/invalidation automatique) — mais voir `requirementFreshness` ci-dessous.
 *
 * Checkpoint 2.1-P2.1-FIX-B — deux ajouts, tous deux additifs, aucune règle ci-dessus modifiée :
 * 1. Idempotence PAR ANALYSE RÉSOLUE (mission §24-25, même discipline que
 *    `MapAnalysisFindingsToAiSuggestionsUseCase` "idempotent par tentative d'analyse") : si
 *    `TenderChecklistReconciliation.lastReconciledAnalysisVersion` égale déjà l'`analysisVersion`
 *    résolue ici, tout le corps est sauté — aucune nouvelle suggestion, aucun re-marquage. Les
 *    findings d'une `analysisVersion` donnée ne changent jamais après coup (immuables une fois
 *    persistés), donc cette garde est sûre et complète.
 * 2. `ChecklistItem.requirementFreshness` (mission §15/§18/§19/§21, axe ORTHOGONAL à
 *    `complianceStatus`, JAMAIS muté ici) : tout item `origin != MANUAL` retrouvé dans les nouveaux
 *    findings est confirmé CURRENT ; tout item `origin != MANUAL` sans AUCUNE correspondance est
 *    marqué STALE. Les items `MANUAL` (mission §23) ne sont jamais évalués — ils ne proviennent pas
 *    du DCE, donc n'ont rien à voir avec sa fraîcheur.
 */
@Injectable()
export class ReconcileChecklistWithNewAnalysisUseCase {
  constructor(
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistRepository: ChecklistItemRepository,
    @Inject(CHECKLIST_RECONCILIATION_REPOSITORY) private readonly reconciliationRepository: ChecklistReconciliationRepository,
    @Inject(DCE_REPOSITORY) private readonly dceRepository: DceRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
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
      return { analysisVersion: undefined, newRequirementSuggestionsCreated: 0, possibleChangeSuggestionsCreated: 0, possibleRemovals: [], alreadyReconciled: false };
    }

    const reconciliationState = await this.reconciliationRepository.find({ organizationId: command.organizationId, tenderId: command.tenderId });
    if (reconciliationState?.lastReconciledAnalysisVersion === analysisVersion) {
      return { analysisVersion, newRequirementSuggestionsCreated: 0, possibleChangeSuggestionsCreated: 0, possibleRemovals: [], alreadyReconciled: true };
    }

    const proposedChecklistSuggestions: MappedSuggestion[] = [
      ...requirements.items.flatMap(mapRequirementFinding),
      ...criteria.items.flatMap(mapCriterionFinding),
      ...deadlines.items.flatMap(mapDeadlineFinding),
    ].filter((suggestion) => suggestion.entityType === "CHECKLIST_ITEM");

    const existingItems = await this.checklistRepository.listByTender({ organizationId: command.organizationId, tenderId: command.tenderId });
    const matchedExistingItemIds = new Set<string>();
    // Checkpoint 2.1-P2.1-FIX-B (mission §19/§21) — un item matché mais dont le titre a
    // matériellement changé n'est PAS "retrouvé à l'identique" : il rejoint les items marqués STALE,
    // jamais confirmé CURRENT malgré le match (voir la boucle de marquage ci-dessous).
    const changedExistingItemIds = new Set<string>();

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
      if (existing && existing.title !== proposal.title) {
        changedExistingItemIds.add(existing.id);
      }
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

    // V2 Sprint 6 §22 — jamais une écriture sur `complianceStatus` : un item validé qui n'apparaît
    // plus dans les nouveaux findings est seulement SIGNALÉ, l'utilisateur décide (mission "ne
    // jamais supprimer/invalider automatiquement un item validé"). Mission §23 (correctif audit) —
    // un item MANUAL n'a jamais été dérivé d'un finding : il ne peut structurellement jamais
    // "disparaître du DCE", donc il est exclu ici (avant ce correctif, un item manuel sans
    // correspondance de titre fortuite était incorrectement signalé à CHAQUE reconcile).
    const possibleRemovals: PossibleRemoval[] = existingItems
      .filter((item: ChecklistItem) => item.origin !== ChecklistItemOrigin.Manual && item.complianceStatus === ChecklistComplianceStatus.Validated && !matchedExistingItemIds.has(item.id))
      .map((item) => ({ itemId: item.id, title: item.title, reason: "Cet élément n'apparaît plus dans la dernière analyse — vérifier manuellement." }));

    // Checkpoint 2.1-P2.1-FIX-B — `requirementFreshness`, axe ORTHOGONAL à `complianceStatus`
    // (jamais muté ci-dessus, jamais muté ici non plus). Les items MANUAL ne sont jamais évalués
    // (mission §23) : ils ne proviennent pas du DCE. Auto-cicatrisant — un item repassé CURRENT ici
    // s'il était STALE lors d'un reconcile antérieur (mission "self-healing", cohérent avec
    // `AnalysisFreshness`, jamais une cicatrice permanente).
    const now = this.clock.now();
    for (const item of existingItems) {
      if (item.origin === ChecklistItemOrigin.Manual) continue;
      const isCurrentlyMatched = matchedExistingItemIds.has(item.id) && !changedExistingItemIds.has(item.id);
      if (isCurrentlyMatched) {
        if (item.requirementFreshness !== "CURRENT") {
          item.confirmRequirementCurrent(now);
          await this.checklistRepository.save(item);
        }
      } else if (item.requirementFreshness !== "STALE") {
        item.markRequirementStale(now);
        await this.checklistRepository.save(item);
      }
    }

    await this.reconciliationRepository.upsert({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      analysisVersion,
      dceRevision: (await this.dceRepository.findByTenderId({ organizationId: command.organizationId, tenderId: command.tenderId }))?.revision,
      reconciledByUserId: command.actorId,
      occurredAt: now,
    });

    return { analysisVersion, newRequirementSuggestionsCreated, possibleChangeSuggestionsCreated, possibleRemovals, alreadyReconciled: false };
  }
}
