import { Global, Module } from "@nestjs/common";
import { AnalysisModule } from "../analysis/analysis.module";
import { AiSuggestionModule } from "../ai-suggestion";
import { TendersModule } from "../tenders/tenders.module";
import { TENDER_ANALYSIS_STATE_PROVIDER } from "../tenders/application/ports/tender-analysis-state-provider";
import { AnalysisTenderAnalysisStateProvider } from "./analysis-tender-analysis-state.provider";

/**
 * Checkpoint TENDEROS-2.1-POST-DECOM-TNR-FIX-1 (F-02) — pont `@Global()` entre `tenders` (possède
 * le port `TenderAnalysisStateProvider`, ne connaît jamais `analysis`) et `analysis` (autorité
 * réelle de la fraîcheur de consolidation). Même motif que `MembershipSeatLimitBridgeModule` /
 * `AiSuggestionBridgeModule` / `RoutingPolicyBridgeModule` déjà en place.
 *
 * `analysis.module.ts` importe déjà `TendersModule` : l'inverse créerait un cycle direct à deux
 * nœuds, d'où ce pont tiers plutôt qu'un import croisé ou un `forwardRef`.
 *
 * Si ce module n'est pas importé par `AppModule`, `GetTenderReadinessUseCase` retombe sur son
 * `@Optional()` et l'état vaut `UNKNOWN` : le score reste calculé mais ne peut jamais annoncer
 * READY. L'omission dégrade donc vers le conservateur, jamais vers l'optimiste — mais ce pont DOIT
 * être importé en production (même obligation que les ponts existants).
 */
@Global()
@Module({
  imports: [AnalysisModule, TendersModule, AiSuggestionModule],
  providers: [{ provide: TENDER_ANALYSIS_STATE_PROVIDER, useClass: AnalysisTenderAnalysisStateProvider }],
  exports: [TENDER_ANALYSIS_STATE_PROVIDER],
})
export class TenderAnalysisStateBridgeModule {}
