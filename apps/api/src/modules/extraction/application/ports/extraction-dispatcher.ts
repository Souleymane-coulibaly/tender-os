export type ExtractionDispatchInput = Readonly<{
  organizationId: string;
  tenderId: string;
  dceId: string;
  documentId: string;
  requestId?: string | undefined;
}>;

/**
 * Découple la réponse HTTP du traitement réel (mission Sprint 3 §15 "Request extraction → Job
 * queued → Worker processes → Status updated → Result persisted") — aucune infra de file
 * d'attente n'existe dans ce projet (voir audit Sprint 2/3), donc `dispatch` ne garantit qu'un
 * déclenchement asynchrone, jamais une exécution synchrone dans la requête HTTP appelante.
 * `dispatch` ne doit jamais lancer d'exception vers l'appelant HTTP : toute erreur de traitement
 * est persistée par `ProcessDocumentExtractionUseCase` lui-même (voir `recordFailure`), jamais
 * remontée ici.
 */
export interface ExtractionDispatcher {
  dispatch(input: ExtractionDispatchInput): void;
}

export const EXTRACTION_DISPATCHER = Symbol("EXTRACTION_DISPATCHER");
