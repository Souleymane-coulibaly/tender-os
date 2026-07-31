import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../lib/app-api-client";
import {
  BENCHMARK_SUITE_STATUS_LABELS,
  PROMPT_KEY_LABELS,
  type BenchmarkSuiteSummary,
} from "../../../../../lib/ai-configuration-types";
import { ApiErrorState } from "../../api-error-state";

export const metadata: Metadata = { title: "Configuration IA — Benchmarks — TenderOS" };

function canManageAi(actorRole: string | undefined): boolean {
  return actorRole === "OWNER" || actorRole === "ORGANIZATION_ADMIN";
}

export default async function BenchmarkSuitesListPage() {
  let suites: BenchmarkSuiteSummary[];
  let actorRole: string | undefined;
  try {
    [suites, actorRole] = await Promise.all([
      appApiFetch<BenchmarkSuiteSummary[]>("/api/v1/ai-benchmark/suites"),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const canManage = canManageAi(actorRole);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Suites de benchmark</h1>
          <p className="text-sm text-neutral-600">
            Corpus de cas de référence, strictement synthétiques, utilisés pour comparer les modèles autorisés.
          </p>
        </div>
        {canManage ? (
          <Link
            href="/app/ai-configuration/benchmarks/new"
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Nouvelle suite
          </Link>
        ) : null}
      </div>

      {suites.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucune suite de benchmark pour l&apos;instant.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-4">Nom</th>
                <th className="py-2 pr-4">Version</th>
                <th className="py-2 pr-4">Tâche</th>
                <th className="py-2 pr-4">Statut</th>
                <th className="py-2 pr-4">Cas</th>
              </tr>
            </thead>
            <tbody>
              {suites.map((suite) => (
                <tr key={suite.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4">
                    <Link href={`/app/ai-configuration/benchmarks/${suite.id}`} className="font-medium text-neutral-900 hover:underline">
                      {suite.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">v{suite.version}</td>
                  <td className="py-2 pr-4 text-neutral-600">{PROMPT_KEY_LABELS[suite.promptKey]}</td>
                  <td className="py-2 pr-4 text-neutral-600">{BENCHMARK_SUITE_STATUS_LABELS[suite.status]}</td>
                  <td className="py-2 pr-4 text-neutral-600">{suite.caseCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
