export type AiRoutingModelId = "GPT_5_4_MINI" | "GPT_5_4_NANO";

export type AiModelPreferenceSummary = {
  taskType: string;
  override: AiRoutingModelId | null;
  defaultModel: AiRoutingModelId;
  effectiveModel: AiRoutingModelId;
  allowedOverrides: readonly AiRoutingModelId[];
  effectiveModelLabel: string;
};

/** Checkpoint TENDEROS-2.1-P2.3-E4, mission §16 — courte, orientée usage, jamais de détails
 *  techniques (mission §17). */
export const AI_ROUTING_MODEL_LABELS: Record<AiRoutingModelId, { name: string; description: string }> = {
  GPT_5_4_MINI: { name: "GPT-5.4 mini", description: "Plus avancé — adapté aux analyses, raisonnements et rédactions." },
  GPT_5_4_NANO: { name: "GPT-5.4 nano", description: "Rapide et économique — adapté aux extractions et tâches simples." },
};

/**
 * Mission §16 — curation d'UI d'un sous-ensemble de TaskTypes réels, chacun avec un libellé
 * orienté fonctionnalité (jamais les 21 TaskTypes bruts, dont 16 variantes de rédaction quasi
 * identiques — mission "Adapter cette liste aux features réellement présentes"). Le backend, lui,
 * reste générique pour N'IMPORTE QUEL AiTaskType réel (`GET/PUT/DELETE /ai-routing/preferences`).
 */
export const CONFIGURABLE_AI_FEATURES: readonly { taskType: string; label: string }[] = [
  { taskType: "ANALYZE_DOCUMENT", label: "Analyse DCE (par document)" },
  { taskType: "CONSOLIDATE_TENDER_ANALYSIS", label: "Analyse DCE (consolidation)" },
  { taskType: "TECHNICAL_MEMO_SECTION", label: "Mémoire technique" },
  { taskType: "CHAT", label: "Chat IA" },
  { taskType: "SECTION_SUMMARY", label: "Résumé de section (génération)" },
  { taskType: "EXECUTIVE_SUMMARY", label: "Résumé exécutif (génération)" },
];
