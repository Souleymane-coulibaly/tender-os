import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../../lib/app-api-client";
import {
  BENCHMARK_RUN_STATUS_LABELS,
  benchmarkRunStatusBadgeClass,
  type AiModelSummary,
  type BenchmarkRunResults,
  type BenchmarkRunSummary,
} from "../../../../../../../lib/ai-configuration-types";
import { isOrganizationAdmin } from "../../../../../../../lib/authorization";
import { ApiErrorState } from "../../../../api-error-state";
import { CancelBenchmarkRunButton, GenerateRecommendationButton } from "./benchmark-run-actions";

export const metadata: Metadata = { title: "Résultats du benchmark — TenderOS" };

// Checkpoint TENDEROS-2.1-P2.3-E6 — palier OWNER/ORGANIZATION_ADMIN converge vers lib/authorization.ts.
const canManageAi = isOrganizationAdmin;

const NON_TERMINAL_STATUSES = new Set(["PENDING", "RUNNING"]);
const RECOMMENDABLE_STATUSES = new Set(["SUCCEEDED", "PARTIALLY_SUCCEEDED"]);

export default async function BenchmarkRunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;

  let run: BenchmarkRunSummary;
  let resultsData: BenchmarkRunResults;
  let models: AiModelSummary[];
  let actorRole: string | undefined;
  try {
    [run, resultsData, models, actorRole] = await Promise.all([
      appApiFetch<BenchmarkRunSummary>(`/api/v1/ai-benchmark/runs/${runId}`),
      appApiFetch<BenchmarkRunResults>(`/api/v1/ai-benchmark/runs/${runId}/results`),
      appApiFetch<AiModelSummary[]>("/api/v1/ai-models"),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const canManage = canManageAi(actorRole);
  const modelById = new Map(models.map((model) => [model.id, model]));
  const comparisons = [...resultsData.comparisons].sort(
    (a, b) => b.averageScore - a.averageScore || a.aiModelId.localeCompare(b.aiModelId),
  );
  const bestAdmissibleModelId = comparisons.find((comparison) => !comparison.eliminated)?.aiModelId;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Benchmark #{run.id.slice(0, 8)}</h1>
          <p className="text-sm text-neutral-600">
            Suite v{run.suiteVersion} · {run.repetitions} répétition(s) · lancé le {new Date(run.launchedAt).toLocaleString("fr-FR")}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${benchmarkRunStatusBadgeClass(run.status)}`}>
            {BENCHMARK_RUN_STATUS_LABELS[run.status]}
          </span>
          {canManage && NON_TERMINAL_STATUSES.has(run.status) ? <CancelBenchmarkRunButton runId={run.id} /> : null}
          {canManage && RECOMMENDABLE_STATUSES.has(run.status) ? <GenerateRecommendationButton runId={run.id} /> : null}
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Comparaison des modèles</h2>
        {comparisons.length === 0 ? (
          <p className="text-sm text-neutral-600">Aucun résultat disponible pour l&apos;instant.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-neutral-500">
                  <th className="py-2 pr-4">Modèle</th>
                  <th className="py-2 pr-4">Score</th>
                  <th className="py-2 pr-4">Coût moyen</th>
                  <th className="py-2 pr-4">Latence moyenne</th>
                  <th className="py-2 pr-4">Taux d&apos;échec</th>
                  <th className="py-2 pr-4">JSON invalide</th>
                  <th className="py-2 pr-4">Statut</th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map((comparison) => {
                  const model = modelById.get(comparison.aiModelId);
                  const isBest = comparison.aiModelId === bestAdmissibleModelId;
                  return (
                    <tr key={comparison.aiModelId} className={`border-b border-neutral-100 ${comparison.eliminated ? "opacity-60" : ""}`}>
                      <td className="py-2 pr-4 font-medium text-neutral-900">
                        {model?.displayName ?? comparison.aiModelId}
                        {isBest ? <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800">Meilleur</span> : null}
                      </td>
                      <td className="py-2 pr-4">{comparison.averageScore.toFixed(3)}</td>
                      <td className="py-2 pr-4">{comparison.averageCostAmount}</td>
                      <td className="py-2 pr-4">{Math.round(comparison.averageLatencyMs)} ms</td>
                      <td className="py-2 pr-4">{(comparison.failureRate * 100).toFixed(0)}%</td>
                      <td className="py-2 pr-4">{(comparison.invalidJsonRate * 100).toFixed(0)}%</td>
                      <td className="py-2 pr-4">
                        {comparison.eliminated ? (
                          <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">
                            Éliminé{comparison.eliminationReason ? ` — ${comparison.eliminationReason}` : ""}
                          </span>
                        ) : (
                          <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">Admissible</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-sm">
        <Link href="/app/ai-configuration/benchmarks" className="text-neutral-600 hover:underline">
          Retour aux suites de benchmark
        </Link>
      </p>
    </div>
  );
}
