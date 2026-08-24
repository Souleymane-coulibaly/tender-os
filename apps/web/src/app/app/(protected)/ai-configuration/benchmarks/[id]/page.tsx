import type { Metadata } from "next";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import {
  BENCHMARK_SUITE_STATUS_LABELS,
  PROMPT_KEY_LABELS,
  type AiModelSummary,
  type BenchmarkCaseSummary,
  type BenchmarkSuiteSummary,
} from "../../../../../../lib/ai-configuration-types";
import { isOrganizationAdmin } from "../../../../../../lib/authorization";
import { ApiErrorState } from "../../../api-error-state";
import { LaunchBenchmarkRunForm, PublishSuiteButton } from "./benchmark-suite-actions";

export const metadata: Metadata = { title: "Suite de benchmark — TenderOS" };

type SuiteDetailResponse = { suite: BenchmarkSuiteSummary; cases: BenchmarkCaseSummary[] };

// Checkpoint TENDEROS-2.1-P2.3-E6 — palier OWNER/ORGANIZATION_ADMIN converge vers lib/authorization.ts.
const canManageAi = isOrganizationAdmin;

export default async function BenchmarkSuiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let data: SuiteDetailResponse;
  let models: AiModelSummary[];
  let actorRole: string | undefined;
  try {
    [data, models, actorRole] = await Promise.all([
      appApiFetch<SuiteDetailResponse>(`/api/v1/ai-benchmark/suites/${id}`),
      appApiFetch<AiModelSummary[]>("/api/v1/ai-models?enabledForBenchmark=true"),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const { suite, cases } = data;
  const canManage = canManageAi(actorRole);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            {suite.name} <span className="text-neutral-500">· v{suite.version}</span>
          </h1>
          <p className="text-sm text-neutral-600">
            {PROMPT_KEY_LABELS[suite.promptKey]} · {BENCHMARK_SUITE_STATUS_LABELS[suite.status]} · {cases.length} cas
          </p>
          {suite.description ? <p className="mt-2 text-sm text-neutral-700">{suite.description}</p> : null}
        </div>
        {canManage && suite.status === "DRAFT" && cases.length > 0 ? <PublishSuiteButton suiteId={suite.id} /> : null}
      </div>

      {cases.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun cas dans cette suite pour l&apos;instant.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-4">Difficulté</th>
                <th className="py-2 pr-4">Langue</th>
                <th className="py-2 pr-4">Catégorie</th>
                <th className="py-2 pr-4">Créé le</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((benchmarkCase) => (
                <tr key={benchmarkCase.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4">{benchmarkCase.difficulty}</td>
                  <td className="py-2 pr-4">{benchmarkCase.language}</td>
                  <td className="py-2 pr-4">{benchmarkCase.businessCategory ?? "—"}</td>
                  <td className="py-2 pr-4 text-neutral-600">{new Date(benchmarkCase.createdAt).toLocaleDateString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && suite.status === "PUBLISHED" ? (
        <section className="flex flex-col gap-3 border-t border-neutral-200 pt-4">
          <h2 className="text-base font-semibold">Lancer un benchmark</h2>
          <LaunchBenchmarkRunForm suiteId={suite.id} models={models} />
        </section>
      ) : null}
    </div>
  );
}
