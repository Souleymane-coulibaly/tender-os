export type DceImportDispatchInput = Readonly<{
  organizationId: string;
  tenderId: string;
  jobId: string;
  actorId: string;
  actorRole: string;
  /** Le buffer ZIP brut n'est jamais persisté en base (voir StartDceZipImportUseCase) — transmis
   *  ici en mémoire, capturé en fermeture par le dispatcher in-process. */
  zipBuffer: Buffer;
  requestId?: string | undefined;
}>;

/** Découple la réponse HTTP du traitement réel (même motif que ExtractionDispatcher/
 *  GenerationDispatcher/AnalysisDispatcher) — `dispatch` ne garantit qu'un déclenchement
 *  asynchrone, jamais une exécution synchrone dans la requête HTTP appelante, et ne lève jamais :
 *  toute erreur de traitement est persistée sur le job lui-même. */
export interface DceImportDispatcher {
  dispatch(input: DceImportDispatchInput): void;
}

export const DCE_IMPORT_DISPATCHER = Symbol("DCE_IMPORT_DISPATCHER");
