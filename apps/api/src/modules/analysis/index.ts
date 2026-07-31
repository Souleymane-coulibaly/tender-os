export { AnalysisModule } from "./analysis.module";
export type { AnalysisJobSummary } from "./application/dtos";

// Réexportés pour permettre au module ai-benchmark de router/benchmarker au niveau des points de
// dispatch IA réels d'Analysis, sans jamais redéfinir ces concepts (Sprint 5.2 §"Réutilise les
// fondations AI Analysis") — même motif que le réexport de ClientPermission par client-portfolio.
export { PromptKey, PROMPT_VERSIONS } from "./application/ports/prompt-template.port";
export type { PromptVersion } from "./application/ports/prompt-template.port";
export { AnalysisProvider, isAnalysisProvider } from "./domain/analysis-provider";
export { AnalysisScope } from "./domain/analysis-scope";

// AIProvider/AIProviderRegistry réexportés pour le moteur de benchmark (Sprint 5.2) — un benchmark
// exécute un modèle via ce MÊME port, jamais un second chemin d'appel provider.
export { AI_PROVIDER_REGISTRY } from "./application/ports/ai-provider-registry";
export type { AIProviderRegistry } from "./application/ports/ai-provider-registry";
export type { AIProvider, AIProviderRequest, AIProviderResult, AIProviderUsage } from "./application/ports/ai-provider";
export { PROMPT_TEMPLATE } from "./application/ports/prompt-template.port";
export type { PromptTemplatePort, PromptVariables, RenderedPrompt } from "./application/ports/prompt-template.port";
export { EscalationCondition, isEscalationCondition } from "./domain/escalation-condition";
export { evaluateEscalationConditions } from "./domain/evaluate-escalation-conditions";
export type { EscalationSignals } from "./domain/evaluate-escalation-conditions";
