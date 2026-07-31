export type BenchmarkRunDispatchInput = Readonly<{
  organizationId: string;
  runId: string;
  requestId?: string | undefined;
}>;

/** Découple la réponse HTTP (202-like) du traitement réel — même motif que `AnalysisDispatcher`
 *  (mission Sprint 4.1, réutilisé tel quel) : aucune file d'attente externe, `dispatch` ne lève
 *  jamais vers l'appelant HTTP. */
export interface BenchmarkRunDispatcher {
  dispatch(input: BenchmarkRunDispatchInput): void;
}

export const BENCHMARK_RUN_DISPATCHER = Symbol("BENCHMARK_RUN_DISPATCHER");
