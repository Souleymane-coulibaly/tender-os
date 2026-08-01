export type GenerationDispatchInput = Readonly<{
  organizationId: string;
  generationId: string;
  requestId?: string | undefined;
}>;

/** Découple la réponse HTTP (202 Accepted) du traitement réel — même motif qu'`AnalysisDispatcher`.
 *  `dispatch` ne lance jamais d'exception vers l'appelant : toute erreur de traitement est
 *  persistée par `ProcessGenerationUseCase` lui-même, jamais remontée ici. */
export interface GenerationDispatcher {
  dispatch(input: GenerationDispatchInput): void;
}

export const GENERATION_DISPATCHER = Symbol("GENERATION_DISPATCHER");
