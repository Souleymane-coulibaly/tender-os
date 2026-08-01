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

// Réexportés pour permettre au module Generation (Sprint 6) de construire son contexte de
// génération à partir des constats d'analyse RÉELS (exigences, critères, risques, échéances,
// clauses, questions) — jamais une seconde lecture directe des tables d'Analysis, jamais une
// reconstruction approximative. Lecture seule : ces use cases s'auto-protègent déjà par
// `roleHasAnalysisPermission` en interne.
export { GetTenderBusinessAnalysisUseCase } from "./application/use-cases/get-tender-business-analysis.use-case";
export type { GetTenderBusinessAnalysisQuery } from "./application/use-cases/get-tender-business-analysis.use-case";
export { ListTenderCriteriaUseCase } from "./application/use-cases/list-tender-criteria.use-case";
export { ListTenderRequirementsUseCase } from "./application/use-cases/list-tender-requirements.use-case";
export { ListTenderRisksUseCase } from "./application/use-cases/list-tender-risks.use-case";
export { ListTenderDeadlinesUseCase } from "./application/use-cases/list-tender-deadlines.use-case";
export { ListTenderClausesUseCase } from "./application/use-cases/list-tender-clauses.use-case";
export { ListTenderQuestionsUseCase } from "./application/use-cases/list-tender-questions.use-case";
export type { ListTenderFindingsQuery, FindingsPageResult } from "./application/use-cases/list-tender-findings.shared";
export { TenderBusinessAnalysisNotFoundError } from "./domain/errors";

// Erreurs de bas niveau du provider IA, réexportées pour Generation (Sprint 6) — puisque Generation
// réutilise TEL QUEL `AIProviderRegistry`/`AIProvider` d'Analysis (décision A5, jamais un second
// adaptateur OpenAI), ce sont CES classes qui sont réellement levées par `.complete()`, jamais des
// classes d'erreur propres à Generation qui ne correspondraient à rien de réel.
export {
  AiProviderNotConfiguredError,
  AiProviderUnavailableError,
  AiAuthenticationFailedError,
  AiRateLimitedError,
  AiTimeoutError,
  AiInvalidResponseError,
} from "./domain/errors";
