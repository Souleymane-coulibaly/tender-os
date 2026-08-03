import { Global, Injectable, Module } from "@nestjs/common";
import { DCE_DOCUMENT_EXTRACTION_TRIGGER, type DceDocumentExtractionTrigger } from "../../dce/application/ports/document-extraction-trigger";
import { DOCUMENT_EXTRACTION_TRIGGER, type DocumentExtractionTrigger } from "../../documents/application/ports/document-extraction-trigger";
import { ExtractionModule } from "../extraction.module";
import {
  AutoTriggerDocumentExtractionUseCase,
  type AutoTriggerDocumentExtractionCommand,
} from "../application/use-cases/auto-trigger-document-extraction.use-case";

/** Adaptateurs minces (mission "le port vit dans le consommateur") — chaque port garde son propre
 *  token/nom de méthode, tous deux délégués au MÊME use case système, jamais deux implémentations
 *  divergentes du déclenchement. */
@Injectable()
class DceExtractionTriggerAdapter implements DceDocumentExtractionTrigger {
  constructor(private readonly useCase: AutoTriggerDocumentExtractionUseCase) {}
  ensureExtractionTriggered(input: AutoTriggerDocumentExtractionCommand): Promise<void> {
    return this.useCase.execute(input);
  }
}

@Injectable()
class DocumentExtractionTriggerAdapter implements DocumentExtractionTrigger {
  constructor(private readonly useCase: AutoTriggerDocumentExtractionUseCase) {}
  ensureExtractionTriggered(input: AutoTriggerDocumentExtractionCommand): Promise<void> {
    return this.useCase.execute(input);
  }
}

/**
 * Pont `@Global()` entre DCE/Documents (qui définissent chacun leur propre port
 * `DceDocumentExtractionTrigger`/`DocumentExtractionTrigger`, mission Sprint 8A.2) et Extraction
 * (qui implémente le déclenchement réel via `AutoTriggerDocumentExtractionUseCase`) — même motif
 * exact que `RoutingPolicyBridgeModule` (ai-benchmark ↔ generation/analysis) : relie deux modules
 * sans jamais faire dépendre DCE ou Documents d'Extraction (import direct interdit, Extraction
 * dépend déjà de DCE et Documents — un cycle Nest). Si ce module n'est pas importé par
 * `AppModule`, `ImportDceFilesUseCase`/`AttachDocumentToTenderUseCase` reçoivent `undefined` pour
 * ces tokens (`@Optional()`) et se comportent comme avant Sprint 8A.2 — aucune régression
 * possible par omission, mais en production ce pont DOIT être importé (même obligation déjà en
 * vigueur pour `RoutingPolicyBridgeModule`) : sans lui, aucun document ne peut jamais être
 * analysé, exactement le bug que ce sprint corrige.
 */
@Global()
@Module({
  imports: [ExtractionModule],
  providers: [
    { provide: DCE_DOCUMENT_EXTRACTION_TRIGGER, useClass: DceExtractionTriggerAdapter },
    { provide: DOCUMENT_EXTRACTION_TRIGGER, useClass: DocumentExtractionTriggerAdapter },
  ],
  exports: [DCE_DOCUMENT_EXTRACTION_TRIGGER, DOCUMENT_EXTRACTION_TRIGGER],
})
export class ExtractionTriggerBridgeModule {}
