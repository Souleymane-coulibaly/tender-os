/**
 * Port propre à DCE (mission Sprint 8A.2, correction "aucun déclencheur d'extraction") — même
 * principe "le port vit dans le module qui l'utilise" déjà pratiqué par
 * `generation/application/ports/routing-policy-resolver.ts` : DCE ne dépend jamais directement du
 * module Extraction (créerait un cycle Nest, Extraction dépendant déjà de DCE). Un pont `@Global()`
 * côté Extraction (`ExtractionTriggerBridgeModule`) lie ce token à l'implémentation réelle.
 *
 * `@Optional()` côté appelant (`ImportDceFilesUseCase`) : si ce pont n'est pas câblé (tests
 * unitaires isolés, par exemple), l'import DCE continue de fonctionner exactement comme avant —
 * aucune régression par omission, même motif que `RoutingPolicyBridgeModule`.
 */
export interface DceDocumentExtractionTrigger {
  ensureExtractionTriggered(input: {
    organizationId: string;
    tenderId: string;
    documentId: string;
    actorId: string;
    requestId?: string | undefined;
  }): Promise<void>;
}

export const DCE_DOCUMENT_EXTRACTION_TRIGGER = Symbol("DCE_DOCUMENT_EXTRACTION_TRIGGER");
