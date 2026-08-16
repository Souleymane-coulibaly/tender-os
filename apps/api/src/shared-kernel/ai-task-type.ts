/**
 * Consolidation IA — Checkpoint A (Foundation). Source UNIQUE des identifiants de task type IA
 * routables — jusqu'ici dispersés entre `PromptKey` (Analyse, 2 valeurs), `GenerationTaskType`
 * (Génération, 17 valeurs) et `ROUTABLE_TASK_KEYS` (`ai-benchmark/interfaces/http/schemas.ts`, une
 * troisième liste resynchronisée à la main, explicitement documentée comme dupliquée pour éviter
 * une dépendance `ai-benchmark → generation`). Ce fichier devient la source que `ROUTABLE_TASK_KEYS`
 * importe désormais — élimine la duplication sans créer le cycle qu'elle évitait, puisque
 * `shared-kernel` n'a par construction aucun consommateur qui la consommerait en retour.
 *
 * `PromptKey`/`GenerationTaskType` restent INCHANGÉS : leur rôle (choisir quel template de prompt
 * charger) est une préoccupation différente du routing et n'est pas remplacé ici — seules leurs
 * VALEURS sont reproduites à l'identique (jamais un import inversé de ces modules, qui casserait la
 * direction de dépendance existante).
 *
 * `TECHNICAL_VALIDATION_PLACEHOLDER` (Analyse) est délibérément exclu — déjà documenté mort, jamais
 * rendu par aucun pipeline (mission "ne pas inventer de task type sans use case réel" : celui-ci n'en
 * a aucun). `CHAT` et `TECHNICAL_MEMO_SECTION` sont de nouveaux identifiants pour deux tâches qui
 * existaient déjà fonctionnellement mais n'avaient jamais eu de nom formel — nécessaires pour les
 * faire résoudre leur modèle via le même moteur de routing que Analyse/Génération (Checkpoint A §3).
 */
export const AI_TASK_TYPES = [
  // Analyse (2/2 identifiants vivants — miroir de PromptKey)
  "ANALYZE_DOCUMENT",
  "CONSOLIDATE_TENDER_ANALYSIS",
  // Génération (17/17 — miroir de GenerationTaskType)
  "EXECUTIVE_SUMMARY",
  "NEED_UNDERSTANDING",
  "CRITERION_RESPONSE",
  "METHODOLOGY",
  "ORGANIZATION",
  "GOVERNANCE",
  "HUMAN_RESOURCES",
  "TECHNICAL_RESOURCES",
  "PLANNING",
  "RISK_MANAGEMENT",
  "QUALITY",
  "SECURITY",
  "CSR",
  "REFERENCES",
  "SECTION_SUMMARY",
  "REPHRASING",
  "CONTENT_IMPROVEMENT",
  // Chat et Mémoire technique — nouveaux identifiants formels (Checkpoint A)
  "CHAT",
  "TECHNICAL_MEMO_SECTION",
] as const;

export type AiTaskType = (typeof AI_TASK_TYPES)[number];
