export { AiSuggestionBridgeModule } from "./ai-suggestion-bridge.module";
export { ApplyAiSuggestionUseCase } from "./application/use-cases/apply-ai-suggestion.use-case";
export type { ApplyAiSuggestionCommand } from "./application/use-cases/apply-ai-suggestion.use-case";
export { ConflictResolution, CONFLICT_RESOLUTIONS } from "./domain/conflict-resolution";
export {
  AiSuggestionLotMismatchError,
  AiSuggestionMergeNotAllowedError,
  AiSuggestionTargetConflictError,
  UnsupportedAiSuggestionEntityTypeError,
} from "./domain/errors";
export {
  AI_SUGGESTION_ENTITY_TARGET_ADAPTER_REGISTRY,
  CREATE_FIELD_SENTINEL,
} from "./application/ports/entity-target-adapter";
export type {
  AiSuggestionEntityTargetAdapter,
  AiSuggestionEntityTargetAdapterRegistry,
} from "./application/ports/entity-target-adapter";
