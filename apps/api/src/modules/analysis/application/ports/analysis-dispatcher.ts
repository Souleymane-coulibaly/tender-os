export type AnalysisDispatchInput = Readonly<{
  organizationId: string;
  jobId: string;
  requestId?: string | undefined;
}>;

/**
 * Découple la réponse HTTP (202 Accepted) du traitement réel — même motif que
 * `ExtractionDispatcher` (module Extraction, Sprint 3) : aucune infra de file d'attente externe
 * dans ce projet pour cette tranche (mission §"Ne mets pas en place BullMQ/RabbitMQ/Kafka/SQS sauf
 * nécessité déjà présente"). `dispatch` ne doit jamais lancer d'exception vers l'appelant HTTP :
 * toute erreur de traitement est persistée par `ProcessAnalysisJobUseCase` lui-même, jamais
 * remontée ici.
 */
export interface AnalysisDispatcher {
  dispatch(input: AnalysisDispatchInput): void;
}

export const ANALYSIS_DISPATCHER = Symbol("ANALYSIS_DISPATCHER");
