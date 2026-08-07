export { AiSuggestionModule } from "./ai-suggestion.module";
export { AiSuggestionEntityType, AI_SUGGESTION_ENTITY_TYPES } from "./domain/ai-suggestion-entity-type";
export { AiSuggestionStatus } from "./domain/ai-suggestion-status";
// V2 Sprint 4 (audit Codex P1-001) — réservé au verrou de statut PENDING<->APPLYING du bridge,
// jamais à une écriture de décision (voir le commentaire d'export dans ai-suggestion.module.ts).
export { AI_SUGGESTION_REPOSITORY } from "./application/ports/ai-suggestion.repository";
export type { AiSuggestionRepository } from "./application/ports/ai-suggestion.repository";
export {
  AiSuggestionInvalidProposedValueError,
  AiSuggestionNotFoundError,
  AiSuggestionSchemaNotRegisteredError,
} from "./domain/errors";
export { AiSuggestionFieldSchemaRegistry } from "./application/services/ai-suggestion-field-schema-registry";
export { AI_SUGGESTION_TARGET_ACCESS_POLICY } from "./application/ports/ai-suggestion-target-access-policy";
export type { AiSuggestionTargetAccessPolicy } from "./application/ports/ai-suggestion-target-access-policy";
export { CreateAiSuggestionUseCase } from "./application/use-cases/create-ai-suggestion.use-case";
export type { CreateAiSuggestionCommand } from "./application/use-cases/create-ai-suggestion.use-case";
export { ListAiSuggestionsUseCase } from "./application/use-cases/list-ai-suggestions.use-case";
export { GetAiSuggestionUseCase } from "./application/use-cases/get-ai-suggestion.use-case";
// V2 Sprint 4 — nécessaires à ai-suggestion-bridge (accepter/modifier/rejeter APRÈS avoir écrit
// la donnée métier réelle via le use case public du module cible).
export { AcceptAiSuggestionUseCase } from "./application/use-cases/accept-ai-suggestion.use-case";
export type { AcceptAiSuggestionCommand } from "./application/use-cases/accept-ai-suggestion.use-case";
export { ModifyAiSuggestionUseCase } from "./application/use-cases/modify-ai-suggestion.use-case";
export type { ModifyAiSuggestionCommand } from "./application/use-cases/modify-ai-suggestion.use-case";
export { RejectAiSuggestionUseCase } from "./application/use-cases/reject-ai-suggestion.use-case";
export type { RejectAiSuggestionCommand } from "./application/use-cases/reject-ai-suggestion.use-case";
export { AiSuggestionAlreadyProcessedError, AiSuggestionPermissionDeniedError } from "./domain/errors";
export type { AiSuggestionSummary } from "./application/dtos";
