/**
 * Abstraction minimale de gestion de prompts (mission Sprint 4.1 §"Prompts", étendue Sprint 4.2) —
 * préparée pour le futur Prompt Management complet (Sprint 6), volontairement statique/applicative
 * pour cette tranche : aucun écran d'administration, aucune édition dynamique, aucune table dédiée.
 *
 * Mission Sprint 4.2 §"Prompts" demande au minimum des clés équivalentes à
 * ANALYZE_DOCUMENT_METADATA/EXTRACT_DEADLINES/EXTRACT_CRITERIA/EXTRACT_REQUIREMENTS/
 * EXTRACT_CLAUSES (étape 1, un seul document) et DETECT_RISKS/GENERATE_QUESTIONS/
 * CONSOLIDATE_TENDER_ANALYSIS (étape 2, consolidation). Adapté à l'architecture réelle (mission
 * §"Adapter les noms à l'architecture réelle") : ces sous-catégories sont regroupées en DEUX
 * appels structurés (un par document, un par tender) plutôt que huit appels séparés — un
 * document/une consolidation ne nécessite qu'UNE tentative provider par réservation
 * (`AnalysisJob`/`AnalysisAttempt`, Sprint 4.1), jamais huit appels réseau distincts pour un seul
 * document. Sprint 6 (Prompt Management complet) pourra scinder ces deux prompts composites en
 * clés plus fines avec un versionnement indépendant si le besoin de caching/A-B testing par
 * sous-tâche se confirme — voir rapport §D.
 */
export const PromptKey = {
  /** Sprint 4.1 — purement technique, jamais une analyse métier. Conservé pour compatibilité,
   *  plus jamais rendu par le pipeline Sprint 4.2. */
  TechnicalValidationPlaceholder: "TECHNICAL_VALIDATION_PLACEHOLDER",
  /** Étape 1 (mission Sprint 4.2) — analyse d'UN document déjà extrait : informations générales,
   *  dates, critères, exigences, clauses (catégories 1 à 5). */
  AnalyzeDocument: "ANALYZE_DOCUMENT",
  /** Étape 2 (mission Sprint 4.2) — consolidation de plusieurs analyses documentaires au niveau
   *  Tender : déduplication, contradictions, détection de risques, génération de questions,
   *  synthèse structurée (catégories 6 à 8). */
  ConsolidateTenderAnalysis: "CONSOLIDATE_TENDER_ANALYSIS",
} as const;

export type PromptKey = (typeof PromptKey)[keyof typeof PromptKey];

export type PromptVersion = number;

/**
 * Version courante PAR CLÉ (mission §"tracer la version du prompt utilisé") — source de vérité
 * unique, utilisée à la fois par `Start*AnalysisUseCase` (capturée dans `AnalysisJob.promptVersion`
 * dès la création, avant tout rendu) et par `PromptTemplatePort.render`. Faire évoluer un prompt
 * n'incrémente plus jamais la version d'un autre prompt sans rapport (limite du
 * `CURRENT_PROMPT_VERSION` unique de Sprint 4.1, qui ne portait qu'un seul prompt).
 */
export const PROMPT_VERSIONS: Record<PromptKey, PromptVersion> = {
  [PromptKey.TechnicalValidationPlaceholder]: 1,
  [PromptKey.AnalyzeDocument]: 1,
  /** Checkpoint TENDEROS-2.1-POST-DECOM-TNR-FIX-1 (F-01, axe B) — 1 → 2 : les règles de provenance
   *  de la consolidation ont changé de contrat (recopie de la provenance documentaire déjà validée
   *  au lieu d'une citation rédigée par le modèle, impossible à satisfaire puisque le texte source
   *  ne lui est pas fourni). Le scope DOCUMENT n'est pas touché et garde sa version 1. */
  [PromptKey.ConsolidateTenderAnalysis]: 2,
};

export type PromptVariables = Readonly<Record<string, string>>;

export type RenderedPrompt = Readonly<{
  version: PromptVersion;
  systemPrompt: string;
  userPrompt: string;
}>;

export interface PromptTemplatePort {
  render(key: PromptKey, variables: PromptVariables): RenderedPrompt;
}

export const PROMPT_TEMPLATE = Symbol("PROMPT_TEMPLATE");
