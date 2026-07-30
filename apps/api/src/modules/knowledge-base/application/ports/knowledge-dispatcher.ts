export type KnowledgeDocumentDispatchInput = Readonly<{
  organizationId: string;
  knowledgeDocumentId: string;
  requestId?: string | undefined;
}>;

/** Découple la réponse HTTP (202 Accepted) du traitement réel — même motif que
 *  `AnalysisDispatcher`/`ExtractionDispatcher` : aucune infra de file d'attente externe pour cette
 *  tranche. `dispatch` ne lance jamais d'exception vers l'appelant HTTP. */
export interface KnowledgeDispatcher {
  dispatch(input: KnowledgeDocumentDispatchInput): void;
}

export const KNOWLEDGE_DISPATCHER = Symbol("KNOWLEDGE_DISPATCHER");
