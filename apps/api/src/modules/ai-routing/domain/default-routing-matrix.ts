import { AI_TASK_TYPES, type AiTaskType } from "../../../shared-kernel/ai-task-type";
import { AiRoutingModel } from "./ai-routing-model";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E4, mission §9 — LA matrice de routing par défaut, SOT unique.
 * Aucun module métier ne doit maintenir sa propre copie (mission §9) — `AiModelRouter` est le SEUL
 * lecteur de cette table.
 *
 * Classification (mission §6/§7, "compétence requise", jamais "utilise du JSON") — audité contre
 * les prompts RÉELS (`static-prompt-template.provider.ts` pour Analyse, tous deux exigent
 * classification, extraction avec provenance/confiance ET jugement métier — jamais une simple
 * extraction mécanique) :
 * - Les 2 task types Analyse (extraction structurée mais avec déduction/inférence, résolution de
 *   contradictions, évaluation de risques, recommandation GO/NO-GO) → MINI.
 * - CHAT, TECHNICAL_MEMO_SECTION → MINI (mission §7, exemples explicites).
 * - Les 17 task types Génération : rédaction de contenu substantiel pour une réponse à AO
 *   compétitive → MINI, À UNE EXCEPTION : SECTION_SUMMARY, qui compresse un contenu DÉJÀ RÉDIGÉ
 *   (résumé, pas composition) — correspond à "petites synthèses structurées" (mission §6, exemple
 *   explicite NANO), un genre d'opération structurellement différent des 16 autres (composition
 *   originale à partir d'exigences/contexte). REPHRASING reste MINI malgré son nom proche : mission
 *   §7 liste explicitement "reformulation professionnelle complexe" comme exemple MINI.
 *
 * Aucun consommateur réel aujourd'hui ne correspond aux autres exemples NANO du mission (§6 :
 * classification de document, extraction de métadonnées, ranking, tagging...) — `checklist-intelligence`
 * et `go-no-go` sont déterministes (aucun appel LLM), `extraction`/`dce` utilisent OCR/parsing, jamais
 * un LLM. Documenté explicitement dans le rapport final plutôt que force une tâche complexe vers
 * NANO pour satisfaire artificiellement un test.
 */
export const DEFAULT_ROUTING_MATRIX: Record<AiTaskType, AiRoutingModel> = {
  ANALYZE_DOCUMENT: AiRoutingModel.Gpt54Mini,
  CONSOLIDATE_TENDER_ANALYSIS: AiRoutingModel.Gpt54Mini,
  EXECUTIVE_SUMMARY: AiRoutingModel.Gpt54Mini,
  NEED_UNDERSTANDING: AiRoutingModel.Gpt54Mini,
  CRITERION_RESPONSE: AiRoutingModel.Gpt54Mini,
  METHODOLOGY: AiRoutingModel.Gpt54Mini,
  ORGANIZATION: AiRoutingModel.Gpt54Mini,
  GOVERNANCE: AiRoutingModel.Gpt54Mini,
  HUMAN_RESOURCES: AiRoutingModel.Gpt54Mini,
  TECHNICAL_RESOURCES: AiRoutingModel.Gpt54Mini,
  PLANNING: AiRoutingModel.Gpt54Mini,
  RISK_MANAGEMENT: AiRoutingModel.Gpt54Mini,
  QUALITY: AiRoutingModel.Gpt54Mini,
  SECURITY: AiRoutingModel.Gpt54Mini,
  CSR: AiRoutingModel.Gpt54Mini,
  REFERENCES: AiRoutingModel.Gpt54Mini,
  SECTION_SUMMARY: AiRoutingModel.Gpt54Nano,
  REPHRASING: AiRoutingModel.Gpt54Mini,
  CONTENT_IMPROVEMENT: AiRoutingModel.Gpt54Mini,
  CHAT: AiRoutingModel.Gpt54Mini,
  TECHNICAL_MEMO_SECTION: AiRoutingModel.Gpt54Mini,
};

/**
 * Mission §12/§36 — garde de compatibilité : quels modèles un utilisateur peut choisir pour CHAQUE
 * tâche. Un modèle absent de cette liste pour une tâche est refusé à l'écriture de la préférence
 * (`SetAiModelPreferenceUseCase`) ET ignoré à la lecture (`AiModelRouter.resolve`, défense en
 * profondeur si la matrice change après coup — mission §37) : jamais une dégradation silencieuse.
 * Toute tâche accepte implicitement son propre défaut ; SECTION_SUMMARY est la seule tâche où NANO
 * ET MINI sont tous deux compatibles (l'utilisateur peut consciemment upgrader une synthèse vers
 * plus de qualité) — toutes les autres tâches n'acceptent que MINI (jamais de repli vers NANO pour
 * une tâche qui en a été jugée incompatible).
 */
const NANO_AND_MINI: readonly AiRoutingModel[] = [AiRoutingModel.Gpt54Nano, AiRoutingModel.Gpt54Mini];
const MINI_ONLY: readonly AiRoutingModel[] = [AiRoutingModel.Gpt54Mini];

export const TASK_ALLOWED_OVERRIDES: Record<AiTaskType, readonly AiRoutingModel[]> = Object.fromEntries(
  AI_TASK_TYPES.map((taskType) => [taskType, taskType === "SECTION_SUMMARY" ? NANO_AND_MINI : MINI_ONLY] as const),
) as unknown as Record<AiTaskType, readonly AiRoutingModel[]>;

export function isOverrideCompatible(taskType: AiTaskType, model: AiRoutingModel): boolean {
  return TASK_ALLOWED_OVERRIDES[taskType].includes(model);
}
