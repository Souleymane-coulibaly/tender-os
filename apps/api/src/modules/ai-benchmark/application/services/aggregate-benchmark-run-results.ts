import { calculateRelativeCostLatencyEfficiency } from "../../domain/scoring/benchmark-score-calculator";
import { applyHardEliminationRules } from "../../domain/scoring/hard-elimination-rules";
import type { BenchmarkCaseResult } from "../../domain/benchmark-case-result.entity";
import type { BenchmarkRunModelComparison } from "../dtos";

/**
 * Classement par modèle (Sprint 5.2 §"Classement" + §"Seuils éliminatoires") — un modèle éliminé
 * conserve son score moyen dans la réponse (pour transparence) mais `eliminated: true` doit
 * toujours primer dans l'UI : jamais présenté comme "gagnant" (mission §"Ne pas présenter un modèle
 * comme gagnant s'il échoue à un seuil critique").
 *
 * `BenchmarkCaseResult.evaluationScore` ne porte que la composante QUALITÉ (poids cumulé 0.95, voir
 * `calculateGlobalScore(dimensions, 0)` à l'exécution) — la composante coût/latence (5%) est
 * intrinsèquement RELATIVE aux autres modèles du même run (mission §"un modèle moins cher ne doit
 * pas gagner automatiquement si sa qualité est insuffisante") et ne peut donc être ajoutée qu'ICI,
 * une fois tous les modèles du run connus.
 */
export function aggregateBenchmarkRunResultsByModel(results: readonly BenchmarkCaseResult[]): readonly BenchmarkRunModelComparison[] {
  const byModel = new Map<string, BenchmarkCaseResult[]>();
  for (const result of results) {
    const existing = byModel.get(result.aiModelId) ?? [];
    existing.push(result);
    byModel.set(result.aiModelId, existing);
  }

  type PerModelStats = {
    aiModelId: string;
    total: number;
    averageQualityScore: number;
    averageCost: number;
    averageLatencyMs: number;
    failureRate: number;
    invalidJsonRate: number;
    criticalHallucinationDetected: boolean;
    invalidProvenanceDetected: boolean;
  };

  const perModel: PerModelStats[] = [];
  for (const [aiModelId, modelResults] of byModel) {
    const total = modelResults.length;
    const failures = modelResults.filter((r) => r.errorCode !== undefined).length;
    const invalidJsonCount = modelResults.filter((r) => r.evaluationDetails.reason === "INVALID_JSON").length;

    perModel.push({
      aiModelId,
      total,
      averageQualityScore: total === 0 ? 0 : modelResults.reduce((sum, r) => sum + r.evaluationScore, 0) / total,
      averageCost: total === 0 ? 0 : modelResults.reduce((sum, r) => sum + Number(r.actualCostAmount ?? "0"), 0) / total,
      averageLatencyMs: total === 0 ? 0 : modelResults.reduce((sum, r) => sum + (r.durationMs ?? 0), 0) / total,
      failureRate: total === 0 ? 0 : failures / total,
      invalidJsonRate: total === 0 ? 0 : invalidJsonCount / total,
      criticalHallucinationDetected: modelResults.some((r) => r.eliminationSignal?.criticalHallucination === true),
      invalidProvenanceDetected: modelResults.some((r) => r.eliminationSignal?.invalidProvenance === true),
    });
  }

  const costs = perModel.map((m) => m.averageCost);
  const latencies = perModel.map((m) => m.averageLatencyMs);
  const minCost = Math.min(...costs);
  const maxCost = Math.max(...costs);
  const minLatencyMs = Math.min(...latencies);
  const maxLatencyMs = Math.max(...latencies);

  return perModel.map((m) => {
    const costLatencyEfficiency = calculateRelativeCostLatencyEfficiency({
      cost: m.averageCost,
      latencyMs: m.averageLatencyMs,
      minCost,
      maxCost,
      minLatencyMs,
      maxLatencyMs,
    });
    const finalScore = m.averageQualityScore + costLatencyEfficiency * 0.05;

    const eliminationReason = applyHardEliminationRules({
      tenantLeakageDetected: false, // jamais détecté par ce benchmark synthétique (voir plan §8)
      invalidProvenanceDetected: m.invalidProvenanceDetected,
      criticalHallucinationDetected: m.criticalHallucinationDetected,
      invalidJsonRate: m.invalidJsonRate,
      failureRate: m.failureRate,
      averageQualityScore: m.averageQualityScore,
    });

    return {
      aiModelId: m.aiModelId,
      averageScore: finalScore,
      averageCostAmount: m.averageCost.toFixed(6),
      averageLatencyMs: m.averageLatencyMs,
      failureRate: m.failureRate,
      invalidJsonRate: m.invalidJsonRate,
      eliminated: eliminationReason !== null,
      eliminationReason: eliminationReason ?? undefined,
      caseResultCount: m.total,
    };
  });
}
