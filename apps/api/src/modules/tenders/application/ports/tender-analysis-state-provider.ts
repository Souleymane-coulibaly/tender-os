import type { TenderAnalysisReadinessState } from "../../domain/readiness-calculator";

export const TENDER_ANALYSIS_STATE_PROVIDER = Symbol("TENDER_ANALYSIS_STATE_PROVIDER");

/**
 * Checkpoint TENDEROS-2.1-POST-DECOM-TNR-FIX-1 (F-02) — port par lequel le score de préparation
 * apprend si la consolidation du DCE est exploitable.
 *
 * `tenders` ne connaît jamais `analysis` : `analysis.module.ts` importe déjà `TendersModule`, un
 * import inverse créerait un cycle direct à deux nœuds. Le pont `@Global()`
 * `TenderAnalysisStateBridgeModule` lie les deux — même motif que
 * `MembershipSeatLimitBridgeModule`/`AiSuggestionBridgeModule` déjà en place.
 *
 * L'implémentation réelle ne recalcule JAMAIS la fraîcheur : elle reprend telle quelle
 * `EffectiveTenderAnalysisSummary.analysisFreshness`, la même valeur que consomme déjà la readiness
 * de DÉPÔT — une seule source de vérité pour les deux readiness.
 */
export interface TenderAnalysisStateProvider {
  getState(input: {
    organizationId: string;
    tenderId: string;
    actorRole: string;
    actorId: string;
  }): Promise<TenderAnalysisReadinessState>;

  /**
   * Checkpoint TENDEROS-2.1-POST-DECOM-TNR-FIX-2 (F-06) — nombre d'exigences OBLIGATOIRES detectees
   * par l'analyse qui attendent encore une validation humaine (suggestions `PENDING`).
   *
   * La reconciliation de checklist ne cree pas des items : elle cree des SUGGESTIONS, sans autorite
   * metier tant qu'un humain ne les a pas acceptees. Une checklist VIDE accompagnee de suggestions
   * obligatoires en attente ne signifie donc pas « aucune exigence obligatoire » mais « exigences
   * obligatoires detectees, pas encore confirmees » — une INCERTITUDE, que le score doit refleter
   * plutot que compter comme satisfaite.
   */
  countPendingMandatoryRequirements(input: {
    organizationId: string;
    tenderId: string;
    actorRole: string;
    actorId: string;
  }): Promise<number>;
}
