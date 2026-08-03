/**
 * Port propre à Documents (mission Sprint 8A.2, correction "aucun déclencheur d'extraction") —
 * structurellement identique à `dce/application/ports/document-extraction-trigger.ts`, jamais un
 * import direct de ce dernier (créerait une dépendance `documents → dce` que rien ne justifie
 * fonctionnellement) — même principe "le port vit dans le module qui l'utilise" déjà pratiqué par
 * `generation/application/ports/routing-policy-resolver.ts` vis-à-vis d'`analysis`.
 *
 * `@Optional()` côté appelant (`AttachDocumentToTenderUseCase`) : si le pont Extraction n'est pas
 * câblé, l'attachement continue de fonctionner exactement comme avant.
 */
export interface DocumentExtractionTrigger {
  ensureExtractionTriggered(input: {
    organizationId: string;
    tenderId: string;
    documentId: string;
    actorId: string;
    requestId?: string | undefined;
  }): Promise<void>;
}

export const DOCUMENT_EXTRACTION_TRIGGER = Symbol("DOCUMENT_EXTRACTION_TRIGGER");
