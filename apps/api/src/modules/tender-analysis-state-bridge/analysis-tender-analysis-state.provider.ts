import { Injectable } from "@nestjs/common";
import { GetEffectiveTenderAnalysisSummaryUseCase, TenderBusinessAnalysisNotFoundError } from "../analysis";
import { AiSuggestionEntityType, AiSuggestionStatus, ListAiSuggestionsUseCase } from "../ai-suggestion";
import type { TenderAnalysisReadinessState } from "../tenders/domain/readiness-calculator";
import type { TenderAnalysisStateProvider } from "../tenders/application/ports/tender-analysis-state-provider";

/**
 * Checkpoint TENDEROS-2.1-POST-DECOM-TNR-FIX-1 (F-02) — implémentation réelle du port
 * `TenderAnalysisStateProvider`.
 *
 * Ne recalcule RIEN : reprend telle quelle `EffectiveTenderAnalysisSummary.analysisFreshness`,
 * exactement la valeur que `GetTenderSubmissionReadinessUseCase` consomme déjà. Les deux readiness
 * (préparation et dépôt) lisent donc la MÊME source de vérité de fraîcheur — jamais deux calculs
 * susceptibles de diverger.
 *
 * L'absence d'analyse est un état métier normal (`MISSING`), jamais une erreur propagée. Une
 * fraîcheur indéterminable reste `UNKNOWN` : ni `CURRENT` ni `STALE` ne sont jamais inventés.
 */
@Injectable()
export class AnalysisTenderAnalysisStateProvider implements TenderAnalysisStateProvider {
  constructor(
    private readonly getEffectiveTenderAnalysisSummary: GetEffectiveTenderAnalysisSummaryUseCase,
    private readonly listAiSuggestions: ListAiSuggestionsUseCase,
  ) {}

  async getState(input: {
    organizationId: string;
    tenderId: string;
    actorRole: string;
    actorId: string;
  }): Promise<TenderAnalysisReadinessState> {
    try {
      const summary = await this.getEffectiveTenderAnalysisSummary.execute(input);
      if (summary.analysisFreshness === "CURRENT") return "CURRENT";
      if (summary.analysisFreshness === "STALE") return "STALE";
      return "UNKNOWN";
    } catch (error) {
      if (error instanceof TenderBusinessAnalysisNotFoundError) return "MISSING";
      throw error;
    }
  }

  /**
   * Checkpoint TENDEROS-2.1-POST-DECOM-TNR-FIX-2 (F-06) — compte les exigences OBLIGATOIRES encore
   * en attente de validation humaine, via le contrat PUBLIC de `ai-suggestion` (jamais une seconde
   * lecture directe de sa base). Le niveau d'exigence vit dans la charge utile de la suggestion,
   * telle que la reconciliation de checklist l'a ecrite.
   */
  async countPendingMandatoryRequirements(input: {
    organizationId: string;
    tenderId: string;
    actorRole: string;
    actorId: string;
  }): Promise<number> {
    const suggestions = await this.listAiSuggestions.execute({
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      parentTenderId: input.tenderId,
      entityType: AiSuggestionEntityType.ChecklistItem,
      status: AiSuggestionStatus.Pending,
    });
    return suggestions.filter((suggestion) => {
      const payload = suggestion.proposedValue as { requirementLevel?: unknown } | null | undefined;
      return payload?.requirementLevel === "MANDATORY";
    }).length;
  }
}
